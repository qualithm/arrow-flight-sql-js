/**
 * Connection Pool for Arrow Flight SQL clients.
 *
 * Provides efficient connection reuse with:
 * - Configurable pool size limits
 * - Automatic connection health checking
 * - Idle connection timeout
 * - FIFO connection acquisition
 * - Graceful shutdown support
 */

import { FlightSqlClient } from "./client"
import { TimeoutError } from "./errors"
import type { RetryPolicy } from "./retry"
import { retryPolicies } from "./retry"
import type { FlightSqlClientOptions, PoolOptions, PoolStats } from "./types"

// Default pool configuration
const defaultPoolOptions: Required<PoolOptions> = {
  minConnections: 0,
  maxConnections: 10,
  idleTimeoutMs: 30_000,
  acquireTimeoutMs: 10_000,
  healthCheck: true,
  healthCheckIntervalMs: 30_000
}

/**
 * Internal state for a pooled connection
 */
interface PooledConnection {
  /** The Flight SQL client instance */
  client: FlightSqlClient
  /** Timestamp when connection was created */
  createdAt: number
  /** Timestamp when connection was last used */
  lastUsedAt: number
  /** Timestamp when connection was last health checked */
  lastHealthCheckAt: number
  /** Whether connection is currently in use */
  inUse: boolean
  /** Unique identifier for this connection */
  id: number
}

/**
 * Pending request waiting for a connection
 */
interface PendingRequest {
  resolve: (client: FlightSqlClient) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
  createdAt: number
}

/**
 * Connection pool for FlightSqlClient instances.
 *
 * Manages a pool of connections to a Flight SQL server, handling:
 * - Connection reuse to reduce overhead
 * - Automatic scaling between min and max connections
 * - Health checking to ensure connection validity
 * - Graceful shutdown with connection draining
 *
 * @example
 * ```typescript
 * const pool = new FlightSqlPool({
 *   host: "localhost",
 *   port: 50051,
 *   tls: false,
 *   auth: { type: "bearer", token: "my-token" }
 * }, {
 *   minConnections: 2,
 *   maxConnections: 10,
 *   idleTimeoutMs: 30000
 * })
 *
 * await pool.initialize()
 *
 * // Acquire a connection
 * const client = await pool.acquire()
 * try {
 *   const result = await client.query("SELECT 1")
 *   // Use result...
 * } finally {
 *   pool.release(client)
 * }
 *
 * // Or use withConnection for automatic release
 * await pool.withConnection(async (client) => {
 *   const result = await client.query("SELECT 1")
 *   // Use result...
 * })
 *
 * await pool.close()
 * ```
 */
export class FlightSqlPool {
  private readonly clientOptions: FlightSqlClientOptions
  private readonly poolOptions: Required<PoolOptions>
  private readonly retryPolicy: RetryPolicy

  private connections: PooledConnection[] = []
  private pendingRequests: PendingRequest[] = []
  private nextConnectionId = 1
  private initialized = false
  private closing = false
  private closed = false

  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    clientOptions: FlightSqlClientOptions,
    poolOptions: PoolOptions = {},
    retryPolicy: RetryPolicy = retryPolicies.default
  ) {
    this.clientOptions = clientOptions
    this.poolOptions = { ...defaultPoolOptions, ...poolOptions }
    this.retryPolicy = retryPolicy

    // Validate options
    if (this.poolOptions.minConnections > this.poolOptions.maxConnections) {
      throw new Error("minConnections cannot be greater than maxConnections")
    }
    if (this.poolOptions.minConnections < 0) {
      throw new Error("minConnections cannot be negative")
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Initialize the pool and create minimum connections.
   *
   * @throws {ConnectionError} If initial connections cannot be established
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    if (this.closed) {
      throw new Error("Pool has been closed")
    }

    // Create minimum connections in parallel
    const connectionPromises: Promise<void>[] = []
    for (let i = 0; i < this.poolOptions.minConnections; i++) {
      connectionPromises.push(this.createConnection())
    }

    try {
      await Promise.all(connectionPromises)
    } catch (error) {
      // Clean up any connections that were created
      await this.closeAllConnections()
      throw error
    }

    // Start health check timer if enabled
    if (this.poolOptions.healthCheck && this.poolOptions.healthCheckIntervalMs > 0) {
      this.healthCheckTimer = setInterval(
        () => void this.runHealthChecks(),
        this.poolOptions.healthCheckIntervalMs
      )
    }

    // Start idle connection cleanup timer
    if (this.poolOptions.idleTimeoutMs > 0) {
      this.idleCheckTimer = setInterval(
        () => void this.cleanupIdleConnections(),
        this.poolOptions.idleTimeoutMs / 2
      )
    }

    this.initialized = true
  }

  /**
   * Close the pool and all connections gracefully.
   * Waits for active connections to be released.
   *
   * @param forceTimeoutMs - Force close after this timeout (default: 30000)
   */
  async close(forceTimeoutMs = 30_000): Promise<void> {
    if (this.closed) {
      return
    }

    this.closing = true

    // Stop timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer)
      this.idleCheckTimer = null
    }

    // Reject all pending requests
    for (const request of this.pendingRequests) {
      clearTimeout(request.timeoutId)
      request.reject(new Error("Pool is closing"))
    }
    this.pendingRequests = []

    // Wait for active connections to be released
    const startTime = Date.now()
    while (this.connections.some((c) => c.inUse)) {
      if (Date.now() - startTime > forceTimeoutMs) {
        break // Force close after timeout
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Close all connections
    await this.closeAllConnections()

    this.closed = true
    this.initialized = false
  }

  /**
   * Check if the pool is initialized and ready
   */
  get isInitialized(): boolean {
    return this.initialized && !this.closing && !this.closed
  }

  /**
   * Check if the pool is closed
   */
  get isClosed(): boolean {
    return this.closed
  }

  // ===========================================================================
  // Connection Acquisition
  // ===========================================================================

  /**
   * Acquire a connection from the pool.
   *
   * @throws {TimeoutError} If no connection becomes available within acquireTimeoutMs
   * @throws {Error} If pool is closing or closed
   */
  async acquire(): Promise<FlightSqlClient> {
    if (this.closing || this.closed) {
      throw new Error("Pool is closing or closed")
    }

    if (!this.initialized) {
      await this.initialize()
    }

    // Try to get an idle connection
    const idleConnection = this.getIdleConnection()
    if (idleConnection) {
      idleConnection.inUse = true
      idleConnection.lastUsedAt = Date.now()
      return idleConnection.client
    }

    // Try to create a new connection if under limit
    if (this.connections.length < this.poolOptions.maxConnections) {
      try {
        await this.createConnection()
        const newConnection = this.getIdleConnection()
        if (newConnection) {
          newConnection.inUse = true
          newConnection.lastUsedAt = Date.now()
          return newConnection.client
        }
      } catch {
        // Failed to create connection, fall through to waiting
      }
    }

    // Wait for a connection to become available
    return this.waitForConnection()
  }

  /**
   * Release a connection back to the pool.
   *
   * @param client - The client to release
   */
  release(client: FlightSqlClient): void {
    const connection = this.connections.find((c) => c.client === client)
    if (!connection) {
      // Connection not from this pool or already removed
      return
    }

    connection.inUse = false
    connection.lastUsedAt = Date.now()

    // Check if there are pending requests waiting for a connection
    if (this.pendingRequests.length > 0) {
      const request = this.pendingRequests.shift()
      if (request) {
        clearTimeout(request.timeoutId)
        connection.inUse = true
        connection.lastUsedAt = Date.now()
        request.resolve(connection.client)
      }
    }
  }

  /**
   * Execute a function with a pooled connection, automatically releasing it.
   *
   * @param fn - Function to execute with the connection
   * @returns The result of the function
   *
   * @example
   * ```typescript
   * const result = await pool.withConnection(async (client) => {
   *   return await client.query("SELECT * FROM users")
   * })
   * ```
   */
  async withConnection<T>(fn: (client: FlightSqlClient) => Promise<T>): Promise<T> {
    const client = await this.acquire()
    try {
      return await fn(client)
    } finally {
      this.release(client)
    }
  }

  /**
   * Execute a function with retry logic and automatic connection management.
   *
   * @param fn - Function to execute
   * @returns The result of the function
   */
  async withRetry<T>(fn: (client: FlightSqlClient) => Promise<T>): Promise<T> {
    const result = await this.retryPolicy.execute(async () => {
      return this.withConnection(fn)
    })
    return result.value
  }

  // ===========================================================================
  // Pool Statistics
  // ===========================================================================

  /**
   * Get current pool statistics.
   */
  getStats(): PoolStats {
    return {
      totalConnections: this.connections.length,
      activeConnections: this.connections.filter((c) => c.inUse).length,
      idleConnections: this.connections.filter((c) => !c.inUse).length,
      pendingRequests: this.pendingRequests.length
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Create a new connection and add it to the pool
   */
  private async createConnection(): Promise<void> {
    const client = new FlightSqlClient(this.clientOptions)

    await this.retryPolicy.execute(async () => {
      await client.connect()
    })

    const now = Date.now()
    this.connections.push({
      client,
      createdAt: now,
      lastUsedAt: now,
      lastHealthCheckAt: now,
      inUse: false,
      id: this.nextConnectionId++
    })
  }

  /**
   * Get an idle connection from the pool
   */
  private getIdleConnection(): PooledConnection | undefined {
    // FIFO: Return the least recently used idle connection
    return this.connections.filter((c) => !c.inUse).sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0]
  }

  /**
   * Wait for a connection to become available
   */
  private waitForConnection(): Promise<FlightSqlClient> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.pendingRequests.findIndex((r) => r.timeoutId === timeoutId)
        if (index >= 0) {
          this.pendingRequests.splice(index, 1)
        }
        reject(
          new TimeoutError(
            `Timed out waiting for connection after ${String(this.poolOptions.acquireTimeoutMs)}ms`
          )
        )
      }, this.poolOptions.acquireTimeoutMs)

      this.pendingRequests.push({
        resolve,
        reject,
        timeoutId,
        createdAt: Date.now()
      })
    })
  }

  /**
   * Run health checks on idle connections
   */
  private async runHealthChecks(): Promise<void> {
    if (this.closing || this.closed) {
      return
    }

    const now = Date.now()
    const idleConnections = this.connections.filter(
      (c) => !c.inUse && now - c.lastHealthCheckAt > this.poolOptions.healthCheckIntervalMs
    )

    for (const connection of idleConnections) {
      try {
        // Simple health check: try to get flight info for empty command
        // This validates the connection is still alive
        connection.inUse = true
        await connection.client.listActions()
        connection.lastHealthCheckAt = Date.now()
        connection.inUse = false
      } catch {
        // Connection is unhealthy, remove it
        await this.removeConnection(connection)
      }
    }

    // Ensure minimum connections
    await this.ensureMinConnections()
  }

  /**
   * Clean up idle connections that have exceeded the timeout
   */
  private async cleanupIdleConnections(): Promise<void> {
    if (this.closing || this.closed) {
      return
    }

    const now = Date.now()
    const expiredConnections = this.connections.filter(
      (c) =>
        !c.inUse &&
        now - c.lastUsedAt > this.poolOptions.idleTimeoutMs &&
        this.connections.length > this.poolOptions.minConnections
    )

    for (const connection of expiredConnections) {
      // Only remove if we're still above minimum
      if (this.connections.length > this.poolOptions.minConnections) {
        await this.removeConnection(connection)
      }
    }
  }

  /**
   * Ensure minimum number of connections are maintained
   */
  private async ensureMinConnections(): Promise<void> {
    while (this.connections.length < this.poolOptions.minConnections) {
      try {
        await this.createConnection()
      } catch {
        // Failed to create connection, try again on next check
        break
      }
    }
  }

  /**
   * Remove a connection from the pool
   */
  private async removeConnection(connection: PooledConnection): Promise<void> {
    const index = this.connections.indexOf(connection)
    if (index >= 0) {
      this.connections.splice(index, 1)
    }

    try {
      // close() returns void but may be async internally
      connection.client.close()
      // Small delay to allow cleanup
      await new Promise((resolve) => setTimeout(resolve, 0))
    } catch {
      // Ignore close errors
    }
  }

  /**
   * Close all connections in the pool
   */
  private async closeAllConnections(): Promise<void> {
    const closePromises = this.connections.map(async (connection) => {
      try {
        // close() returns void but may be async internally
        connection.client.close()
        // Small delay to allow cleanup
        await new Promise((resolve) => setTimeout(resolve, 0))
      } catch {
        // Ignore close errors
      }
    })

    await Promise.all(closePromises)
    this.connections = []
  }
}

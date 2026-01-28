/**
 * Metrics and observability hooks for Arrow Flight SQL client.
 *
 * This module provides a flexible metrics interface that can be integrated
 * with various observability backends (OpenTelemetry, Prometheus, StatsD, etc.).
 *
 * @example
 * ```typescript
 * import { FlightSqlClient, ConsoleMetricsHandler } from "@qualithm/arrow-flight-sql-js"
 *
 * const client = new FlightSqlClient({
 *   host: "localhost",
 *   port: 50051,
 *   metrics: new ConsoleMetricsHandler()
 * })
 * ```
 */

// ============================================================================
// Metric Types
// ============================================================================

/**
 * Types of operations that can be measured
 */
export type OperationType =
  | "connect"
  | "close"
  | "handshake"
  | "query"
  | "execute"
  | "executeUpdate"
  | "prepare"
  | "getFlightInfo"
  | "getSchema"
  | "doGet"
  | "doPut"
  | "doAction"
  | "getCatalogs"
  | "getSchemas"
  | "getTables"
  | "getTableTypes"
  | "getPrimaryKeys"
  | "getExportedKeys"
  | "getImportedKeys"
  | "poolAcquire"
  | "poolRelease"
  | "healthCheck"
  | "retry"

/**
 * Status of an operation
 */
export type OperationStatus = "success" | "error" | "timeout" | "cancelled"

/**
 * Metric event emitted when an operation completes
 */
export interface MetricEvent {
  /** Type of operation */
  operation: OperationType

  /** Final status of the operation */
  status: OperationStatus

  /** Duration in milliseconds */
  durationMs: number

  /** Start timestamp (ms since epoch) */
  startTime: number

  /** End timestamp (ms since epoch) */
  endTime: number

  /** Error if status is not 'success' */
  error?: Error

  /** Additional metadata about the operation */
  metadata?: Record<string, string | number | boolean>
}

/**
 * Gauge metric for current values (like pool size)
 */
export interface GaugeEvent {
  /** Name of the gauge */
  name: string

  /** Current value */
  value: number

  /** Optional labels */
  labels?: Record<string, string>
}

/**
 * Counter metric for incrementing values
 */
export interface CounterEvent {
  /** Name of the counter */
  name: string

  /** Increment amount (default: 1) */
  increment: number

  /** Optional labels */
  labels?: Record<string, string>
}

// ============================================================================
// Metrics Handler Interface
// ============================================================================

/**
 * Interface for handling metrics events.
 *
 * Implement this interface to integrate with your observability backend.
 */
export interface MetricsHandler {
  /**
   * Record a timed operation metric
   */
  recordOperation(event: MetricEvent): void

  /**
   * Record a gauge value
   */
  recordGauge(event: GaugeEvent): void

  /**
   * Record a counter increment
   */
  recordCounter(event: CounterEvent): void

  /**
   * Called when the client is closed, allowing cleanup
   */
  close?(): void | Promise<void>
}

// ============================================================================
// Built-in Metrics Handlers
// ============================================================================

/**
 * No-op metrics handler that discards all metrics.
 * Used when no metrics handler is configured.
 */
export class NoopMetricsHandler implements MetricsHandler {
  recordOperation(_event: MetricEvent): void {
    // Intentionally empty
  }

  recordGauge(_event: GaugeEvent): void {
    // Intentionally empty
  }

  recordCounter(_event: CounterEvent): void {
    // Intentionally empty
  }
}

/**
 * Console-based metrics handler for development and debugging.
 * Logs all metrics to console with formatted output.
 */
export class ConsoleMetricsHandler implements MetricsHandler {
  private readonly prefix: string

  constructor(prefix = "[FlightSQL Metrics]") {
    this.prefix = prefix
  }

  recordOperation(event: MetricEvent): void {
    const statusEmoji = event.status === "success" ? "✓" : "✗"
    const message = `${this.prefix} ${statusEmoji} ${event.operation} ${event.status} (${String(event.durationMs)}ms)`

    if (event.status === "success") {
      console.log(message)
    } else {
      console.error(message, event.error?.message ?? "")
    }
  }

  recordGauge(event: GaugeEvent): void {
    const labels = event.labels ? ` ${JSON.stringify(event.labels)}` : ""
    console.log(`${this.prefix} [gauge] ${event.name}=${String(event.value)}${labels}`)
  }

  recordCounter(event: CounterEvent): void {
    const labels = event.labels ? ` ${JSON.stringify(event.labels)}` : ""
    console.log(`${this.prefix} [counter] ${event.name}+=${String(event.increment)}${labels}`)
  }
}

/**
 * In-memory metrics collector for testing and simple monitoring.
 * Stores metrics in memory and provides query methods.
 */
export class InMemoryMetricsHandler implements MetricsHandler {
  private readonly operations: MetricEvent[] = []
  private readonly gauges: Map<string, GaugeEvent> = new Map()
  private readonly counters: Map<string, number> = new Map()
  private readonly maxOperations: number

  constructor(options?: { maxOperations?: number }) {
    this.maxOperations = options?.maxOperations ?? 1000
  }

  recordOperation(event: MetricEvent): void {
    this.operations.push(event)

    // Keep memory bounded
    if (this.operations.length > this.maxOperations) {
      this.operations.shift()
    }
  }

  recordGauge(event: GaugeEvent): void {
    const key = this.makeKey(event.name, event.labels)
    this.gauges.set(key, event)
  }

  recordCounter(event: CounterEvent): void {
    const key = this.makeKey(event.name, event.labels)
    const current = this.counters.get(key) ?? 0
    this.counters.set(key, current + event.increment)
  }

  // =========================================================================
  // Query Methods
  // =========================================================================

  /**
   * Get all recorded operations
   */
  getOperations(): readonly MetricEvent[] {
    return this.operations
  }

  /**
   * Get operations filtered by type
   */
  getOperationsByType(operation: OperationType): MetricEvent[] {
    return this.operations.filter((e) => e.operation === operation)
  }

  /**
   * Get average duration for an operation type
   */
  getAverageDuration(operation: OperationType): number {
    const ops = this.getOperationsByType(operation)
    if (ops.length === 0) {
      return 0
    }
    return ops.reduce((sum, e) => sum + e.durationMs, 0) / ops.length
  }

  /**
   * Get error rate for an operation type
   */
  getErrorRate(operation: OperationType): number {
    const ops = this.getOperationsByType(operation)
    if (ops.length === 0) {
      return 0
    }
    const errors = ops.filter((e) => e.status !== "success").length
    return errors / ops.length
  }

  /**
   * Get current gauge value
   */
  getGauge(name: string, labels?: Record<string, string>): number | undefined {
    const key = this.makeKey(name, labels)
    return this.gauges.get(key)?.value
  }

  /**
   * Get current counter value
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.makeKey(name, labels)
    return this.counters.get(key) ?? 0
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalOperations: number
    successCount: number
    errorCount: number
    operationCounts: Record<string, number>
    averageDurations: Record<string, number>
  } {
    const operationCounts: Record<string, number> = {}
    const operationDurations: Record<string, number[]> = {}

    let successCount = 0
    let errorCount = 0

    for (const op of this.operations) {
      operationCounts[op.operation] = (operationCounts[op.operation] ?? 0) + 1

      operationDurations[op.operation] ??= []
      operationDurations[op.operation].push(op.durationMs)

      if (op.status === "success") {
        successCount++
      } else {
        errorCount++
      }
    }

    const averageDurations: Record<string, number> = {}
    for (const [op, durations] of Object.entries(operationDurations)) {
      averageDurations[op] = durations.reduce((a, b) => a + b, 0) / durations.length
    }

    return {
      totalOperations: this.operations.length,
      successCount,
      errorCount,
      operationCounts,
      averageDurations
    }
  }

  /**
   * Clear all stored metrics
   */
  clear(): void {
    this.operations.length = 0
    this.gauges.clear()
    this.counters.clear()
  }

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name
    }
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",")
    return `${name}{${sortedLabels}}`
  }
}

// ============================================================================
// Metrics Helper
// ============================================================================

/**
 * Helper class for timing operations and recording metrics
 */
export class MetricsTimer {
  private readonly handler: MetricsHandler
  private readonly operation: OperationType
  private readonly startTime: number
  private readonly metadata: Record<string, string | number | boolean>

  constructor(
    handler: MetricsHandler,
    operation: OperationType,
    metadata?: Record<string, string | number | boolean>
  ) {
    this.handler = handler
    this.operation = operation
    this.startTime = Date.now()
    this.metadata = metadata ?? {}
  }

  /**
   * Record success and return duration
   */
  success(additionalMetadata?: Record<string, string | number | boolean>): number {
    return this.record("success", undefined, additionalMetadata)
  }

  /**
   * Record error and return duration
   */
  error(err: Error, additionalMetadata?: Record<string, string | number | boolean>): number {
    return this.record("error", err, additionalMetadata)
  }

  /**
   * Record timeout and return duration
   */
  timeout(err?: Error, additionalMetadata?: Record<string, string | number | boolean>): number {
    return this.record("timeout", err, additionalMetadata)
  }

  /**
   * Record cancellation and return duration
   */
  cancelled(err?: Error, additionalMetadata?: Record<string, string | number | boolean>): number {
    return this.record("cancelled", err, additionalMetadata)
  }

  private record(
    status: OperationStatus,
    error?: Error,
    additionalMetadata?: Record<string, string | number | boolean>
  ): number {
    const endTime = Date.now()
    const durationMs = endTime - this.startTime

    this.handler.recordOperation({
      operation: this.operation,
      status,
      durationMs,
      startTime: this.startTime,
      endTime,
      error,
      metadata: { ...this.metadata, ...additionalMetadata }
    })

    return durationMs
  }
}

/**
 * Create a metrics timer for an operation
 */
export function startTimer(
  handler: MetricsHandler,
  operation: OperationType,
  metadata?: Record<string, string | number | boolean>
): MetricsTimer {
  return new MetricsTimer(handler, operation, metadata)
}

/**
 * Wrap an async function with metrics timing
 */
export async function withMetrics<T>(
  handler: MetricsHandler,
  operation: OperationType,
  fn: () => Promise<T>,
  metadata?: Record<string, string | number | boolean>
): Promise<T> {
  const timer = startTimer(handler, operation, metadata)

  try {
    const result = await fn()
    timer.success()
    return result
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TimeoutError") {
        timer.timeout(error)
      } else if (error.name === "CancelledError") {
        timer.cancelled(error)
      } else {
        timer.error(error)
      }
    } else {
      timer.error(new Error(String(error)))
    }
    throw error
  }
}

// ============================================================================
// Standard Metric Names
// ============================================================================

/**
 * Standard metric names for consistency
 */
export const MetricNames = {
  // Pool gauges
  poolTotalConnections: "flight_sql.pool.total_connections",
  poolActiveConnections: "flight_sql.pool.active_connections",
  poolIdleConnections: "flight_sql.pool.idle_connections",
  poolPendingRequests: "flight_sql.pool.pending_requests",

  // Counters
  queriesExecuted: "flight_sql.queries.executed",
  queriesSucceeded: "flight_sql.queries.succeeded",
  queriesFailed: "flight_sql.queries.failed",
  bytesReceived: "flight_sql.bytes.received",
  bytesSent: "flight_sql.bytes.sent",
  retriesAttempted: "flight_sql.retries.attempted",
  connectionsCreated: "flight_sql.connections.created",
  connectionsClosed: "flight_sql.connections.closed"
} as const

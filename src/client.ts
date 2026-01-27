/**
 * Arrow Flight SQL Client
 *
 * A TypeScript client for communicating with Arrow Flight SQL servers.
 * Modeled after the official Arrow Flight SQL clients (Java, C++, Go).
 */

import * as grpc from "@grpc/grpc-js"

import { AuthenticationError, ConnectionError, FlightSqlError } from "./errors"
import { getFlightServiceDefinition } from "./generated"
import type {
  Action,
  ActionResult,
  ActionType,
  AuthConfig,
  DescriptorType,
  ExecuteOptions,
  FlightDescriptor,
  FlightInfo,
  FlightSqlClientOptions,
  HandshakeResult,
  SchemaResult,
  Ticket
} from "./types"

// Default configuration values
const defaultConnectTimeoutMs = 30_000
const defaultRequestTimeoutMs = 60_000

/**
 * Flight SQL client for executing queries and managing data with Arrow Flight SQL servers.
 *
 * @example
 * ```typescript
 * const client = new FlightSqlClient({
 *   host: "localhost",
 *   port: 50051,
 *   tls: false,
 *   auth: { type: "bearer", token: "my-token" }
 * })
 *
 * await client.connect()
 *
 * const result = await client.execute("SELECT * FROM my_table")
 * for await (const batch of result.stream()) {
 *   console.log(batch.numRows)
 * }
 *
 * await client.close()
 * ```
 */
export class FlightSqlClient {
  private readonly options: Required<
    Pick<FlightSqlClientOptions, "host" | "port" | "tls" | "connectTimeoutMs" | "requestTimeoutMs">
  > &
    FlightSqlClientOptions

  private grpcClient: grpc.Client | null = null
  private flightService: grpc.ServiceClientConstructor | null = null
  private authToken: string | null = null
  private connected = false

  constructor(options: FlightSqlClientOptions) {
    this.options = {
      ...options,
      tls: options.tls !== false,
      port: options.port,
      connectTimeoutMs: options.connectTimeoutMs ?? defaultConnectTimeoutMs,
      requestTimeoutMs: options.requestTimeoutMs ?? defaultRequestTimeoutMs
    }
  }

  // ===========================================================================
  // Connection Lifecycle
  // ===========================================================================

  /**
   * Establish connection to the Flight SQL server and perform authentication.
   *
   * @throws {ConnectionError} If connection cannot be established
   * @throws {AuthenticationError} If authentication fails
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return
    }

    try {
      // Load the Flight service definition
      const packageDef = await getFlightServiceDefinition()

      // Navigate to arrow.flight.protocol.FlightService
      const arrowPackage = packageDef.arrow as grpc.GrpcObject
      const flightPackage = arrowPackage.flight as grpc.GrpcObject
      const protocolPackage = flightPackage.protocol as grpc.GrpcObject
      this.flightService = protocolPackage.FlightService as grpc.ServiceClientConstructor

      // Create channel credentials
      const credentials: grpc.ChannelCredentials =
        this.options.credentials !== undefined ? this.options.credentials : this.createCredentials()

      // Create the gRPC client
      const address = `${this.options.host}:${String(this.options.port)}`
      this.grpcClient = new this.flightService(address, credentials, {
        "grpc.max_receive_message_length": -1, // Unlimited
        "grpc.max_send_message_length": -1,
        "grpc.keepalive_time_ms": 30_000,
        "grpc.keepalive_timeout_ms": 10_000
      })

      // Wait for the channel to be ready
      await this.waitForReady()

      // Perform authentication handshake if configured
      if (this.options.auth && this.options.auth.type !== "none") {
        await this.authenticate(this.options.auth)
      }

      this.connected = true
    } catch (error) {
      this.cleanup()
      if (error instanceof FlightSqlError) {
        throw error
      }
      throw new ConnectionError(
        `Failed to connect to ${this.options.host}:${String(this.options.port)}`,
        {
          cause: error
        }
      )
    }
  }

  /**
   * Close the connection and release resources.
   */
  close(): void {
    this.cleanup()
  }

  /**
   * Check if the client is connected.
   */
  isConnected(): boolean {
    return this.connected
  }

  // ===========================================================================
  // Flight SQL Query Operations
  // ===========================================================================

  /**
   * Execute a SQL query and return flight info for retrieving results.
   *
   * @param query - SQL query string
   * @param options - Optional execution options
   * @returns FlightInfo containing endpoints for data retrieval
   */
  async execute(query: string, options?: ExecuteOptions): Promise<FlightInfo> {
    this.ensureConnected()
    // options will be used for transaction_id in future
    void options

    // Build CommandStatementQuery message
    const command = this.buildStatementQueryCommand(query)

    // Create FlightDescriptor with CMD type
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    return this.getFlightInfo(descriptor)
  }

  /**
   * Execute a SQL update statement (INSERT, UPDATE, DELETE).
   *
   * @param query - SQL statement
   * @param options - Optional execution options
   * @returns Number of rows affected
   */
  async executeUpdate(query: string, options?: ExecuteOptions): Promise<bigint> {
    this.ensureConnected()
    // options will be used for transaction_id in future
    void options

    // Build CommandStatementUpdate message
    const command = this.buildStatementUpdateCommand(query)

    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    // Execute via DoPut and extract affected row count
    const flightInfo = await this.getFlightInfo(descriptor)

    // For updates, the server typically returns the count in the first endpoint
    // We'll implement the full flow in a later milestone
    return flightInfo.totalRecords
  }

  // ===========================================================================
  // Core Flight Operations
  // ===========================================================================

  /**
   * Get flight information for a descriptor.
   *
   * @param descriptor - Flight descriptor
   * @returns FlightInfo with schema and endpoints
   */
  async getFlightInfo(descriptor: FlightDescriptor): Promise<FlightInfo> {
    this.ensureConnected()

    return new Promise((resolve, reject) => {
      const client = this.grpcClient as grpc.Client & {
        getFlightInfo: (
          request: unknown,
          metadata: grpc.Metadata,
          callback: (error: grpc.ServiceError | null, response: unknown) => void
        ) => void
      }

      const metadata = this.createRequestMetadata()
      const request = this.serializeFlightDescriptor(descriptor)

      client.getFlightInfo(request, metadata, (error, response) => {
        if (error) {
          reject(this.wrapGrpcError(error))
          return
        }
        resolve(this.parseFlightInfo(response))
      })
    })
  }

  /**
   * Get the schema for a flight descriptor without fetching data.
   *
   * @param descriptor - Flight descriptor
   * @returns Schema result
   */
  async getSchema(descriptor: FlightDescriptor): Promise<SchemaResult> {
    this.ensureConnected()

    return new Promise((resolve, reject) => {
      const client = this.grpcClient as grpc.Client & {
        getSchema: (
          request: unknown,
          metadata: grpc.Metadata,
          callback: (error: grpc.ServiceError | null, response: unknown) => void
        ) => void
      }

      const metadata = this.createRequestMetadata()
      const request = this.serializeFlightDescriptor(descriptor)

      client.getSchema(request, metadata, (error, response) => {
        if (error) {
          reject(this.wrapGrpcError(error))
          return
        }
        resolve(this.parseSchemaResult(response))
      })
    })
  }

  /**
   * Retrieve data for a ticket as an async iterator of FlightData.
   *
   * @param ticket - Ticket from FlightInfo endpoint
   * @yields FlightData chunks
   */
  async *doGet(ticket: Ticket): AsyncGenerator<Uint8Array, void, unknown> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      doGet: (request: unknown, metadata: grpc.Metadata) => grpc.ClientReadableStream<unknown>
    }

    const metadata = this.createRequestMetadata()
    const request = { ticket: ticket.ticket }

    const stream = client.doGet(request, metadata)

    try {
      for await (const data of this.wrapStream(stream)) {
        const flightData = data as { dataBody?: Uint8Array; dataHeader?: Uint8Array }
        if (flightData.dataBody) {
          yield flightData.dataBody
        }
      }
    } finally {
      stream.cancel()
    }
  }

  /**
   * Execute an action on the server.
   *
   * @param action - Action to execute
   * @returns Async iterator of results
   */
  async *doAction(action: Action): AsyncGenerator<ActionResult, void, unknown> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      doAction: (request: unknown, metadata: grpc.Metadata) => grpc.ClientReadableStream<unknown>
    }

    const metadata = this.createRequestMetadata()
    const request = { type: action.type, body: action.body }

    const stream = client.doAction(request, metadata)

    try {
      for await (const result of this.wrapStream(stream)) {
        yield result as ActionResult
      }
    } finally {
      stream.cancel()
    }
  }

  /**
   * List available action types.
   *
   * @returns Array of available action types
   */
  async listActions(): Promise<ActionType[]> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      listActions: (request: unknown, metadata: grpc.Metadata) => grpc.ClientReadableStream<unknown>
    }

    const metadata = this.createRequestMetadata()
    const stream = client.listActions({}, metadata)

    const actions: ActionType[] = []
    for await (const action of this.wrapStream(stream)) {
      actions.push(action as ActionType)
    }

    return actions
  }

  // ===========================================================================
  // Private: Authentication
  // ===========================================================================

  private async authenticate(auth: AuthConfig): Promise<void> {
    switch (auth.type) {
      case "none":
        return

      case "bearer":
        // For bearer tokens, we just store the token to include in metadata
        this.authToken = auth.token
        return

      case "basic": {
        // Perform handshake with basic auth
        const result = await this.handshake(auth.username, auth.password)

        // Extract bearer token from response payload if present
        const payloadStr = new TextDecoder().decode(result.payload)
        if (payloadStr) {
          this.authToken = payloadStr
        }
        break
      }
    }
  }

  private async handshake(username: string, password: string): Promise<HandshakeResult> {
    return new Promise((resolve, reject) => {
      const client = this.grpcClient as grpc.Client & {
        handshake: () => grpc.ClientDuplexStream<unknown, unknown>
      }

      const stream = client.handshake()

      // Build BasicAuth payload
      const authPayload = this.encodeBasicAuth(username, password)

      stream.on("data", (response: { protocolVersion?: string; payload?: Uint8Array }) => {
        resolve({
          protocolVersion: BigInt(response.protocolVersion ?? "0"),
          payload: response.payload ?? new Uint8Array()
        })
      })

      stream.on("error", (error: Error) => {
        reject(new AuthenticationError("Handshake failed", { cause: error }))
      })

      stream.on("end", () => {
        // Stream ended without response
      })

      // Send handshake request
      stream.write({
        protocolVersion: "1",
        payload: authPayload
      })

      stream.end()
    })
  }

  private encodeBasicAuth(username: string, password: string): Uint8Array {
    // Simple encoding: "username:password" as UTF-8 bytes
    // The actual Flight protocol uses protobuf BasicAuth message
    const encoder = new TextEncoder()
    return encoder.encode(`${username}:${password}`)
  }

  // ===========================================================================
  // Private: gRPC Helpers
  // ===========================================================================

  private createCredentials(): grpc.ChannelCredentials {
    if (this.options.tls) {
      return grpc.credentials.createSsl()
    }
    return grpc.credentials.createInsecure()
  }

  private async waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + this.options.connectTimeoutMs
      const client = this.grpcClient
      if (!client) {
        reject(new ConnectionError("gRPC client not initialized"))
        return
      }

      client.waitForReady(deadline, (error) => {
        if (error) {
          reject(new ConnectionError("Connection timeout", { cause: error }))
        } else {
          resolve()
        }
      })
    })
  }

  private createRequestMetadata(): grpc.Metadata {
    const metadata = new grpc.Metadata()

    // Add auth token if present
    if (this.authToken) {
      metadata.set("authorization", `Bearer ${this.authToken}`)
    }

    // Add custom metadata from options
    if (this.options.metadata) {
      for (const [key, value] of Object.entries(this.options.metadata)) {
        metadata.set(key, value)
      }
    }

    return metadata
  }

  private cleanup(): void {
    if (this.grpcClient) {
      this.grpcClient.close()
      this.grpcClient = null
    }
    this.flightService = null
    this.authToken = null
    this.connected = false
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new ConnectionError("Client is not connected. Call connect() first.")
    }
  }

  private wrapGrpcError(error: grpc.ServiceError): FlightSqlError {
    const message = error.details || error.message

    switch (error.code) {
      case grpc.status.UNAUTHENTICATED:
        return new AuthenticationError(message, { cause: error })
      case grpc.status.UNAVAILABLE:
      case grpc.status.DEADLINE_EXCEEDED:
        return new ConnectionError(message, { cause: error })
      default:
        return new FlightSqlError(message, { cause: error })
    }
  }

  // ===========================================================================
  // Private: Streaming Helpers
  // ===========================================================================

  /**
   * Wraps a gRPC stream to convert errors to FlightSqlError types.
   * gRPC streams are already async iterable, so we just need error handling.
   */
  private async *wrapStream<T>(
    stream: grpc.ClientReadableStream<T>
  ): AsyncGenerator<T, void, unknown> {
    try {
      for await (const data of stream) {
        yield data
      }
    } catch (error) {
      throw this.wrapGrpcError(error as grpc.ServiceError)
    }
  }

  // ===========================================================================
  // Private: Serialization Helpers
  // ===========================================================================

  private serializeFlightDescriptor(descriptor: FlightDescriptor): Record<string, unknown> {
    return {
      type: descriptor.type,
      cmd: descriptor.cmd,
      path: descriptor.path
    }
  }

  private parseFlightInfo(response: unknown): FlightInfo {
    const info = response as {
      schema?: Uint8Array
      flightDescriptor?: { type: number; cmd?: Uint8Array; path?: string[] }
      endpoint?: Array<{
        ticket?: { ticket: Uint8Array }
        location?: Array<{ uri: string }>
        expirationTime?: { seconds: string; nanos: number }
        appMetadata?: Uint8Array
      }>
      totalRecords?: string
      totalBytes?: string
      ordered?: boolean
      appMetadata?: Uint8Array
    }

    return {
      schema: info.schema ?? new Uint8Array(),
      flightDescriptor: info.flightDescriptor
        ? {
            type: info.flightDescriptor.type as DescriptorType,
            cmd: info.flightDescriptor.cmd,
            path: info.flightDescriptor.path
          }
        : undefined,
      endpoints: (info.endpoint ?? []).map((ep) => ({
        ticket: { ticket: ep.ticket?.ticket ?? new Uint8Array() },
        locations: (ep.location ?? []).map((loc) => ({ uri: loc.uri })),
        expirationTime: ep.expirationTime
          ? new Date(Number(ep.expirationTime.seconds) * 1000 + ep.expirationTime.nanos / 1_000_000)
          : undefined,
        appMetadata: ep.appMetadata
      })),
      totalRecords: BigInt(info.totalRecords ?? "-1"),
      totalBytes: BigInt(info.totalBytes ?? "-1"),
      ordered: info.ordered ?? false,
      appMetadata: info.appMetadata
    }
  }

  private parseSchemaResult(response: unknown): SchemaResult {
    const result = response as { schema?: Uint8Array }
    return {
      schema: result.schema ?? new Uint8Array()
    }
  }

  // ===========================================================================
  // Private: Flight SQL Command Builders
  // ===========================================================================

  private buildStatementQueryCommand(query: string): Uint8Array {
    // CommandStatementQuery message structure:
    // - query: string
    // - transaction_id: bytes (optional)
    //
    // For now, we encode as a simple JSON until we add proper protobuf encoding
    // TODO: Use protobuf encoding for CommandStatementQuery
    const command = {
      query,
      // Type URL for CommandStatementQuery
      "@type": "type.googleapis.com/arrow.flight.protocol.sql.CommandStatementQuery"
    }
    return new TextEncoder().encode(JSON.stringify(command))
  }

  private buildStatementUpdateCommand(query: string): Uint8Array {
    const command = {
      query,
      "@type": "type.googleapis.com/arrow.flight.protocol.sql.CommandStatementUpdate"
    }
    return new TextEncoder().encode(JSON.stringify(command))
  }
}

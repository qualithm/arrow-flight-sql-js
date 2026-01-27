/**
 * Arrow Flight SQL Client
 *
 * A TypeScript client for communicating with Arrow Flight SQL servers.
 * Modeled after the official Arrow Flight SQL clients (Java, C++, Go).
 */

import * as grpc from "@grpc/grpc-js"
import type { RecordBatch, Schema, Table } from "apache-arrow"

import { collectToTable, parseFlightData, tryParseSchema } from "./arrow"
import { AuthenticationError, ConnectionError, FlightSqlError } from "./errors"
import { getFlightServiceDefinition } from "./generated"
import {
  encodeActionClosePreparedStatementRequest,
  encodeActionCreatePreparedStatementRequest,
  encodeCommandPreparedStatementQuery,
  encodeCommandStatementQuery,
  encodeCommandStatementUpdate,
  getBytesField,
  parseProtoFields
} from "./proto"
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
   * Execute a SQL query and return a QueryResult for retrieving results.
   *
   * @param query - SQL query string
   * @param options - Optional execution options
   * @returns QueryResult with stream() and collect() methods
   *
   * @example
   * ```typescript
   * const result = await client.query("SELECT * FROM users")
   *
   * // Stream record batches
   * for await (const batch of result.stream()) {
   *   console.log(batch.numRows)
   * }
   *
   * // Or collect all into a table
   * const table = await result.collect()
   * ```
   */
  async query(query: string, options?: ExecuteOptions): Promise<QueryResult> {
    this.ensureConnected()

    // Build CommandStatementQuery with proper protobuf encoding
    const command = encodeCommandStatementQuery(query, options?.transactionId)

    // Create FlightDescriptor with CMD type
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    const schema = tryParseSchema(flightInfo.schema)

    return new QueryResult(this, flightInfo, schema)
  }

  /**
   * Execute a SQL query and return flight info for retrieving results.
   * @deprecated Use query() instead for a more ergonomic API
   *
   * @param query - SQL query string
   * @param options - Optional execution options
   * @returns FlightInfo containing endpoints for data retrieval
   */
  async execute(query: string, options?: ExecuteOptions): Promise<FlightInfo> {
    this.ensureConnected()

    // Build CommandStatementQuery with proper protobuf encoding
    const command = encodeCommandStatementQuery(query, options?.transactionId)

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

    // Build CommandStatementUpdate with proper protobuf encoding
    const command = encodeCommandStatementUpdate(query, options?.transactionId)

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

  /**
   * Create a prepared statement for repeated execution.
   *
   * @param query - SQL query with optional parameter placeholders
   * @param options - Optional prepared statement options
   * @returns PreparedStatement that can be executed multiple times
   *
   * @example
   * ```typescript
   * const stmt = await client.prepare("SELECT * FROM users WHERE id = ?")
   * const result = await stmt.executeQuery()
   * await stmt.close()
   * ```
   */
  async prepare(query: string, options?: ExecuteOptions): Promise<PreparedStatement> {
    this.ensureConnected()

    // Use CreatePreparedStatement action
    const actionBody = encodeActionCreatePreparedStatementRequest(query, options?.transactionId)
    const action: Action = {
      type: "CreatePreparedStatement",
      body: actionBody
    }

    // Execute the action and parse the response
    let handle: Uint8Array | undefined
    let datasetSchema: Schema | null = null
    let parameterSchema: Schema | null = null

    for await (const result of this.doAction(action)) {
      // Parse ActionCreatePreparedStatementResult
      // Fields:
      //   1: prepared_statement_handle (bytes)
      //   2: dataset_schema (bytes) - Arrow IPC schema
      //   3: parameter_schema (bytes) - Arrow IPC schema
      const fields = parseProtoFields(result.body)

      handle = getBytesField(fields, 1)
      const datasetSchemaBytes = getBytesField(fields, 2)
      const parameterSchemaBytes = getBytesField(fields, 3)

      if (datasetSchemaBytes && datasetSchemaBytes.length > 0) {
        datasetSchema = tryParseSchema(datasetSchemaBytes)
      }

      if (parameterSchemaBytes && parameterSchemaBytes.length > 0) {
        parameterSchema = tryParseSchema(parameterSchemaBytes)
      }

      break // Only expect one result
    }

    if (!handle) {
      throw new FlightSqlError("Failed to create prepared statement: no handle returned")
    }

    return new PreparedStatement(this, handle, datasetSchema, parameterSchema)
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
   * Upload Arrow data to the server.
   *
   * @param descriptor - Flight descriptor describing the data
   * @param dataStream - Async iterable of FlightData messages
   * @returns Async iterator of PutResult messages
   */
  async *doPut(
    descriptor: FlightDescriptor,
    dataStream: AsyncIterable<{
      dataHeader: Uint8Array
      dataBody: Uint8Array
      appMetadata?: Uint8Array
    }>
  ): AsyncGenerator<{ appMetadata?: Uint8Array }, void, unknown> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      doPut: (metadata: grpc.Metadata) => grpc.ClientDuplexStream<unknown, unknown>
    }

    const requestMetadata = this.createRequestMetadata()

    // Create bidirectional stream
    const stream = client.doPut(requestMetadata)

    // Use object wrapper to track errors (allows TypeScript to understand mutation)
    const errorState = { error: null as Error | null }
    stream.on("error", (err: Error) => {
      errorState.error = err
    })

    // Send the first message with the descriptor
    const firstData = await this.getFirstFromIterable(dataStream)
    if (firstData) {
      stream.write({
        flightDescriptor: this.serializeFlightDescriptor(descriptor),
        dataHeader: firstData.dataHeader,
        dataBody: firstData.dataBody,
        appMetadata: firstData.appMetadata
      })
    }

    // Send remaining data
    for await (const data of dataStream) {
      if (errorState.error) {
        throw this.wrapGrpcError(errorState.error as grpc.ServiceError)
      }

      stream.write({
        dataHeader: data.dataHeader,
        dataBody: data.dataBody,
        appMetadata: data.appMetadata
      })
    }

    // Signal end of writing
    stream.end()

    // Read responses
    try {
      for await (const result of this.wrapStream(stream)) {
        const putResult = result as { appMetadata?: Uint8Array }
        yield { appMetadata: putResult.appMetadata }
      }
    } catch (error) {
      if (errorState.error) {
        throw this.wrapGrpcError(errorState.error as grpc.ServiceError)
      }
      throw error
    }
  }

  /**
   * Helper to get the first item from an async iterable without consuming the rest
   */
  private async getFirstFromIterable<T>(iterable: AsyncIterable<T>): Promise<T | undefined> {
    const iterator = iterable[Symbol.asyncIterator]()
    const result = await iterator.next()
    return result.done ? undefined : result.value
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
}

// ============================================================================
// QueryResult
// ============================================================================

/**
 * Result of a query execution with methods to stream or collect data.
 *
 * @example
 * ```typescript
 * const result = await client.query("SELECT * FROM users")
 *
 * // Option 1: Stream record batches (memory efficient)
 * for await (const batch of result.stream()) {
 *   console.log(`Batch with ${batch.numRows} rows`)
 * }
 *
 * // Option 2: Collect all data into a table
 * const table = await result.collect()
 * console.log(`Total rows: ${table.numRows}`)
 * ```
 */
export class QueryResult {
  private readonly client: FlightSqlClient
  private readonly info: FlightInfo
  private readonly parsedSchema: Schema | null

  constructor(client: FlightSqlClient, flightInfo: FlightInfo, schema: Schema | null) {
    this.client = client
    this.info = flightInfo
    this.parsedSchema = schema
  }

  /**
   * Get the FlightInfo for this query result
   */
  get flightInfo(): FlightInfo {
    return this.info
  }

  /**
   * Get the Arrow schema for this query result
   * May be null if schema could not be parsed
   */
  get schema(): Schema | null {
    return this.parsedSchema
  }

  /**
   * Get the total number of records (if known)
   * Returns -1 if unknown
   */
  get totalRecords(): bigint {
    return this.info.totalRecords
  }

  /**
   * Stream record batches from all endpoints.
   * This is memory-efficient for large result sets.
   */
  async *stream(): AsyncGenerator<RecordBatch, void, unknown> {
    if (!this.parsedSchema) {
      throw new FlightSqlError("Cannot stream results: schema not available")
    }

    for (const endpoint of this.info.endpoints) {
      for await (const data of this.client.doGet(endpoint.ticket)) {
        // Parse the FlightData into a RecordBatch
        const flightData = data as { dataHeader?: Uint8Array; dataBody?: Uint8Array }
        if (flightData.dataHeader && flightData.dataBody) {
          const batch = parseFlightData(
            flightData.dataHeader,
            flightData.dataBody,
            this.parsedSchema
          )
          if (batch) {
            yield batch
          }
        }
      }
    }
  }

  /**
   * Collect all data from all endpoints into a single Table.
   * Warning: This loads the entire result set into memory.
   */
  async collect(): Promise<Table> {
    const batches: RecordBatch[] = []

    for await (const batch of this.stream()) {
      batches.push(batch)
    }

    if (!this.parsedSchema) {
      throw new FlightSqlError("Cannot collect results: schema not available")
    }

    return collectToTable(this.streamBatches(batches), this.parsedSchema)
  }

  /**
   * Helper to convert batches array to async generator
   */
  private *streamBatches(batches: RecordBatch[]): Generator<RecordBatch, void, unknown> {
    for (const batch of batches) {
      yield batch
    }
  }
}

// ============================================================================
// PreparedStatement
// ============================================================================

/**
 * A prepared statement that can be executed multiple times with different parameters.
 *
 * @example
 * ```typescript
 * const stmt = await client.prepare("SELECT * FROM users WHERE id = ?")
 *
 * // Execute with parameters
 * const result = await stmt.execute()
 * const table = await result.collect()
 *
 * // Clean up
 * await stmt.close()
 * ```
 */
export class PreparedStatement {
  private readonly client: FlightSqlClient
  private handle: Uint8Array
  private datasetSchema: Schema | null
  private parameterSchema: Schema | null
  private closed = false

  constructor(
    client: FlightSqlClient,
    handle: Uint8Array,
    datasetSchema: Schema | null,
    parameterSchema: Schema | null
  ) {
    this.client = client
    this.handle = handle
    this.datasetSchema = datasetSchema
    this.parameterSchema = parameterSchema
  }

  /**
   * Get the schema of the result set
   */
  get resultSchema(): Schema | null {
    return this.datasetSchema
  }

  /**
   * Get the schema of the parameters
   */
  get parametersSchema(): Schema | null {
    return this.parameterSchema
  }

  /**
   * Check if the prepared statement is closed
   */
  get isClosed(): boolean {
    return this.closed
  }

  /**
   * Execute the prepared statement as a query
   */
  async executeQuery(): Promise<QueryResult> {
    if (this.closed) {
      throw new FlightSqlError("PreparedStatement is closed")
    }

    const command = encodeCommandPreparedStatementQuery(this.handle)

    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await (this.client as FlightSqlClientInternal).getFlightInfo(descriptor)
    const schema = tryParseSchema(flightInfo.schema) ?? this.datasetSchema

    return new QueryResult(this.client, flightInfo, schema)
  }

  /**
   * Close the prepared statement and release server resources
   */
  async close(): Promise<void> {
    if (this.closed) {
      return
    }

    const actionBody = encodeActionClosePreparedStatementRequest(this.handle)
    const action: Action = {
      type: "ClosePreparedStatement",
      body: actionBody
    }

    // Execute the close action
    for await (const result of (this.client as FlightSqlClientInternal).doAction(action)) {
      void result // Consume the results
    }

    this.closed = true
  }
}

// Internal interface for accessing protected client methods
interface FlightSqlClientInternal extends FlightSqlClient {
  getFlightInfo(descriptor: FlightDescriptor): Promise<FlightInfo>
  doAction(action: Action): AsyncGenerator<ActionResult, void, unknown>
}

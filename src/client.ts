/**
 * Flight SQL client implementation.
 *
 * @packageDocumentation
 */
import {
  type CallOptions,
  type CmdDescriptor,
  cmdDescriptor,
  FlightClient,
  type FlightClientOptions,
  FlightError,
  type FlightInfo
} from "@qualithm/arrow-flight-js"

import {
  ActionClosePreparedStatementRequest,
  ActionCreatePreparedStatementRequest,
  ActionCreatePreparedStatementResult,
  CommandPreparedStatementQuery,
  CommandPreparedStatementUpdate,
  CommandStatementQuery,
  CommandStatementUpdate,
  DoPutPreparedStatementResult,
  DoPutUpdateResult
} from "./generated/arrow/flight/protocol/sql/FlightSql.js"

/**
 * Flight SQL type URL prefix for encoding commands in Any messages.
 */
const TYPE_URL_PREFIX = "type.googleapis.com/arrow.flight.protocol.sql"

/**
 * Flight SQL action types.
 */
const ACTION_CREATE_PREPARED_STATEMENT = "CreatePreparedStatement"
const ACTION_CLOSE_PREPARED_STATEMENT = "ClosePreparedStatement"

/**
 * Options for creating a FlightSqlClient.
 */
export type FlightSqlClientOptions = FlightClientOptions

/**
 * Options for executing a query.
 */
export type QueryOptions = CallOptions & {
  /**
   * Transaction ID for executing the query as part of a transaction.
   * If not provided, the query is auto-committed.
   */
  transactionId?: Buffer
}

/**
 * Result of a statement update operation.
 */
export type UpdateResult = {
  /**
   * The number of records affected by the update.
   * A value of -1 indicates an unknown count.
   */
  recordCount: number
}

/**
 * Options for creating a prepared statement.
 */
export type PreparedStatementOptions = CallOptions & {
  /**
   * Transaction ID for creating the prepared statement as part of a transaction.
   * If not provided, executions of the prepared statement will be auto-committed.
   */
  transactionId?: Buffer
}

/**
 * Result of creating a prepared statement.
 */
export type PreparedStatementResult = {
  /**
   * Opaque handle for the prepared statement on the server.
   * Use this handle with executePreparedQuery or executePreparedUpdate.
   */
  handle: Buffer

  /**
   * The schema of the result set, if the query returns results.
   * This is an IPC-encapsulated Schema as described in Schema.fbs.
   * May be empty if the query does not return results.
   */
  datasetSchema: Buffer

  /**
   * The schema of the expected parameters, if the query has parameters.
   * This is an IPC-encapsulated Schema as described in Schema.fbs.
   * May be empty if the query has no parameters.
   */
  parameterSchema: Buffer
}

/**
 * Result of binding parameters to a prepared statement.
 */
export type BindParametersResult = {
  /**
   * Updated handle for the prepared statement.
   * If provided, this handle should be used for subsequent operations
   * instead of the original handle. If undefined, continue using the
   * original handle.
   */
  handle?: Buffer
}

/**
 * Parameter data for binding to a prepared statement.
 * Can be provided as raw Arrow IPC bytes or as separate schema/data components.
 */
export type ParameterData = {
  /**
   * Arrow IPC schema message bytes.
   * Required when sending parameters.
   */
  schema: Uint8Array

  /**
   * Arrow IPC record batch data bytes.
   * Contains the actual parameter values.
   */
  data: Uint8Array
}

/**
 * Encodes a Flight SQL command as a descriptor command buffer.
 *
 * Flight SQL commands are encoded as protobuf Any messages with a type URL
 * and the serialised command bytes.
 *
 * @param typeUrl - The type URL for the command
 * @param data - The serialised command bytes
 * @returns The encoded Any message buffer
 */
function packAny(typeUrl: string, data: Uint8Array): Buffer {
  // Any message format:
  // field 1 (type_url): string - wire type 2 (length-delimited)
  // field 2 (value): bytes - wire type 2 (length-delimited)
  const typeUrlBytes = Buffer.from(typeUrl, "utf8")
  const typeUrlLen = typeUrlBytes.length
  const dataLen = data.length

  // Calculate varint sizes
  const typeUrlVarIntSize = varIntSize(typeUrlLen)
  const dataVarIntSize = varIntSize(dataLen)

  // Total size: 1 (tag) + varint + typeUrl + 1 (tag) + varint + data
  const totalSize = 1 + typeUrlVarIntSize + typeUrlLen + 1 + dataVarIntSize + dataLen
  const buffer = Buffer.alloc(totalSize)

  let offset = 0

  // Field 1: type_url (tag = 0x0a = field 1, wire type 2)
  buffer[offset++] = 0x0a
  offset = writeVarInt(buffer, offset, typeUrlLen)
  typeUrlBytes.copy(buffer, offset)
  offset += typeUrlLen

  // Field 2: value (tag = 0x12 = field 2, wire type 2)
  buffer[offset++] = 0x12
  offset = writeVarInt(buffer, offset, dataLen)
  Buffer.from(data).copy(buffer, offset)

  return buffer
}

/**
 * Calculates the size of a varint encoding.
 */
function varIntSize(value: number): number {
  let size = 1
  while (value >= 0x80) {
    value >>>= 7
    size++
  }
  return size
}

/**
 * Writes a varint to a buffer.
 */
function writeVarInt(buffer: Buffer, offset: number, value: number): number {
  while (value >= 0x80) {
    buffer[offset++] = (value & 0x7f) | 0x80
    value >>>= 7
  }
  buffer[offset++] = value
  return offset
}

/**
 * Reads a varint from a buffer.
 */
function readVarInt(buffer: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0
  let shift = 0
  let bytesRead = 0

  while (offset < buffer.length) {
    const byte = buffer[offset++]
    bytesRead++
    value |= (byte & 0x7f) << shift

    if ((byte & 0x80) === 0) {
      break
    }
    shift += 7
  }

  return { value, bytesRead }
}

/**
 * Unpacks a protobuf Any message and returns the contained value bytes.
 *
 * @param buffer - The encoded Any message
 * @returns The value bytes from the Any message
 */
function unpackAny(buffer: Buffer): Buffer {
  // Any message format:
  // field 1 (type_url): string - wire type 2 (length-delimited)
  // field 2 (value): bytes - wire type 2 (length-delimited)
  let offset = 0
  let valueBytes: Buffer = Buffer.alloc(0)

  while (offset < buffer.length) {
    const tag = buffer[offset++]
    const fieldNumber = tag >> 3
    const wireType = tag & 0x07

    if (wireType !== 2) {
      // Skip non-length-delimited fields (not expected in Any)
      continue
    }

    const { value: length, bytesRead } = readVarInt(buffer, offset)
    offset += bytesRead

    if (fieldNumber === 2) {
      // This is the value field
      valueBytes = buffer.subarray(offset, offset + length)
    }

    offset += length
  }

  return valueBytes
}

/**
 * Creates a command descriptor for a Flight SQL command.
 *
 * @param typeName - The protobuf type name (without the prefix)
 * @param encodedCommand - The encoded command bytes
 * @returns A Flight descriptor
 */
function createCommandDescriptor(typeName: string, encodedCommand: Uint8Array): CmdDescriptor {
  const typeUrl = `${TYPE_URL_PREFIX}.${typeName}`
  const anyBytes = packAny(typeUrl, encodedCommand)
  return cmdDescriptor(anyBytes)
}

/**
 * Arrow Flight SQL client for executing SQL queries and commands.
 *
 * Extends the base FlightClient with SQL-specific functionality including
 * query execution, updates, and metadata queries.
 *
 * @example
 * ```ts
 * const client = new FlightSqlClient({
 *   host: "localhost",
 *   port: 8815,
 *   tls: false
 * })
 *
 * await client.connect()
 *
 * // Execute a query
 * const info = await client.query("SELECT * FROM users")
 *
 * // Execute an update
 * const result = await client.executeUpdate("INSERT INTO users (name) VALUES ('Alice')")
 * console.log("Rows affected:", result.recordCount)
 *
 * client.close()
 * ```
 */
export class FlightSqlClient extends FlightClient {
  /**
   * Executes a SQL query and returns flight information for retrieving results.
   *
   * This method sends a CommandStatementQuery to the server and returns
   * FlightInfo containing endpoints for data retrieval. Use the returned
   * FlightInfo with `doGet()` to retrieve the actual data.
   *
   * @param query - The SQL query to execute
   * @param options - Optional query options
   * @returns Flight information for retrieving query results
   * @throws {FlightError} If the query fails
   *
   * @example
   * ```ts
   * const info = await client.query("SELECT * FROM users WHERE active = true")
   *
   * // Retrieve data from each endpoint
   * for (const endpoint of info.endpoint) {
   *   for await (const data of client.doGet(endpoint.ticket!)) {
   *     // Process data
   *   }
   * }
   * ```
   */
  async query(query: string, options?: QueryOptions): Promise<FlightInfo> {
    const command: CommandStatementQuery = {
      query,
      transactionId: options?.transactionId
    }

    const encoded = CommandStatementQuery.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandStatementQuery", encoded)

    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Executes a prepared statement query and returns flight information for retrieving results.
   *
   * This method sends a CommandPreparedStatementQuery to the server and returns
   * FlightInfo containing endpoints for data retrieval. Use the returned
   * FlightInfo with `doGet()` to retrieve the actual data.
   *
   * @param handle - The prepared statement handle from createPreparedStatement
   * @param options - Optional call options
   * @returns Flight information for retrieving query results
   * @throws {FlightError} If the query fails
   *
   * @example
   * ```ts
   * const prepared = await client.createPreparedStatement("SELECT * FROM users WHERE id = ?")
   *
   * // Execute the prepared statement
   * const info = await client.executePreparedQuery(prepared.handle)
   *
   * // Retrieve data from each endpoint
   * for (const endpoint of info.endpoint) {
   *   for await (const data of client.doGet(endpoint.ticket!)) {
   *     // Process data
   *   }
   * }
   *
   * // Clean up
   * await client.closePreparedStatement(prepared.handle)
   * ```
   */
  async executePreparedQuery(handle: Buffer, options?: CallOptions): Promise<FlightInfo> {
    const command: CommandPreparedStatementQuery = {
      preparedStatementHandle: handle
    }

    const encoded = CommandPreparedStatementQuery.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandPreparedStatementQuery", encoded)

    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Executes a prepared statement update (INSERT, UPDATE, DELETE).
   *
   * @param handle - The prepared statement handle from createPreparedStatement
   * @param options - Optional call options
   * @returns The update result containing the number of affected records
   * @throws {FlightError} If the update fails
   *
   * @example
   * ```ts
   * const prepared = await client.createPreparedStatement(
   *   "UPDATE users SET active = false WHERE id = ?"
   * )
   *
   * // Execute the prepared statement
   * const result = await client.executePreparedUpdate(prepared.handle)
   * console.log("Rows updated:", result.recordCount)
   *
   * // Clean up
   * await client.closePreparedStatement(prepared.handle)
   * ```
   */
  async executePreparedUpdate(handle: Buffer, options?: CallOptions): Promise<UpdateResult> {
    const command: CommandPreparedStatementUpdate = {
      preparedStatementHandle: handle
    }

    const encoded = CommandPreparedStatementUpdate.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandPreparedStatementUpdate", encoded)

    const stream = this.doPut(options)

    // Send the command as the first message with descriptor
    stream.write({
      flightDescriptor: {
        type: 2, // CMD
        path: [],
        cmd: descriptor.cmd
      },
      dataHeader: Buffer.alloc(0),
      appMetadata: Buffer.alloc(0),
      dataBody: Buffer.alloc(0)
    })

    stream.end()

    // Collect results
    const results = await stream.collectResults()
    const firstResult = results.at(0)

    if (!firstResult) {
      throw new FlightError("no result returned from prepared update", "INTERNAL")
    }

    // Decode the DoPutUpdateResult from appMetadata
    const { appMetadata } = firstResult
    if (appMetadata.length === 0) {
      throw new FlightError("prepared update result missing app metadata", "INTERNAL")
    }

    const updateResult = DoPutUpdateResult.decode(appMetadata)

    return {
      recordCount: updateResult.recordCount
    }
  }

  /**
   * Executes a SQL update statement (INSERT, UPDATE, DELETE).
   *
   * @param query - The SQL update statement to execute
   * @param options - Optional query options
   * @returns The update result containing the number of affected records
   * @throws {FlightError} If the update fails
   *
   * @example
   * ```ts
   * const result = await client.executeUpdate(
   *   "UPDATE users SET active = false WHERE last_login < '2024-01-01'"
   * )
   * console.log("Rows updated:", result.recordCount)
   * ```
   */
  async executeUpdate(query: string, options?: QueryOptions): Promise<UpdateResult> {
    const command: CommandStatementUpdate = {
      query,
      transactionId: options?.transactionId
    }

    const encoded = CommandStatementUpdate.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandStatementUpdate", encoded)

    const stream = this.doPut(options)

    // Send the command as the first message with descriptor
    stream.write({
      flightDescriptor: {
        type: 2, // CMD
        path: [],
        cmd: descriptor.cmd
      },
      dataHeader: Buffer.alloc(0),
      appMetadata: Buffer.alloc(0),
      dataBody: Buffer.alloc(0)
    })

    stream.end()

    // Collect results
    const results = await stream.collectResults()
    const firstResult = results.at(0)

    if (!firstResult) {
      throw new FlightError("no result returned from update", "INTERNAL")
    }

    // Decode the DoPutUpdateResult from appMetadata
    const { appMetadata } = firstResult
    if (appMetadata.length === 0) {
      throw new FlightError("update result missing app metadata", "INTERNAL")
    }

    const updateResult = DoPutUpdateResult.decode(appMetadata)

    return {
      recordCount: updateResult.recordCount
    }
  }

  /**
   * Creates a prepared statement for the given SQL query.
   *
   * The returned handle can be used to execute the query multiple times
   * with different parameters. The prepared statement should be closed
   * when no longer needed using `closePreparedStatement()`.
   *
   * @param query - The SQL query to prepare
   * @param options - Optional options including transaction ID
   * @returns The prepared statement result containing the handle and schemas
   * @throws {FlightError} If the preparation fails
   *
   * @example
   * ```ts
   * const prepared = await client.createPreparedStatement(
   *   "SELECT * FROM users WHERE id = ?"
   * )
   *
   * // Use prepared.handle with executePreparedQuery
   * // ...
   *
   * // Clean up when done
   * await client.closePreparedStatement(prepared.handle)
   * ```
   */
  async createPreparedStatement(
    query: string,
    options?: PreparedStatementOptions
  ): Promise<PreparedStatementResult> {
    const request: ActionCreatePreparedStatementRequest = {
      query,
      transactionId: options?.transactionId
    }

    const encoded = ActionCreatePreparedStatementRequest.encode(request).finish()
    const typeUrl = `${TYPE_URL_PREFIX}.ActionCreatePreparedStatementRequest`
    const body = packAny(typeUrl, encoded)

    const action = {
      type: ACTION_CREATE_PREPARED_STATEMENT,
      body
    }

    // Execute the action and collect the first result
    let resultBody: Buffer | undefined

    for await (const result of this.doAction(action, options)) {
      resultBody = result.body
      break
    }

    if (!resultBody || resultBody.length === 0) {
      throw new FlightError("no result returned from create prepared statement", "INTERNAL")
    }

    // Unpack the Any message and decode the result
    const valueBytes = unpackAny(resultBody)
    const preparedResult = ActionCreatePreparedStatementResult.decode(valueBytes)

    return {
      handle: Buffer.from(preparedResult.preparedStatementHandle),
      datasetSchema: Buffer.from(preparedResult.datasetSchema),
      parameterSchema: Buffer.from(preparedResult.parameterSchema)
    }
  }

  /**
   * Closes a prepared statement and releases server resources.
   *
   * @param handle - The prepared statement handle to close
   * @param options - Optional call options
   * @throws {FlightError} If closing fails
   *
   * @example
   * ```ts
   * const prepared = await client.createPreparedStatement("SELECT * FROM users")
   * // ... use the prepared statement ...
   * await client.closePreparedStatement(prepared.handle)
   * ```
   */
  async closePreparedStatement(handle: Buffer, options?: CallOptions): Promise<void> {
    const request: ActionClosePreparedStatementRequest = {
      preparedStatementHandle: handle
    }

    const encoded = ActionClosePreparedStatementRequest.encode(request).finish()
    const typeUrl = `${TYPE_URL_PREFIX}.ActionClosePreparedStatementRequest`
    const body = packAny(typeUrl, encoded)

    const action = {
      type: ACTION_CLOSE_PREPARED_STATEMENT,
      body
    }

    // Execute the action - no result expected
    for await (const _ of this.doAction(action, options)) {
      // Consume any results (usually none for close)
    }
  }

  /**
   * Binds parameter values to a prepared statement.
   *
   * Parameter values are sent as Arrow IPC data matching the parameter schema
   * from the prepared statement. After binding, call `executePreparedQuery()`
   * or `executePreparedUpdate()` to execute with the bound parameters.
   *
   * @param handle - The prepared statement handle
   * @param parameters - The parameter data as Arrow IPC bytes
   * @param options - Optional call options
   * @returns Result containing an optional updated handle
   * @throws {FlightError} If binding fails
   *
   * @example
   * ```ts
   * import { tableToIPC, tableFromArrays } from "apache-arrow"
   *
   * const prepared = await client.createPreparedStatement(
   *   "SELECT * FROM users WHERE id = ?"
   * )
   *
   * // Create parameter data as Arrow IPC
   * const params = tableFromArrays({ id: [42] })
   * const ipcData = tableToIPC(params)
   *
   * // Bind the parameters
   * const result = await client.bindParameters(prepared.handle, {
   *   schema: ipcData.slice(0, schemaLength),  // Extract schema bytes
   *   data: ipcData.slice(schemaLength)         // Extract data bytes
   * })
   *
   * // Use updated handle if provided
   * const handle = result.handle ?? prepared.handle
   *
   * // Execute and retrieve results
   * const info = await client.executePreparedQuery(handle)
   * ```
   */
  async bindParameters(
    handle: Buffer,
    parameters: ParameterData,
    options?: CallOptions
  ): Promise<BindParametersResult> {
    const command: CommandPreparedStatementQuery = {
      preparedStatementHandle: handle
    }

    const encoded = CommandPreparedStatementQuery.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandPreparedStatementQuery", encoded)

    const stream = this.doPut(options)

    // Send the command with schema in the first message
    stream.write({
      flightDescriptor: {
        type: 2, // CMD
        path: [],
        cmd: descriptor.cmd
      },
      dataHeader: Buffer.from(parameters.schema),
      appMetadata: Buffer.alloc(0),
      dataBody: Buffer.from(parameters.data)
    })

    stream.end()

    // Collect results
    const results = await stream.collectResults()
    const firstResult = results.at(0)

    // Server may not return any result (legacy behavior)
    if (!firstResult || firstResult.appMetadata.length === 0) {
      return {}
    }

    // Decode the DoPutPreparedStatementResult from appMetadata
    const anyBytes = unpackAny(firstResult.appMetadata)
    if (anyBytes.length === 0) {
      return {}
    }

    const bindResult = DoPutPreparedStatementResult.decode(anyBytes)

    return {
      handle: bindResult.preparedStatementHandle
        ? Buffer.from(bindResult.preparedStatementHandle)
        : undefined
    }
  }
}

/**
 * Creates a new FlightSqlClient and connects to the server.
 *
 * This is a convenience function that combines creating a client
 * and calling connect() in one step.
 *
 * @param options - Connection options
 * @returns A connected FlightSqlClient
 *
 * @example
 * ```ts
 * const client = await createFlightSqlClient({
 *   host: "localhost",
 *   port: 8815,
 *   tls: false
 * })
 * ```
 */
export async function createFlightSqlClient(
  options: FlightSqlClientOptions
): Promise<FlightSqlClient> {
  const client = new FlightSqlClient(options)
  await client.connect()
  return client
}

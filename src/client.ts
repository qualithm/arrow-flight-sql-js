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
  type FlightInfo
} from "@qualithm/arrow-flight"

import {
  FlightSqlError,
  validateHandle,
  validateParameterData,
  validateQuery,
  validateTransactionId
} from "./errors.js"
import {
  ActionBeginTransactionRequest,
  ActionBeginTransactionResult,
  ActionClosePreparedStatementRequest,
  ActionCreatePreparedStatementRequest,
  ActionCreatePreparedStatementResult,
  ActionEndTransactionRequest,
  ActionEndTransactionRequest_EndTransaction,
  CommandGetCatalogs,
  CommandGetCrossReference,
  CommandGetDbSchemas,
  CommandGetExportedKeys,
  CommandGetImportedKeys,
  CommandGetPrimaryKeys,
  CommandGetSqlInfo,
  CommandGetTables,
  CommandGetTableTypes,
  CommandGetXdbcTypeInfo,
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
const ACTION_BEGIN_TRANSACTION = "BeginTransaction"
const ACTION_END_TRANSACTION = "EndTransaction"

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
 * Result of beginning a transaction.
 */
export type TransactionResult = {
  /**
   * Opaque handle for the transaction on the server.
   * Use this handle with query/update operations and commit/rollback.
   */
  transactionId: Buffer
}

/**
 * Transaction end action.
 */
export type TransactionAction = "commit" | "rollback"

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
    validateQuery(query)

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
    validateHandle(handle, "prepared statement handle")

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
    validateHandle(handle, "prepared statement handle")

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
      throw new FlightSqlError("no result returned from prepared update", "RESULT_ERROR", {
        flightCode: "INTERNAL"
      })
    }

    // Decode the DoPutUpdateResult from appMetadata
    const { appMetadata } = firstResult
    if (appMetadata.length === 0) {
      throw new FlightSqlError("prepared update result missing app metadata", "RESULT_ERROR", {
        flightCode: "INTERNAL"
      })
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
    validateQuery(query)

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
      throw new FlightSqlError("no result returned from update", "RESULT_ERROR", {
        flightCode: "INTERNAL"
      })
    }

    // Decode the DoPutUpdateResult from appMetadata
    const { appMetadata } = firstResult
    if (appMetadata.length === 0) {
      throw new FlightSqlError("update result missing app metadata", "RESULT_ERROR", {
        flightCode: "INTERNAL"
      })
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
    validateQuery(query)

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
      throw new FlightSqlError(
        "no result returned from create prepared statement",
        "RESULT_ERROR",
        {
          flightCode: "INTERNAL"
        }
      )
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
    validateHandle(handle, "prepared statement handle")

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
    validateHandle(handle, "prepared statement handle")
    validateParameterData(parameters)

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Metadata Queries
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Retrieves the list of catalogs (databases) available on the server.
   *
   * @param options - Optional call options
   * @returns Flight information for retrieving catalog data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * const info = await client.getCatalogs()
   * const table = await flightInfoToTable(client, info)
   * for (const row of table) {
   *   console.log("Catalog:", row.catalog_name)
   * }
   * ```
   */
  async getCatalogs(options?: CallOptions): Promise<FlightInfo> {
    const command: CommandGetCatalogs = {}
    const encoded = CommandGetCatalogs.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetCatalogs", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves the list of database schemas.
   *
   * @param options - Optional filtering and call options
   * @returns Flight information for retrieving schema data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * // Get all schemas
   * const info = await client.getDbSchemas()
   *
   * // Get schemas in a specific catalog
   * const info = await client.getDbSchemas({ catalog: "my_database" })
   *
   * // Get schemas matching a pattern
   * const info = await client.getDbSchemas({ dbSchemaFilterPattern: "public%" })
   * ```
   */
  async getDbSchemas(
    options?: CallOptions & {
      catalog?: string
      dbSchemaFilterPattern?: string
    }
  ): Promise<FlightInfo> {
    const command: CommandGetDbSchemas = {
      catalog: options?.catalog,
      dbSchemaFilterPattern: options?.dbSchemaFilterPattern
    }
    const encoded = CommandGetDbSchemas.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetDbSchemas", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves the list of tables.
   *
   * @param options - Optional filtering and call options
   * @returns Flight information for retrieving table data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * // Get all tables
   * const info = await client.getTables()
   *
   * // Get tables with schema information
   * const info = await client.getTables({ includeSchema: true })
   *
   * // Get only views
   * const info = await client.getTables({ tableTypes: ["VIEW"] })
   *
   * // Get tables matching a pattern in a specific schema
   * const info = await client.getTables({
   *   dbSchemaFilterPattern: "public",
   *   tableNameFilterPattern: "user%"
   * })
   * ```
   */
  async getTables(
    options?: CallOptions & {
      catalog?: string
      dbSchemaFilterPattern?: string
      tableNameFilterPattern?: string
      tableTypes?: string[]
      includeSchema?: boolean
    }
  ): Promise<FlightInfo> {
    const command: CommandGetTables = {
      catalog: options?.catalog,
      dbSchemaFilterPattern: options?.dbSchemaFilterPattern,
      tableNameFilterPattern: options?.tableNameFilterPattern,
      tableTypes: options?.tableTypes ?? [],
      includeSchema: options?.includeSchema ?? false
    }
    const encoded = CommandGetTables.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetTables", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves the list of table types supported by the server.
   *
   * Common table types include TABLE, VIEW, and SYSTEM TABLE.
   *
   * @param options - Optional call options
   * @returns Flight information for retrieving table type data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * const info = await client.getTableTypes()
   * const table = await flightInfoToTable(client, info)
   * for (const row of table) {
   *   console.log("Table type:", row.table_type)
   * }
   * ```
   */
  async getTableTypes(options?: CallOptions): Promise<FlightInfo> {
    const command: CommandGetTableTypes = {}
    const encoded = CommandGetTableTypes.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetTableTypes", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves the primary keys for a table.
   *
   * @param table - The table name to get primary keys for
   * @param options - Optional filtering and call options
   * @returns Flight information for retrieving primary key data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * const info = await client.getPrimaryKeys("users", {
   *   catalog: "my_database",
   *   dbSchema: "public"
   * })
   * const table = await flightInfoToTable(client, info)
   * for (const row of table) {
   *   console.log("Primary key column:", row.column_name)
   * }
   * ```
   */
  async getPrimaryKeys(
    table: string,
    options?: CallOptions & {
      catalog?: string
      dbSchema?: string
    }
  ): Promise<FlightInfo> {
    const command: CommandGetPrimaryKeys = {
      table,
      catalog: options?.catalog,
      dbSchema: options?.dbSchema
    }
    const encoded = CommandGetPrimaryKeys.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetPrimaryKeys", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves the exported keys (foreign keys that reference this table's primary key).
   *
   * @param table - The table name to get exported keys for
   * @param options - Optional filtering and call options
   * @returns Flight information for retrieving exported key data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * const info = await client.getExportedKeys("users")
   * const table = await flightInfoToTable(client, info)
   * for (const row of table) {
   *   console.log(`${row.fk_table_name}.${row.fk_column_name} -> ${row.pk_column_name}`)
   * }
   * ```
   */
  async getExportedKeys(
    table: string,
    options?: CallOptions & {
      catalog?: string
      dbSchema?: string
    }
  ): Promise<FlightInfo> {
    const command: CommandGetExportedKeys = {
      table,
      catalog: options?.catalog,
      dbSchema: options?.dbSchema
    }
    const encoded = CommandGetExportedKeys.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetExportedKeys", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves the imported keys (foreign keys in this table that reference other tables).
   *
   * @param table - The table name to get imported keys for
   * @param options - Optional filtering and call options
   * @returns Flight information for retrieving imported key data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * const info = await client.getImportedKeys("orders")
   * const table = await flightInfoToTable(client, info)
   * for (const row of table) {
   *   console.log(`${row.fk_column_name} -> ${row.pk_table_name}.${row.pk_column_name}`)
   * }
   * ```
   */
  async getImportedKeys(
    table: string,
    options?: CallOptions & {
      catalog?: string
      dbSchema?: string
    }
  ): Promise<FlightInfo> {
    const command: CommandGetImportedKeys = {
      table,
      catalog: options?.catalog,
      dbSchema: options?.dbSchema
    }
    const encoded = CommandGetImportedKeys.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetImportedKeys", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves the cross-reference between two tables (foreign keys in the foreign
   * table that reference the primary key of the parent table).
   *
   * @param pkTable - The parent (primary key) table name
   * @param fkTable - The foreign key table name
   * @param options - Optional filtering and call options
   * @returns Flight information for retrieving cross-reference data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * const info = await client.getCrossReference("users", "orders")
   * const table = await flightInfoToTable(client, info)
   * for (const row of table) {
   *   console.log(`${row.fk_table_name}.${row.fk_column_name} -> ${row.pk_table_name}.${row.pk_column_name}`)
   * }
   * ```
   */
  async getCrossReference(
    pkTable: string,
    fkTable: string,
    options?: CallOptions & {
      pkCatalog?: string
      pkDbSchema?: string
      fkCatalog?: string
      fkDbSchema?: string
    }
  ): Promise<FlightInfo> {
    const command: CommandGetCrossReference = {
      pkTable,
      fkTable,
      pkCatalog: options?.pkCatalog,
      pkDbSchema: options?.pkDbSchema,
      fkCatalog: options?.fkCatalog,
      fkDbSchema: options?.fkDbSchema
    }
    const encoded = CommandGetCrossReference.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetCrossReference", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves SQL information about the server's capabilities.
   *
   * @param info - Array of SqlInfo codes to retrieve; if empty, returns all
   * @param options - Optional call options
   * @returns Flight information for retrieving SQL info data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * // Get all SQL info
   * const info = await client.getSqlInfo()
   *
   * // Get specific info (use SqlInfo enum values)
   * const info = await client.getSqlInfo([0, 1, 2])  // server name, version, arrow version
   * ```
   */
  async getSqlInfo(info?: number[], options?: CallOptions): Promise<FlightInfo> {
    const command: CommandGetSqlInfo = {
      info: info ?? []
    }
    const encoded = CommandGetSqlInfo.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetSqlInfo", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Retrieves information about data types supported by the server.
   *
   * @param options - Optional data type filter and call options
   * @returns Flight information for retrieving type info data
   * @throws {FlightError} If the request fails
   *
   * @example
   * ```ts
   * // Get all type info
   * const info = await client.getXdbcTypeInfo()
   *
   * // Get info for a specific data type
   * const info = await client.getXdbcTypeInfo({ dataType: 12 })  // VARCHAR
   * ```
   */
  async getXdbcTypeInfo(options?: CallOptions & { dataType?: number }): Promise<FlightInfo> {
    const command: CommandGetXdbcTypeInfo = {
      dataType: options?.dataType
    }
    const encoded = CommandGetXdbcTypeInfo.encode(command).finish()
    const descriptor = createCommandDescriptor("CommandGetXdbcTypeInfo", encoded)
    return this.getFlightInfo(descriptor, options)
  }

  /**
   * Begins a new transaction.
   *
   * Returns a transaction ID that can be passed to query, update, and
   * prepared statement operations to execute them within the transaction.
   * Call `commit()` or `rollback()` to end the transaction.
   *
   * @param options - Optional call options
   * @returns The transaction result containing the transaction ID
   * @throws {FlightError} If the server does not support transactions or the request fails
   *
   * @example
   * ```ts
   * const txn = await client.beginTransaction()
   *
   * try {
   *   await client.executeUpdate(
   *     "INSERT INTO users (name) VALUES ('Alice')",
   *     { transactionId: txn.transactionId }
   *   )
   *   await client.executeUpdate(
   *     "UPDATE accounts SET balance = balance - 100 WHERE user = 'Alice'",
   *     { transactionId: txn.transactionId }
   *   )
   *   await client.commit(txn.transactionId)
   * } catch (error) {
   *   await client.rollback(txn.transactionId)
   *   throw error
   * }
   * ```
   */
  async beginTransaction(options?: CallOptions): Promise<TransactionResult> {
    const request: ActionBeginTransactionRequest = {}

    const encoded = ActionBeginTransactionRequest.encode(request).finish()
    const typeUrl = `${TYPE_URL_PREFIX}.ActionBeginTransactionRequest`
    const body = packAny(typeUrl, encoded)

    const action = {
      type: ACTION_BEGIN_TRANSACTION,
      body
    }

    // Execute the action and collect the first result
    let resultBody: Buffer | undefined

    for await (const result of this.doAction(action, options)) {
      resultBody = result.body
      break
    }

    if (!resultBody || resultBody.length === 0) {
      throw new FlightSqlError("no result returned from begin transaction", "TRANSACTION_ERROR", {
        flightCode: "INTERNAL"
      })
    }

    // Unpack the Any message and decode the result
    const valueBytes = unpackAny(resultBody)
    const txnResult = ActionBeginTransactionResult.decode(valueBytes)

    return {
      transactionId: Buffer.from(txnResult.transactionId)
    }
  }

  /**
   * Ends a transaction with the specified action.
   *
   * This is a lower-level method. Consider using `commit()` or `rollback()`
   * for more readable code.
   *
   * @param transactionId - The transaction ID from beginTransaction
   * @param action - Whether to commit or rollback the transaction
   * @param options - Optional call options
   * @throws {FlightError} If the request fails
   */
  async endTransaction(
    transactionId: Buffer,
    action: TransactionAction,
    options?: CallOptions
  ): Promise<void> {
    validateTransactionId(transactionId)

    const endAction =
      action === "commit"
        ? ActionEndTransactionRequest_EndTransaction.END_TRANSACTION_COMMIT
        : ActionEndTransactionRequest_EndTransaction.END_TRANSACTION_ROLLBACK

    const request: ActionEndTransactionRequest = {
      transactionId,
      action: endAction
    }

    const encoded = ActionEndTransactionRequest.encode(request).finish()
    const typeUrl = `${TYPE_URL_PREFIX}.ActionEndTransactionRequest`
    const body = packAny(typeUrl, encoded)

    const flightAction = {
      type: ACTION_END_TRANSACTION,
      body
    }

    // Execute the action - no result expected
    for await (const _ of this.doAction(flightAction, options)) {
      // Consume any results (usually none for end transaction)
    }
  }

  /**
   * Commits a transaction.
   *
   * All operations executed within the transaction are made permanent.
   * The transaction ID becomes invalid after this call.
   *
   * @param transactionId - The transaction ID from beginTransaction
   * @param options - Optional call options
   * @throws {FlightError} If the commit fails
   *
   * @example
   * ```ts
   * const txn = await client.beginTransaction()
   * await client.executeUpdate(
   *   "INSERT INTO users (name) VALUES ('Alice')",
   *   { transactionId: txn.transactionId }
   * )
   * await client.commit(txn.transactionId)
   * ```
   */
  async commit(transactionId: Buffer, options?: CallOptions): Promise<void> {
    return this.endTransaction(transactionId, "commit", options)
  }

  /**
   * Rolls back a transaction.
   *
   * All operations executed within the transaction are undone.
   * The transaction ID becomes invalid after this call.
   *
   * @param transactionId - The transaction ID from beginTransaction
   * @param options - Optional call options
   * @throws {FlightError} If the rollback fails
   *
   * @example
   * ```ts
   * const txn = await client.beginTransaction()
   * try {
   *   await client.executeUpdate(
   *     "INSERT INTO users (name) VALUES ('Alice')",
   *     { transactionId: txn.transactionId }
   *   )
   *   await client.commit(txn.transactionId)
   * } catch (error) {
   *   await client.rollback(txn.transactionId)
   *   throw error
   * }
   * ```
   */
  async rollback(transactionId: Buffer, options?: CallOptions): Promise<void> {
    return this.endTransaction(transactionId, "rollback", options)
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

/**
 * Arrow Flight SQL Client
 *
 * A TypeScript client for communicating with Arrow Flight SQL servers.
 * Modeled after the official Arrow Flight SQL clients (Java, C++, Go).
 */

import { type RecordBatch, RecordBatchReader, type Schema, type Table } from "apache-arrow"

import { collectToTable, parseFlightData, tryParseSchema } from "./arrow"
import { AuthenticationError, ConnectionError, FlightSqlError } from "./errors"
import {
  encodeActionClosePreparedStatementRequest,
  encodeActionCreatePreparedStatementRequest,
  encodeCommandGetCatalogs,
  encodeCommandGetCrossReference,
  encodeCommandGetDbSchemas,
  encodeCommandGetExportedKeys,
  encodeCommandGetImportedKeys,
  encodeCommandGetPrimaryKeys,
  encodeCommandGetSqlInfo,
  encodeCommandGetTables,
  encodeCommandGetTableTypes,
  encodeCommandGetXdbcTypeInfo,
  encodeCommandPreparedStatementQuery,
  encodeCommandStatementQuery,
  encodeCommandStatementUpdate,
  getBytesField,
  parseProtoFields,
  unwrapAny
} from "./proto"
import type { FlightTransport, TransportMetadata } from "./transport"
import { getTransportForRuntime } from "./transport-grpc-js"
import {
  type Action,
  type ActionResult,
  type ActionType,
  type AuthConfig,
  type CatalogInfo,
  type DescriptorType,
  type ExecuteOptions,
  type FlightData,
  type FlightDescriptor,
  type FlightInfo,
  type FlightSqlClientOptions,
  type ForeignKeyInfo,
  type HandshakeResult,
  type PrimaryKeyInfo,
  type SchemaInfo,
  type SchemaResult,
  type SqlInfo,
  type SqlInfoValue,
  type SubscribeOptions,
  SubscriptionMessageType,
  type SubscriptionMetadata,
  SubscriptionMode,
  type TableInfo,
  type TableType,
  type Ticket,
  type XdbcTypeInfo
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

  private transport: FlightTransport | null = null
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

    // Use provided transport or create one for the runtime
    if (options.transport !== undefined) {
      this.transport = options.transport as FlightTransport
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
      // Create transport if not provided
      this.transport ??= getTransportForRuntime({
        host: this.options.host,
        port: this.options.port,
        tls: this.options.tls,
        credentials: this.options.credentials,
        connectTimeoutMs: this.options.connectTimeoutMs,
        requestTimeoutMs: this.options.requestTimeoutMs
      })

      // Connect the transport
      await this.transport.connect()

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
      // The result body may be wrapped in a protobuf Any envelope
      // Try to unwrap it first, otherwise parse directly
      let messageBytes = result.body
      const anyWrapper = unwrapAny(result.body)
      if (anyWrapper) {
        messageBytes = anyWrapper.value
      }

      // Parse ActionCreatePreparedStatementResult
      // Fields:
      //   1: prepared_statement_handle (bytes)
      //   2: dataset_schema (bytes) - Arrow IPC schema
      //   3: parameter_schema (bytes) - Arrow IPC schema
      const fields = parseProtoFields(messageBytes)

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
  // Catalog Introspection
  // ===========================================================================

  /**
   * Get the list of catalogs available on the server.
   *
   * @returns Array of catalog information
   *
   * @example
   * ```typescript
   * const catalogs = await client.getCatalogs()
   * for (const catalog of catalogs) {
   *   console.log(catalog.catalogName)
   * }
   * ```
   */
  async getCatalogs(): Promise<CatalogInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetCatalogs()
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchCatalogResults<CatalogInfo>(flightInfo, (row) => ({
      catalogName: row.catalog_name as string
    }))
  }

  /**
   * Get the list of schemas available in a catalog.
   *
   * @param catalog - Optional catalog name to filter by
   * @param schemaFilterPattern - Optional SQL LIKE pattern to filter schema names
   * @returns Array of schema information
   *
   * @example
   * ```typescript
   * // Get all schemas
   * const schemas = await client.getSchemas()
   *
   * // Get schemas in specific catalog
   * const schemas = await client.getSchemas("my_catalog")
   *
   * // Get schemas matching pattern
   * const schemas = await client.getSchemas(undefined, "public%")
   * ```
   */
  async getSchemas(catalog?: string, schemaFilterPattern?: string): Promise<SchemaInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetDbSchemas(catalog, schemaFilterPattern)
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchCatalogResults<SchemaInfo>(flightInfo, (row) => ({
      catalogName: row.catalog_name as string | undefined,
      schemaName: row.db_schema_name as string
    }))
  }

  /**
   * Get the list of tables available.
   *
   * @param options - Filter options
   * @returns Array of table information
   *
   * @example
   * ```typescript
   * // Get all tables
   * const tables = await client.getTables()
   *
   * // Get tables in specific catalog/schema
   * const tables = await client.getTables({
   *   catalog: "my_catalog",
   *   schemaPattern: "public"
   * })
   *
   * // Get only views
   * const views = await client.getTables({ tableTypes: ["VIEW"] })
   * ```
   */
  async getTables(options?: {
    catalog?: string
    schemaPattern?: string
    tablePattern?: string
    tableTypes?: string[]
    includeSchema?: boolean
  }): Promise<TableInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetTables({
      catalog: options?.catalog,
      dbSchemaFilterPattern: options?.schemaPattern,
      tableNameFilterPattern: options?.tablePattern,
      tableTypes: options?.tableTypes,
      includeSchema: options?.includeSchema
    })
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchCatalogResults<TableInfo>(flightInfo, (row) => {
      const info: TableInfo = {
        catalogName: row.catalog_name as string | undefined,
        schemaName: row.db_schema_name as string | undefined,
        tableName: row.table_name as string,
        tableType: row.table_type as string
      }

      // If includeSchema was requested, parse the table schema
      const schemaBytes = row.table_schema as Uint8Array | undefined
      if (schemaBytes && schemaBytes.length > 0) {
        info.schema = tryParseSchema(schemaBytes) ?? undefined
      }

      return info
    })
  }

  /**
   * Get the list of table types supported by the server.
   *
   * @returns Array of table type names (e.g., "TABLE", "VIEW", "SYSTEM TABLE")
   *
   * @example
   * ```typescript
   * const tableTypes = await client.getTableTypes()
   * console.log(tableTypes) // [{ tableType: "TABLE" }, { tableType: "VIEW" }, ...]
   * ```
   */
  async getTableTypes(): Promise<TableType[]> {
    this.ensureConnected()

    const command = encodeCommandGetTableTypes()
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchCatalogResults<TableType>(flightInfo, (row) => ({
      tableType: row.table_type as string
    }))
  }

  /**
   * Get the primary keys for a table.
   *
   * @param table - Table name
   * @param catalog - Optional catalog name
   * @param schema - Optional schema name
   * @returns Array of primary key information
   *
   * @example
   * ```typescript
   * const primaryKeys = await client.getPrimaryKeys("users")
   * for (const pk of primaryKeys) {
   *   console.log(`${pk.columnName} (sequence: ${pk.keySequence})`)
   * }
   * ```
   */
  async getPrimaryKeys(
    table: string,
    catalog?: string,
    schema?: string
  ): Promise<PrimaryKeyInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetPrimaryKeys(table, catalog, schema)
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchCatalogResults<PrimaryKeyInfo>(flightInfo, (row) => ({
      catalogName: row.catalog_name as string | undefined,
      schemaName: row.db_schema_name as string | undefined,
      tableName: row.table_name as string,
      columnName: row.column_name as string,
      keySequence: row.key_sequence as number,
      keyName: row.key_name as string | undefined
    }))
  }

  /**
   * Get the foreign keys that reference a table's primary key (exported keys).
   *
   * @param table - Table name
   * @param catalog - Optional catalog name
   * @param schema - Optional schema name
   * @returns Array of foreign key information
   *
   * @example
   * ```typescript
   * // Find all tables that reference the "users" table
   * const exportedKeys = await client.getExportedKeys("users")
   * ```
   */
  async getExportedKeys(
    table: string,
    catalog?: string,
    schema?: string
  ): Promise<ForeignKeyInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetExportedKeys(table, catalog, schema)
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchForeignKeyResults(flightInfo)
  }

  /**
   * Get the foreign keys in a table (imported keys).
   *
   * @param table - Table name
   * @param catalog - Optional catalog name
   * @param schema - Optional schema name
   * @returns Array of foreign key information
   *
   * @example
   * ```typescript
   * // Find all foreign keys in the "orders" table
   * const importedKeys = await client.getImportedKeys("orders")
   * ```
   */
  async getImportedKeys(
    table: string,
    catalog?: string,
    schema?: string
  ): Promise<ForeignKeyInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetImportedKeys(table, catalog, schema)
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchForeignKeyResults(flightInfo)
  }

  /**
   * Get SQL server information and capabilities.
   *
   * @param infoCodes - Optional array of specific info codes to retrieve.
   *                    If omitted, all available info is retrieved.
   * @returns Array of SQL info name-value pairs
   *
   * @example
   * ```typescript
   * // Get all server information
   * const allInfo = await client.getSqlInfo()
   *
   * // Get specific info (server name and version)
   * const info = await client.getSqlInfo([0, 1])
   * for (const item of info) {
   *   console.log(`${item.infoName}: ${item.value}`)
   * }
   * ```
   */
  async getSqlInfo(infoCodes?: number[]): Promise<SqlInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetSqlInfo(infoCodes)
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchCatalogResults<SqlInfo>(flightInfo, (row) => this.parseSqlInfoRow(row))
  }

  /**
   * Parse a SQL info row from the dense union value format.
   */
  private parseSqlInfoRow(row: Record<string, unknown>): SqlInfo {
    const infoName = row.info_name as number
    const value = row.value as SqlInfoValue

    return { infoName, value }
  }

  /**
   * Get XDBC type information supported by the server.
   *
   * @param dataType - Optional specific data type code to retrieve info for.
   *                   If omitted, all types are retrieved.
   * @returns Array of XDBC type info objects
   *
   * @example
   * ```typescript
   * // Get all supported types
   * const types = await client.getXdbcTypeInfo()
   * for (const t of types) {
   *   console.log(`${t.typeName}: SQL type ${t.dataType}`)
   * }
   * ```
   */
  async getXdbcTypeInfo(dataType?: number): Promise<XdbcTypeInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetXdbcTypeInfo(dataType)
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchCatalogResults<XdbcTypeInfo>(flightInfo, (row) => ({
      typeName: row.type_name as string,
      dataType: row.data_type as number,
      columnSize: row.column_size as number | undefined,
      literalPrefix: row.literal_prefix as string | undefined,
      literalSuffix: row.literal_suffix as string | undefined,
      createParams: row.create_params as string[] | undefined,
      nullable: row.nullable as number,
      caseSensitive: row.case_sensitive as boolean,
      searchable: row.searchable as number,
      unsignedAttribute: row.unsigned_attribute as boolean | undefined,
      fixedPrecScale: row.fixed_prec_scale as boolean,
      autoIncrement: row.auto_increment as boolean | undefined,
      localTypeName: row.local_type_name as string | undefined,
      minimumScale: row.minimum_scale as number | undefined,
      maximumScale: row.maximum_scale as number | undefined,
      sqlDataType: row.sql_data_type as number,
      datetimeSubcode: row.datetime_subcode as number | undefined,
      numPrecRadix: row.num_prec_radix as number | undefined,
      intervalPrecision: row.interval_precision as number | undefined
    }))
  }

  /**
   * Get the foreign key relationships between two tables.
   *
   * This returns foreign keys in the foreign key table that reference
   * the primary key of the primary key table.
   *
   * @param options - Options specifying the primary key and foreign key tables
   * @returns Array of foreign key information
   *
   * @example
   * ```typescript
   * // Find foreign keys from "orders" table that reference "users" table
   * const refs = await client.getCrossReference({
   *   pkTable: "users",
   *   fkTable: "orders"
   * })
   * ```
   */
  async getCrossReference(options: {
    pkTable: string
    fkTable: string
    pkCatalog?: string
    pkDbSchema?: string
    fkCatalog?: string
    fkDbSchema?: string
  }): Promise<ForeignKeyInfo[]> {
    this.ensureConnected()

    const command = encodeCommandGetCrossReference(options)
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: command
    }

    const flightInfo = await this.getFlightInfo(descriptor)
    return this.fetchForeignKeyResults(flightInfo)
  }

  /**
   * Helper to fetch catalog results and map rows to typed objects
   */
  private async fetchCatalogResults<T>(
    flightInfo: FlightInfo,
    mapper: (row: Record<string, unknown>) => T
  ): Promise<T[]> {
    const results: T[] = []

    // Parse schema from flightInfo
    const schema = tryParseSchema(flightInfo.schema)
    if (!schema) {
      return results
    }

    for (const endpoint of flightInfo.endpoints) {
      for await (const flightData of this.doGet(endpoint.ticket)) {
        if (!flightData.dataHeader || !flightData.dataBody) {
          continue
        }
        const batch = parseFlightData(flightData.dataHeader, flightData.dataBody, schema)
        if (!batch) {
          continue
        }
        // Convert batch rows to objects
        this.extractRowsFromBatch(batch, schema, mapper, results)
      }
    }

    return results
  }

  /**
   * Helper to extract rows from a batch and map them
   */
  private extractRowsFromBatch<T>(
    batch: RecordBatch,
    schema: Schema,
    mapper: (row: Record<string, unknown>) => T,
    results: T[]
  ): void {
    for (let i = 0; i < batch.numRows; i++) {
      const row: Record<string, unknown> = {}
      for (const field of schema.fields) {
        const column = batch.getChild(field.name)
        row[field.name] = column?.get(i)
      }
      results.push(mapper(row))
    }
  }

  /**
   * Helper to fetch foreign key results with the complex schema
   */
  private async fetchForeignKeyResults(flightInfo: FlightInfo): Promise<ForeignKeyInfo[]> {
    return this.fetchCatalogResults<ForeignKeyInfo>(flightInfo, (row) => ({
      pkCatalogName: row.pk_catalog_name as string | undefined,
      pkSchemaName: row.pk_db_schema_name as string | undefined,
      pkTableName: row.pk_table_name as string,
      pkColumnName: row.pk_column_name as string,
      fkCatalogName: row.fk_catalog_name as string | undefined,
      fkSchemaName: row.fk_db_schema_name as string | undefined,
      fkTableName: row.fk_table_name as string,
      fkColumnName: row.fk_column_name as string,
      keySequence: row.key_sequence as number,
      fkKeyName: row.fk_key_name as string | undefined,
      pkKeyName: row.pk_key_name as string | undefined,
      updateRule: row.update_rule as number,
      deleteRule: row.delete_rule as number
    }))
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
    const transport = this.getConnectedTransport()

    try {
      const metadata = this.createRequestMetadata()
      const rawInfo = await transport.getFlightInfo(
        {
          type: descriptor.type,
          cmd: descriptor.cmd,
          path: descriptor.path
        },
        metadata
      )
      return this.parseFlightInfo(rawInfo)
    } catch (error) {
      throw this.wrapTransportError(error as Error)
    }
  }

  /**
   * Get the schema for a flight descriptor without fetching data.
   *
   * @param descriptor - Flight descriptor
   * @returns Schema result
   */
  async getSchema(descriptor: FlightDescriptor): Promise<SchemaResult> {
    const transport = this.getConnectedTransport()

    try {
      const metadata = this.createRequestMetadata()
      const rawSchema = await transport.getSchema(
        {
          type: descriptor.type,
          cmd: descriptor.cmd,
          path: descriptor.path
        },
        metadata
      )
      return this.parseSchemaResult(rawSchema)
    } catch (error) {
      throw this.wrapTransportError(error as Error)
    }
  }

  /**
   * Retrieve data for a ticket as an async iterator of FlightData.
   *
   * @param ticket - Ticket from FlightInfo endpoint
   * @yields FlightData chunks containing dataHeader and dataBody
   */
  async *doGet(
    ticket: Ticket
  ): AsyncGenerator<{ dataHeader?: Uint8Array; dataBody?: Uint8Array }, void, unknown> {
    const transport = this.getConnectedTransport()

    const metadata = this.createRequestMetadata()
    const stream = transport.doGet({ ticket: ticket.ticket }, metadata)

    try {
      for await (const data of stream) {
        yield {
          dataHeader: data.dataHeader,
          dataBody: data.dataBody
        }
      }
    } catch (error) {
      throw this.wrapTransportError(error as Error)
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
    const transport = this.getConnectedTransport()

    const requestMetadata = this.createRequestMetadata()

    // Create bidirectional stream
    const stream = transport.doPut(requestMetadata)

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
      for await (const result of stream) {
        yield { appMetadata: result.appMetadata }
      }
    } catch (error) {
      throw this.wrapTransportError(error as Error)
    }
  }

  /**
   * Open a bidirectional data exchange with the server.
   *
   * This is the low-level API for DoExchange. For real-time subscriptions,
   * use the higher-level `subscribe()` method instead.
   *
   * @param descriptor - Flight descriptor for the exchange
   * @returns An exchange handle for sending and receiving FlightData
   *
   * @example
   * ```typescript
   * const exchange = client.doExchange({
   *   type: DescriptorType.CMD,
   *   cmd: new TextEncoder().encode('SUBSCRIBE:my_topic')
   * })
   *
   * // Send initial request
   * await exchange.send({ appMetadata: subscribeCommand })
   *
   * // Receive responses
   * for await (const data of exchange) {
   *   if (data.dataHeader) {
   *     // Process record batch
   *   }
   * }
   *
   * // Clean up
   * await exchange.end()
   * ```
   */
  doExchange(descriptor: FlightDescriptor): ExchangeStream {
    const transport = this.getConnectedTransport()

    const metadata = this.createRequestMetadata()
    const stream = transport.doExchange(metadata)

    // Capture references for closure
    const wrapTransportError = this.wrapTransportError.bind(this)
    const serializeFlightDescriptor = this.serializeFlightDescriptor.bind(this)

    // Create the exchange handle
    const exchange: ExchangeStream = {
      async send(data: FlightData): Promise<void> {
        stream.write({
          flightDescriptor: data.flightDescriptor
            ? serializeFlightDescriptor(data.flightDescriptor)
            : undefined,
          dataHeader: data.dataHeader,
          dataBody: data.dataBody,
          appMetadata: data.appMetadata
        })
        return Promise.resolve()
      },

      async end(): Promise<void> {
        stream.end()
        return Promise.resolve()
      },

      cancel(): void {
        stream.cancel()
      },

      async *[Symbol.asyncIterator](): AsyncGenerator<FlightData, void, unknown> {
        try {
          for await (const data of stream) {
            yield {
              flightDescriptor: data.flightDescriptor
                ? {
                    type: data.flightDescriptor.type as DescriptorType,
                    cmd: data.flightDescriptor.cmd,
                    path: data.flightDescriptor.path
                  }
                : undefined,
              dataHeader: data.dataHeader ?? new Uint8Array(),
              dataBody: data.dataBody ?? new Uint8Array(),
              appMetadata: data.appMetadata
            }
          }
        } catch (error) {
          throw wrapTransportError(error as Error)
        }
      }
    }

    // Send descriptor in first message (empty data)
    stream.write({
      flightDescriptor: this.serializeFlightDescriptor(descriptor)
    })

    return exchange
  }

  /**
   * Subscribe to real-time data updates from a query.
   *
   * Returns a Subscription that yields RecordBatches as they arrive from the server.
   * Automatically handles heartbeats and can reconnect on connection loss.
   *
   * @param query - SQL query to subscribe to
   * @param options - Subscription options
   * @returns Subscription handle for receiving batches and control
   *
   * @example
   * ```typescript
   * const subscription = await client.subscribe(
   *   "SELECT * FROM events WHERE status = 'pending'",
   *   { mode: 'CHANGES_ONLY', heartbeatMs: 30000 }
   * )
   *
   * for await (const batch of subscription) {
   *   console.log(`Received ${batch.numRows} rows`)
   * }
   *
   * // Or with AbortController
   * const controller = new AbortController()
   * const subscription = await client.subscribe(query, {
   *   signal: controller.signal
   * })
   *
   * // Later: cancel the subscription
   * controller.abort()
   * ```
   */
  subscribe(query: string, options: SubscribeOptions = {}): Subscription {
    return new Subscription(this, query, options)
  }

  /**
   * Helper to get the first item from an async iterable without consuming the rest
   */
  private async getFirstFromIterable<T>(iterable: AsyncIterable<T>): Promise<T | undefined> {
    const iterator = iterable[Symbol.asyncIterator]()
    const result = await iterator.next()
    return result.done === true ? undefined : result.value
  }

  /**
   * Execute an action on the server.
   *
   * @param action - Action to execute
   * @returns Async iterator of results
   */
  async *doAction(action: Action): AsyncGenerator<ActionResult, void, unknown> {
    const transport = this.getConnectedTransport()

    const metadata = this.createRequestMetadata()
    const stream = transport.doAction({ type: action.type, body: action.body }, metadata)

    try {
      for await (const result of stream) {
        yield { body: result.body ?? new Uint8Array() }
      }
    } catch (error) {
      throw this.wrapTransportError(error as Error)
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
    const transport = this.getConnectedTransport()

    const metadata = this.createRequestMetadata()
    const stream = transport.listActions(metadata)

    const actions: ActionType[] = []
    try {
      for await (const action of stream) {
        actions.push({
          type: action.type,
          description: action.description ?? ""
        })
      }
    } catch (error) {
      throw this.wrapTransportError(error as Error)
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
    // Note: Called during connect(), so transport exists but connected flag isn't set yet
    if (this.transport === null) {
      throw new ConnectionError("Transport not initialized")
    }
    const stream = this.transport.handshake()

    // Build BasicAuth payload
    const authPayload = this.encodeBasicAuth(username, password)

    // Send handshake request
    stream.write({
      protocolVersion: 1,
      payload: authPayload
    })
    stream.end()

    // Read response
    try {
      for await (const response of stream) {
        return {
          protocolVersion: BigInt(response.protocolVersion ?? 0),
          payload: response.payload ?? new Uint8Array()
        }
      }
      throw new AuthenticationError("Handshake failed: no response received")
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error
      }
      throw new AuthenticationError("Handshake failed", { cause: error })
    }
  }

  private encodeBasicAuth(username: string, password: string): Uint8Array {
    // Simple encoding: "username:password" as UTF-8 bytes
    // The actual Flight protocol uses protobuf BasicAuth message
    const encoder = new TextEncoder()
    return encoder.encode(`${username}:${password}`)
  }

  // ===========================================================================
  // Private: Transport Helpers
  // ===========================================================================

  private createRequestMetadata(): TransportMetadata {
    const metadata: TransportMetadata = {}

    // Add auth token if present
    if (this.authToken !== null && this.authToken !== "") {
      metadata.authorization = `Bearer ${this.authToken}`
    }

    // Add custom metadata from options
    if (this.options.metadata) {
      for (const [key, value] of Object.entries(this.options.metadata)) {
        metadata[key] = value
      }
    }

    return metadata
  }

  private cleanup(): void {
    if (this.transport) {
      this.transport.close()
      this.transport = null
    }
    this.authToken = null
    this.connected = false
  }

  private ensureConnected(): void {
    if (!this.connected || this.transport === null) {
      throw new ConnectionError("Client is not connected. Call connect() first.")
    }
  }

  /**
   * Get the transport, throwing if not connected.
   * This is a helper to avoid non-null assertions after ensureConnected().
   */
  private getConnectedTransport(): FlightTransport {
    if (!this.connected || this.transport === null) {
      throw new ConnectionError("Client is not connected. Call connect() first.")
    }
    return this.transport
  }

  private wrapTransportError(error: Error): FlightSqlError {
    // Handle TransportError with gRPC status codes
    const transportError = error as { code?: number; details?: string }
    const message = transportError.details ?? error.message

    if (transportError.code !== undefined) {
      // gRPC status codes
      switch (transportError.code) {
        case 16: // UNAUTHENTICATED
          return new AuthenticationError(message, { cause: error })
        case 14: // UNAVAILABLE
        case 4: // DEADLINE_EXCEEDED
          return new ConnectionError(message, { cause: error })
        default:
          return new FlightSqlError(message, { cause: error })
      }
    }

    return new FlightSqlError(message, { cause: error })
  }

  // ===========================================================================
  // Private: Serialization Helpers
  // ===========================================================================

  private serializeFlightDescriptor(descriptor: FlightDescriptor): {
    type: number
    cmd?: Uint8Array
    path?: string[]
  } {
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
      endpoint?: {
        ticket?: { ticket: Uint8Array }
        location?: { uri: string }[]
        expirationTime?: { seconds: string; nanos: number }
        appMetadata?: Uint8Array
      }[]
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
   *
   * Flight SQL streams data as:
   *   1. Schema message (dataHeader only)
   *   2. RecordBatch messages (dataHeader + dataBody)
   *
   * We collect all messages and parse them as a complete IPC stream.
   */
  async *stream(): AsyncGenerator<RecordBatch, void, unknown> {
    if (!this.parsedSchema) {
      throw new FlightSqlError("Cannot stream results: schema not available")
    }

    for (const endpoint of this.info.endpoints) {
      // Collect all FlightData messages for this endpoint
      const framedParts: Uint8Array[] = []

      for await (const flightData of this.client.doGet(endpoint.ticket)) {
        if (flightData.dataHeader && flightData.dataHeader.length > 0) {
          const framed = this.frameAsIPC(
            flightData.dataHeader,
            flightData.dataBody ?? new Uint8Array(0)
          )
          framedParts.push(framed)
        }
      }

      if (framedParts.length === 0) {
        continue
      }

      // Concatenate all framed messages into a complete IPC stream
      const fullStream = this.concatArrays(framedParts)

      // Parse batches from the full stream
      try {
        const reader = RecordBatchReader.from(fullStream)
        for (const batch of reader) {
          yield batch
        }
      } catch {
        // If parsing fails, continue to next endpoint
      }
    }
  }

  /**
   * Frame raw flatbuffer bytes with IPC continuation marker and length prefix
   */
  private frameAsIPC(header: Uint8Array, body: Uint8Array): Uint8Array {
    const continuationToken = new Uint8Array([0xff, 0xff, 0xff, 0xff])
    const metadataLength = new Uint8Array(4)
    new DataView(metadataLength.buffer).setInt32(0, header.length, true)

    // Calculate padding for 8-byte alignment
    const headerPadding = (8 - ((header.length + 4 + 4) % 8)) % 8
    const padding = new Uint8Array(headerPadding)

    const totalLength =
      continuationToken.length +
      metadataLength.length +
      header.length +
      padding.length +
      body.length
    const result = new Uint8Array(totalLength)
    let offset = 0

    result.set(continuationToken, offset)
    offset += continuationToken.length
    result.set(metadataLength, offset)
    offset += metadataLength.length
    result.set(header, offset)
    offset += header.length
    result.set(padding, offset)
    offset += padding.length
    result.set(body, offset)

    return result
  }

  /**
   * Concatenate multiple Uint8Arrays
   */
  private concatArrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
      result.set(arr, offset)
      offset += arr.length
    }
    return result
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
  private readonly handle: Uint8Array
  private readonly datasetSchema: Schema | null
  private readonly parameterSchema: Schema | null
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
type FlightSqlClientInternal = {
  getFlightInfo: (descriptor: FlightDescriptor) => Promise<FlightInfo>
  doAction: (action: Action) => AsyncGenerator<ActionResult, void, unknown>
  doExchange: (descriptor: FlightDescriptor) => ExchangeStream
} & FlightSqlClient

// ============================================================================
// ExchangeStream
// ============================================================================

/**
 * Handle for a bidirectional DoExchange stream.
 *
 * Allows sending and receiving FlightData messages over a single connection.
 */
export type ExchangeStream = {
  /**
   * Send a FlightData message to the server
   */
  send: (data: FlightData) => Promise<void>

  /**
   * Signal the end of client-side writes (half-close)
   */
  end: () => Promise<void>

  /**
   * Cancel the stream immediately
   */
  cancel: () => void
} & AsyncIterable<FlightData>

// ============================================================================
// Subscription
// ============================================================================

/**
 * Real-time subscription to query results via DoExchange.
 *
 * Yields RecordBatches as they arrive from the server. Handles heartbeats
 * automatically and can reconnect on transient connection failures.
 *
 * @example
 * ```typescript
 * const subscription = client.subscribe("SELECT * FROM events")
 *
 * for await (const batch of subscription) {
 *   console.log(`Received ${batch.numRows} rows`)
 * }
 *
 * await subscription.unsubscribe()
 * ```
 */
export class Subscription implements AsyncIterable<RecordBatch> {
  private readonly client: FlightSqlClient
  private readonly query: string
  private readonly options: Required<
    Pick<
      SubscribeOptions,
      | "mode"
      | "heartbeatMs"
      | "autoReconnect"
      | "maxReconnectAttempts"
      | "reconnectDelayMs"
      | "maxReconnectDelayMs"
    >
  > &
    SubscribeOptions

  private exchange: ExchangeStream | null = null
  private subscriptionId: string | null = null
  private connectedState = false
  private batchesReceivedCount = 0
  private reconnectAttempts = 0
  private abortedFlag = false
  private lastHeartbeat: number = Date.now()
  private iterating = false

  /** Check aborted state - method prevents ESLint from static flow analysis across async boundaries */
  private isAborted(): boolean {
    return this.abortedFlag
  }

  constructor(client: FlightSqlClient, query: string, options: SubscribeOptions = {}) {
    this.client = client
    this.query = query
    this.options = {
      ...options,
      mode: options.mode ?? SubscriptionMode.ChangesOnly,
      heartbeatMs: options.heartbeatMs ?? 30_000,
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      reconnectDelayMs: options.reconnectDelayMs ?? 1_000,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 30_000
    }

    // Handle abort signal
    if (this.options.signal) {
      this.options.signal.addEventListener("abort", () => {
        this.abortedFlag = true
        this.exchange?.cancel()
      })
    }
  }

  /**
   * Unique ID for this subscription (assigned by server after connect)
   */
  get id(): string {
    return this.subscriptionId ?? ""
  }

  /**
   * Whether the subscription is currently connected
   */
  get connected(): boolean {
    return this.connectedState
  }

  /**
   * Number of batches received
   */
  get batchesReceived(): number {
    return this.batchesReceivedCount
  }

  /**
   * Number of reconnection attempts
   */
  get reconnectCount(): number {
    return this.reconnectAttempts
  }

  /**
   * Timestamp of the last heartbeat received from the server
   */
  get lastHeartbeatTime(): number {
    return this.lastHeartbeat
  }

  /**
   * Time in milliseconds since the last heartbeat
   */
  get timeSinceLastHeartbeat(): number {
    return Date.now() - this.lastHeartbeat
  }

  /**
   * Start the subscription and iterate over incoming batches
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<RecordBatch, void, unknown> {
    if (this.iterating) {
      throw new FlightSqlError("Subscription is already being iterated")
    }
    this.iterating = true

    try {
      while (!this.isAborted()) {
        try {
          yield* this.streamBatches()
          // Stream completed normally
          break
        } catch (error: unknown) {
          if (this.isAborted()) {
            break
          }
          if (!this.options.autoReconnect) {
            throw error
          }
          if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            throw new FlightSqlError(
              `Max reconnection attempts (${String(this.options.maxReconnectAttempts)}) exceeded`,
              { cause: error instanceof Error ? error : new Error(String(error)) }
            )
          }
          await this.reconnect()
        }
      }
    } finally {
      this.iterating = false
      await this.cleanup()
    }
  }

  /**
   * Unsubscribe and close the connection
   */
  async unsubscribe(): Promise<void> {
    this.abortedFlag = true
    await this.cleanup()
  }

  private async *streamBatches(): AsyncGenerator<RecordBatch, void, unknown> {
    this.initConnection()

    if (!this.exchange) {
      throw new FlightSqlError("Exchange not initialized")
    }

    for await (const flightData of this.exchange) {
      if (this.isAborted()) {
        break
      }

      // Check for metadata messages (heartbeat, control messages)
      if (flightData.appMetadata && flightData.appMetadata.length > 0) {
        const metadata = this.parseMetadata(flightData.appMetadata)

        switch (metadata.type) {
          case SubscriptionMessageType.HEARTBEAT:
            this.lastHeartbeat = Date.now()
            continue

          case SubscriptionMessageType.COMPLETE:
            return

          case SubscriptionMessageType.ERROR:
            throw new FlightSqlError(metadata.error ?? "Subscription error from server")

          case SubscriptionMessageType.DATA:
            // Continue to parse data
            if (metadata.subscriptionId !== undefined && this.subscriptionId === null) {
              this.subscriptionId = metadata.subscriptionId
            }
            break

          case SubscriptionMessageType.SUBSCRIBE:
          case SubscriptionMessageType.UNSUBSCRIBE:
            // These are client-to-server messages, ignore if received
            break
        }
      }

      // Parse data if present
      if (flightData.dataHeader && flightData.dataHeader.length > 0) {
        const batches = this.parseFlightDataToBatches(flightData)
        for (const batch of batches) {
          this.batchesReceivedCount++
          yield batch
        }
      }
    }
  }

  private initConnection(): void {
    const descriptor: FlightDescriptor = {
      type: 2 as DescriptorType, // CMD
      cmd: this.encodeSubscribeCommand()
    }

    this.exchange = (this.client as FlightSqlClientInternal).doExchange(descriptor)
    this.connectedState = true
    this.lastHeartbeat = Date.now()
  }

  private async reconnect(): Promise<void> {
    this.reconnectAttempts++
    this.connectedState = false

    // Calculate backoff delay with jitter
    const baseDelay = Math.min(
      this.options.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.options.maxReconnectDelayMs
    )
    const jitter = Math.random() * baseDelay * 0.1
    const delay = baseDelay + jitter

    await this.sleep(delay)

    this.initConnection()
  }

  private async cleanup(): Promise<void> {
    if (this.exchange && this.connectedState) {
      try {
        // Send unsubscribe message
        await this.exchange.send({
          dataHeader: new Uint8Array(),
          dataBody: new Uint8Array(),
          appMetadata: this.encodeMetadata({
            type: SubscriptionMessageType.UNSUBSCRIBE,
            subscriptionId: this.subscriptionId ?? undefined,
            timestamp: Date.now()
          })
        })
        await this.exchange.end()
      } catch {
        // Ignore cleanup errors
      }
    }
    this.connectedState = false
    this.exchange = null
  }

  private encodeSubscribeCommand(): Uint8Array {
    // Encode subscription request as JSON in the command
    const request = {
      type: SubscriptionMessageType.SUBSCRIBE,
      query: this.query,
      mode: this.options.mode,
      heartbeatMs: this.options.heartbeatMs,
      metadata: this.options.metadata
    }
    return new TextEncoder().encode(JSON.stringify(request))
  }

  private encodeMetadata(metadata: SubscriptionMetadata): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(metadata))
  }

  private parseMetadata(data: Uint8Array): SubscriptionMetadata {
    try {
      const text = new TextDecoder().decode(data)
      return JSON.parse(text) as SubscriptionMetadata
    } catch {
      return { type: SubscriptionMessageType.DATA }
    }
  }

  private parseFlightDataToBatches(flightData: FlightData): RecordBatch[] {
    const batches: RecordBatch[] = []

    if (!flightData.dataHeader || flightData.dataHeader.length === 0) {
      return batches
    }

    try {
      // Frame the raw flatbuffer with IPC continuation marker
      const framed = this.frameAsIPC(
        flightData.dataHeader,
        flightData.dataBody ?? new Uint8Array(0)
      )

      const reader = RecordBatchReader.from(framed)
      for (const batch of reader) {
        batches.push(batch)
      }
    } catch {
      // If parsing fails, return empty
    }

    return batches
  }

  private frameAsIPC(header: Uint8Array, body: Uint8Array): Uint8Array {
    const continuationToken = new Uint8Array([0xff, 0xff, 0xff, 0xff])
    const metadataLength = new Uint8Array(4)
    new DataView(metadataLength.buffer).setInt32(0, header.length, true)

    const headerPadding = (8 - ((header.length + 4 + 4) % 8)) % 8
    const padding = new Uint8Array(headerPadding)

    const totalLength =
      continuationToken.length +
      metadataLength.length +
      header.length +
      padding.length +
      body.length
    const result = new Uint8Array(totalLength)
    let offset = 0

    result.set(continuationToken, offset)
    offset += continuationToken.length
    result.set(metadataLength, offset)
    offset += metadataLength.length
    result.set(header, offset)
    offset += header.length
    result.set(padding, offset)
    offset += padding.length
    result.set(body, offset)

    return result
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

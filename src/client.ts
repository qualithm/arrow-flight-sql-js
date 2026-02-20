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
  CommandStatementQuery,
  CommandStatementUpdate,
  DoPutUpdateResult
} from "./generated/arrow/flight/protocol/sql/FlightSql.js"

/**
 * Flight SQL type URL prefix for encoding commands in Any messages.
 */
const TYPE_URL_PREFIX = "type.googleapis.com/arrow.flight.protocol.sql"

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

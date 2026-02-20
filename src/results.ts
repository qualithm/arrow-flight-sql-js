/**
 * Result set iteration utilities for Flight SQL queries.
 *
 * @packageDocumentation
 */
import type { FlightData, FlightInfo, Ticket } from "@qualithm/arrow-flight-js"
import { tableFromIPC } from "apache-arrow"

import type { FlightSqlClient } from "./client.js"
import { FlightSqlError } from "./errors.js"

/**
 * Options for iterating over query results.
 */
export type ResultIteratorOptions = {
  /**
   * Maximum number of rows to return.
   * If not specified, all rows are returned.
   */
  limit?: number
}

/**
 * Collects all FlightData from a doGet stream into Arrow IPC bytes.
 *
 * @param dataStream - The async iterable of FlightData messages
 * @returns Combined IPC bytes for all batches
 */
async function collectFlightData(
  dataStream: AsyncGenerator<FlightData, void, undefined>
): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = []

  for await (const data of dataStream) {
    // The first message contains the schema in dataHeader
    if (data.dataHeader.length > 0) {
      chunks.push(data.dataHeader)
    }
    // Data body contains the actual record batch
    if (data.dataBody.length > 0) {
      chunks.push(data.dataBody)
    }
  }

  return chunks
}

/**
 * Executes a query and returns results as an Arrow Table.
 *
 * This is a convenience function that handles the entire query workflow:
 * 1. Executes the query to get FlightInfo
 * 2. Retrieves data from all endpoints
 * 3. Combines the data into an Arrow Table
 *
 * @param client - The FlightSqlClient to use
 * @param query - The SQL query to execute
 * @returns An Arrow Table containing all query results
 *
 * @example
 * ```ts
 * import { queryToTable } from "@qualithm/arrow-flight-sql-js"
 *
 * const table = await queryToTable(client, "SELECT * FROM users LIMIT 100")
 * console.log("Rows:", table.numRows)
 * console.log("Columns:", table.schema.fields.map(f => f.name))
 *
 * // Iterate over rows
 * for (const row of table) {
 *   console.log(row.toJSON())
 * }
 * ```
 */
export async function queryToTable(
  client: FlightSqlClient,
  query: string
): Promise<ReturnType<typeof tableFromIPC>> {
  const info = await client.query(query)
  return flightInfoToTable(client, info)
}

/**
 * Retrieves data from FlightInfo and returns it as an Arrow Table.
 *
 * @param client - The FlightSqlClient to use
 * @param info - The FlightInfo from a query
 * @returns An Arrow Table containing all data from the endpoints
 *
 * @example
 * ```ts
 * const info = await client.query("SELECT * FROM users")
 * const table = await flightInfoToTable(client, info)
 * ```
 */
export async function flightInfoToTable(
  client: FlightSqlClient,
  info: FlightInfo
): Promise<ReturnType<typeof tableFromIPC>> {
  const allChunks: Uint8Array[] = []

  for (const endpoint of info.endpoint) {
    if (!endpoint.ticket) {
      continue
    }

    const dataStream = client.doGet(endpoint.ticket)
    const chunks = await collectFlightData(dataStream)
    allChunks.push(...chunks)
  }

  if (allChunks.length === 0) {
    throw new FlightSqlError("no data returned from query", "RESULT_ERROR", {
      flightCode: "NOT_FOUND"
    })
  }

  // Combine all chunks and parse as IPC
  const totalLength = allChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of allChunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }

  return tableFromIPC(combined)
}

/**
 * Iterates over query results as Arrow record batches.
 *
 * This is useful for processing large result sets without loading
 * everything into memory at once.
 *
 * @param client - The FlightSqlClient to use
 * @param info - The FlightInfo from a query
 * @yields FlightData messages containing Arrow IPC data
 *
 * @example
 * ```ts
 * const info = await client.query("SELECT * FROM large_table")
 *
 * for await (const data of iterateResults(client, info)) {
 *   // Process each batch of data
 *   console.log("Received batch:", data.dataBody.length, "bytes")
 * }
 * ```
 */
export async function* iterateResults(
  client: FlightSqlClient,
  info: FlightInfo
): AsyncGenerator<FlightData, void, undefined> {
  for (const endpoint of info.endpoint) {
    if (!endpoint.ticket) {
      continue
    }
    yield* client.doGet(endpoint.ticket)
  }
}

/**
 * Gets a single ticket's data as an Arrow Table.
 *
 * @param client - The FlightSqlClient to use
 * @param ticket - The ticket to retrieve
 * @returns An Arrow Table containing the ticket's data
 */
export async function ticketToTable(
  client: FlightSqlClient,
  ticket: Ticket
): Promise<ReturnType<typeof tableFromIPC>> {
  const dataStream = client.doGet(ticket)
  const chunks = await collectFlightData(dataStream)

  if (chunks.length === 0) {
    throw new FlightSqlError("no data returned from ticket", "RESULT_ERROR", {
      flightCode: "NOT_FOUND"
    })
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }

  return tableFromIPC(combined)
}

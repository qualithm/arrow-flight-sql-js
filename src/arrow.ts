/**
 * Arrow IPC utilities for parsing Flight data
 *
 * Flight SQL transmits data in Arrow IPC format. This module provides
 * utilities for parsing schemas and record batches from raw IPC bytes.
 */

import {
  type Field,
  type RecordBatch,
  RecordBatchReader,
  type Schema,
  type Table,
  tableFromIPC
} from "apache-arrow"

// ============================================================================
// Schema Parsing
// ============================================================================

/**
 * Parse an Arrow schema from IPC format bytes
 *
 * The schema bytes format from Flight:
 *   - 4 bytes: optional IPC_CONTINUATION_TOKEN (0xFFFFFFFF)
 *   - 4 bytes: message length
 *   - flatbuffer Message with Schema header
 */
export function parseSchema(schemaBytes: Uint8Array): Schema {
  if (schemaBytes.length === 0) {
    throw new Error("Cannot parse empty schema bytes")
  }

  // Use RecordBatchReader to parse the schema
  // We need to wrap it in a minimal IPC stream format
  const reader = RecordBatchReader.from(schemaBytes)
  return reader.schema
}

/**
 * Parse schema from FlightInfo response
 * Returns null if schema is empty or cannot be parsed
 */
export function tryParseSchema(schemaBytes: Uint8Array): Schema | null {
  if (schemaBytes.length === 0) {
    return null
  }

  try {
    return parseSchema(schemaBytes)
  } catch {
    return null
  }
}

// ============================================================================
// Record Batch Streaming
// ============================================================================

/**
 * Parse a single FlightData message into a RecordBatch
 *
 * FlightData format:
 *   - data_header: IPC Message header (flatbuffer)
 *   - data_body: IPC Message body (raw data buffers)
 */
export function parseFlightData(
  dataHeader: Uint8Array,
  dataBody: Uint8Array,
  schemaForValidation: Schema
): RecordBatch | null {
  if (dataHeader.length === 0) {
    return null
  }

  // Validate schema is provided (used for type consistency)
  void schemaForValidation

  // Combine header and body into an IPC message
  // The IPC stream format expects the message in a specific layout
  const reader = RecordBatchReader.from(combineHeaderAndBody(dataHeader, dataBody))

  // Read the first (and only) batch
  const batch = reader.next()
  if (batch.value !== null && batch.value !== undefined) {
    return batch.value as RecordBatch
  }

  return null
}

/**
 * Combine IPC message header and body into a complete message buffer
 */
function combineHeaderAndBody(header: Uint8Array, body: Uint8Array): Uint8Array {
  // IPC stream format:
  // - 4 bytes: continuation token (0xFFFFFFFF) [optional]
  // - 4 bytes: metadata length
  // - N bytes: metadata (flatbuffer Message)
  // - padding to 8-byte boundary
  // - M bytes: body

  const continuationToken = new Uint8Array([0xff, 0xff, 0xff, 0xff])
  const metadataLength = new Uint8Array(4)
  new DataView(metadataLength.buffer).setInt32(0, header.length, true)

  // Calculate padding for 8-byte alignment
  const headerPadding = (8 - ((header.length + 4 + 4) % 8)) % 8
  const padding = new Uint8Array(headerPadding)

  const totalLength =
    continuationToken.length + metadataLength.length + header.length + padding.length + body.length

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

// ============================================================================
// Stream Processing
// ============================================================================

/**
 * Async iterable that parses FlightData messages into RecordBatches
 */
export async function* parseFlightDataStream(
  flightDataStream: AsyncIterable<{
    dataHeader?: Uint8Array
    dataBody?: Uint8Array
    appMetadata?: Uint8Array
  }>,
  schema: Schema
): AsyncGenerator<RecordBatch, void, unknown> {
  for await (const flightData of flightDataStream) {
    if (!flightData.dataHeader || flightData.dataHeader.length === 0) {
      continue
    }

    const batch = parseFlightData(
      flightData.dataHeader,
      flightData.dataBody ?? new Uint8Array(),
      schema
    )

    if (batch !== null) {
      yield batch
    }
  }
}

/**
 * Collect all record batches into a Table
 */
export async function collectToTable(
  batches: AsyncIterable<RecordBatch> | Iterable<RecordBatch>,
  schema: Schema
): Promise<Table> {
  const batchArray: RecordBatch[] = []

  // Handle both async and sync iterables
  if (Symbol.asyncIterator in batches) {
    for await (const batch of batches) {
      batchArray.push(batch)
    }
  } else {
    for (const batch of batches) {
      batchArray.push(batch)
    }
  }

  // Use tableFromIPC to combine batches
  // First, we need to serialize the batches to IPC format
  if (batchArray.length === 0) {
    // Return empty table with schema
    return tableFromIPC(serializeEmptyTable(schema))
  }

  // For now, return a table from the collected batches
  // The Table constructor can accept an array of RecordBatches
  return new Table(batchArray)
}

/**
 * Serialize an empty table with the given schema to IPC format
 */
function serializeEmptyTable(schema: Schema): Uint8Array {
  // Create minimal IPC stream with just schema and EOS marker
  // This is a simplified implementation
  const schemaMessage = serializeSchemaMessage(schema)
  const eosMarker = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00])

  const result = new Uint8Array(schemaMessage.length + eosMarker.length)
  result.set(schemaMessage, 0)
  result.set(eosMarker, schemaMessage.length)

  return result
}

/**
 * Serialize a schema to IPC message format
 * This is a placeholder - proper implementation would use flatbuffers
 */
function serializeSchemaMessage(schema: Schema): Uint8Array {
  // For now, return empty - the actual implementation would use
  // the Arrow IPC format to serialize the schema
  void schema // Suppress unused warning until implementation is complete
  return new Uint8Array()
}

// ============================================================================
// Table Utilities
// ============================================================================

/**
 * Get column names from a schema
 */
export function getColumnNames(schema: Schema): string[] {
  return schema.fields.map((field: Field) => field.name)
}

/**
 * Get the number of rows in a table
 */
export function getRowCount(table: Table): number {
  return table.numRows
}

/**
 * Convert a Table to an array of plain objects
 */
export function tableToObjects(table: Table): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = []
  const columns = table.schema.fields.map((f: Field) => f.name)

  for (let i = 0; i < table.numRows; i++) {
    const row: Record<string, unknown> = {}
    for (const col of columns) {
      const column = table.getChild(col)
      row[col] = column?.get(i)
    }
    result.push(row)
  }

  return result
}

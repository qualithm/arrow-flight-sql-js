/**
 * Arrow IPC utilities for parsing Flight data
 *
 * Flight SQL transmits data in Arrow IPC format. This module provides
 * utilities for parsing schemas and record batches from raw IPC bytes.
 */

import {
  type Field,
  MessageHeader,
  MessageReader,
  type RecordBatch,
  RecordBatchReader,
  RecordBatchStreamWriter,
  type Schema,
  Table,
  tableFromIPC
} from "apache-arrow"

// ============================================================================
// Schema Parsing
// ============================================================================

/**
 * Parse an Arrow schema from IPC format bytes
 *
 * The schema bytes format from Flight:
 *   - 4 bytes: IPC_CONTINUATION_TOKEN (0xFFFFFFFF)
 *   - 4 bytes: message length
 *   - flatbuffer Message with Schema header
 *
 * Uses MessageReader to parse schema-only IPC messages, which is the correct
 * approach for FlightInfo.schema bytes (as opposed to RecordBatchReader which
 * expects a full IPC stream with record batches).
 */
export function parseSchema(schemaBytes: Uint8Array): Schema {
  if (schemaBytes.length === 0) {
    throw new Error("Cannot parse empty schema bytes")
  }

  // Use MessageReader which can parse schema-only IPC messages
  const reader = new MessageReader(schemaBytes)
  const schema = reader.readSchema()

  if (!schema) {
    throw new Error("Failed to parse schema from IPC message")
  }

  return schema
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
 * Flight sends data in a streaming format where:
 *   - First message: Schema (dataHeader only, no dataBody)
 *   - Subsequent messages: RecordBatch (dataHeader + dataBody)
 *
 * The dataHeader is a raw flatbuffer Message (without IPC framing).
 * We need to frame it before passing to apache-arrow.
 *
 * @param dataHeader - IPC Message flatbuffer (without continuation/length prefix)
 * @param dataBody - IPC Message body (raw data buffers)
 * @param schema - Schema to use for parsing (from FlightInfo or first message)
 */
export function parseFlightData(
  dataHeader: Uint8Array,
  dataBody: Uint8Array,
  schema: Schema
): RecordBatch | null {
  if (dataHeader.length === 0) {
    return null
  }

  // Frame the header with IPC continuation marker + length prefix
  const framedData = frameAsIPC(dataHeader, dataBody)

  // Check if this is a schema message (skip it, we already have schema)
  const msgReader = new MessageReader(framedData)
  const msg = msgReader.readMessage()
  if (!msg || msg.headerType === MessageHeader.Schema) {
    return null // Schema message, no batch to return
  }

  // For RecordBatch messages, we need a complete IPC stream with schema + batch
  // Create a minimal stream with schema first, then this batch
  const schemaBytes = serializeSchemaMessage(schema)
  const fullStream = concatArrays([schemaBytes, framedData])

  try {
    const reader = RecordBatchReader.from(fullStream)
    const batch = reader.next()
    if (batch.value !== null && batch.value !== undefined) {
      return batch.value as RecordBatch
    }
  } catch {
    // If parsing fails, return null
  }

  return null
}

/**
 * Frame raw flatbuffer bytes with IPC continuation marker and length prefix
 */
function frameAsIPC(header: Uint8Array, body: Uint8Array): Uint8Array {
  const continuationToken = new Uint8Array([0xff, 0xff, 0xff, 0xff])
  const metadataLength = new Uint8Array(4)
  new DataView(metadataLength.buffer).setInt32(0, header.length, true)

  // Calculate padding for 8-byte alignment
  const headerPadding = (8 - ((header.length + 4 + 4) % 8)) % 8
  const padding = new Uint8Array(headerPadding)

  return concatArrays([continuationToken, metadataLength, header, padding, body])
}

/**
 * Serialize a schema to IPC message format
 */
function serializeSchemaMessage(schema: Schema): Uint8Array {
  // The schema from FlightInfo is already in IPC format with framing
  // We need to extract just the schema portion

  // For now, use a workaround: create an empty table with the schema
  // and extract the schema message from the IPC representation
  const emptyTable = new Table(schema)
  const ipcBytes = tableToIPCBytes(emptyTable)

  // The IPC stream starts with schema message - extract just that part
  // Read the first message (schema)
  const reader = new MessageReader(ipcBytes)
  const msg = reader.readMessage()
  if (msg?.headerType === MessageHeader.Schema) {
    // Return the schema portion
    // The reader consumes: continuation(4) + length(4) + header + padding
    const metadataLength = new DataView(ipcBytes.buffer, 4, 4).getInt32(0, true)
    const headerPadding = (8 - ((metadataLength + 4 + 4) % 8)) % 8
    const schemaEnd = 4 + 4 + metadataLength + headerPadding
    return ipcBytes.slice(0, schemaEnd)
  }

  // Fallback: shouldn't happen
  return new Uint8Array(0)
}

/**
 * Helper to serialize a Table to IPC stream bytes
 */
function tableToIPCBytes(table: Table): Uint8Array {
  const writer = RecordBatchStreamWriter.throughNode()
  const chunks: Uint8Array[] = []

  // Collect chunks synchronously
  writer.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk)
  })

  // Write all batches
  for (const batch of table.batches) {
    writer.write(batch)
  }
  writer.end()

  return concatArrays(chunks)
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concatArrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
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

// serializeSchemaMessage is defined above

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

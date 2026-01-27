/**
 * Protobuf encoding utilities for Flight SQL commands
 *
 * Flight SQL uses protobuf "Any" type messages in FlightDescriptor.cmd.
 * The encoding format is:
 *   - Type URL field (field 1, length-delimited): type.googleapis.com/...
 *   - Value field (field 2, length-delimited): serialized protobuf message
 *
 * This module provides manual protobuf encoding without requiring a full
 * protobuf runtime library, keeping the bundle size small.
 */

// ============================================================================
// Type URLs for Flight SQL commands
// ============================================================================

const typeUrlPrefix = "type.googleapis.com/arrow.flight.protocol.sql."

export const TypeUrls = {
  commandStatementQuery: `${typeUrlPrefix}CommandStatementQuery`,
  commandStatementUpdate: `${typeUrlPrefix}CommandStatementUpdate`,
  commandPreparedStatementQuery: `${typeUrlPrefix}CommandPreparedStatementQuery`,
  commandPreparedStatementUpdate: `${typeUrlPrefix}CommandPreparedStatementUpdate`,
  commandGetCatalogs: `${typeUrlPrefix}CommandGetCatalogs`,
  commandGetDbSchemas: `${typeUrlPrefix}CommandGetDbSchemas`,
  commandGetTables: `${typeUrlPrefix}CommandGetTables`,
  commandGetTableTypes: `${typeUrlPrefix}CommandGetTableTypes`,
  commandGetPrimaryKeys: `${typeUrlPrefix}CommandGetPrimaryKeys`,
  commandGetExportedKeys: `${typeUrlPrefix}CommandGetExportedKeys`,
  commandGetImportedKeys: `${typeUrlPrefix}CommandGetImportedKeys`,
  commandGetSqlInfo: `${typeUrlPrefix}CommandGetSqlInfo`,
  actionCreatePreparedStatementRequest: `${typeUrlPrefix}ActionCreatePreparedStatementRequest`,
  actionClosePreparedStatementRequest: `${typeUrlPrefix}ActionClosePreparedStatementRequest`
} as const

// ============================================================================
// Protobuf wire format encoding
// ============================================================================

/**
 * Protobuf wire types
 */
const wireType = {
  varint: 0,
  fixed64: 1,
  lengthDelimited: 2,
  fixed32: 5
} as const

/**
 * Encode a varint (variable-length integer)
 */
function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = []
  let v = value >>> 0 // Ensure unsigned

  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  bytes.push(v)

  return new Uint8Array(bytes)
}

/**
 * Encode a field tag (field number + wire type)
 */
function encodeTag(fieldNumber: number, wt: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wt)
}

/**
 * Encode a string as a length-delimited field
 */
function encodeString(fieldNumber: number, value: string): Uint8Array {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)

  const tag = encodeTag(fieldNumber, wireType.lengthDelimited)
  const length = encodeVarint(bytes.length)

  const result = new Uint8Array(tag.length + length.length + bytes.length)
  result.set(tag, 0)
  result.set(length, tag.length)
  result.set(bytes, tag.length + length.length)

  return result
}

/**
 * Encode bytes as a length-delimited field
 */
function encodeBytes(fieldNumber: number, value: Uint8Array): Uint8Array {
  const tag = encodeTag(fieldNumber, wireType.lengthDelimited)
  const length = encodeVarint(value.length)

  const result = new Uint8Array(tag.length + length.length + value.length)
  result.set(tag, 0)
  result.set(length, tag.length)
  result.set(value, tag.length + length.length)

  return result
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concat(...arrays: Uint8Array[]): Uint8Array {
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
// Flight SQL Command Encoders
// ============================================================================

/**
 * Wrap a protobuf message in an Any type envelope
 *
 * Any message format:
 *   field 1 (string): type_url
 *   field 2 (bytes): value (serialized message)
 */
function wrapInAny(typeUrl: string, message: Uint8Array): Uint8Array {
  const typeUrlField = encodeString(1, typeUrl)
  const valueField = encodeBytes(2, message)
  return concat(typeUrlField, valueField)
}

/**
 * Encode CommandStatementQuery message
 *
 * message CommandStatementQuery {
 *   string query = 1;
 *   optional bytes transaction_id = 2;
 * }
 */
export function encodeCommandStatementQuery(query: string, transactionId?: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [encodeString(1, query)]

  if (transactionId && transactionId.length > 0) {
    parts.push(encodeBytes(2, transactionId))
  }

  const message = concat(...parts)
  return wrapInAny(TypeUrls.commandStatementQuery, message)
}

/**
 * Encode CommandStatementUpdate message
 *
 * message CommandStatementUpdate {
 *   string query = 1;
 *   optional bytes transaction_id = 2;
 * }
 */
export function encodeCommandStatementUpdate(
  query: string,
  transactionId?: Uint8Array
): Uint8Array {
  const parts: Uint8Array[] = [encodeString(1, query)]

  if (transactionId && transactionId.length > 0) {
    parts.push(encodeBytes(2, transactionId))
  }

  const message = concat(...parts)
  return wrapInAny(TypeUrls.commandStatementUpdate, message)
}

/**
 * Encode CommandPreparedStatementQuery message
 *
 * message CommandPreparedStatementQuery {
 *   bytes prepared_statement_handle = 1;
 * }
 */
export function encodeCommandPreparedStatementQuery(
  preparedStatementHandle: Uint8Array
): Uint8Array {
  const message = encodeBytes(1, preparedStatementHandle)
  return wrapInAny(TypeUrls.commandPreparedStatementQuery, message)
}

/**
 * Encode CommandPreparedStatementUpdate message
 *
 * message CommandPreparedStatementUpdate {
 *   bytes prepared_statement_handle = 1;
 * }
 */
export function encodeCommandPreparedStatementUpdate(
  preparedStatementHandle: Uint8Array
): Uint8Array {
  const message = encodeBytes(1, preparedStatementHandle)
  return wrapInAny(TypeUrls.commandPreparedStatementUpdate, message)
}

/**
 * Encode ActionCreatePreparedStatementRequest message
 *
 * message ActionCreatePreparedStatementRequest {
 *   string query = 1;
 *   optional bytes transaction_id = 2;
 * }
 */
export function encodeActionCreatePreparedStatementRequest(
  query: string,
  transactionId?: Uint8Array
): Uint8Array {
  const parts: Uint8Array[] = [encodeString(1, query)]

  if (transactionId && transactionId.length > 0) {
    parts.push(encodeBytes(2, transactionId))
  }

  const message = concat(...parts)
  return wrapInAny(TypeUrls.actionCreatePreparedStatementRequest, message)
}

/**
 * Encode ActionClosePreparedStatementRequest message
 *
 * message ActionClosePreparedStatementRequest {
 *   bytes prepared_statement_handle = 1;
 * }
 */
export function encodeActionClosePreparedStatementRequest(
  preparedStatementHandle: Uint8Array
): Uint8Array {
  const message = encodeBytes(1, preparedStatementHandle)
  return wrapInAny(TypeUrls.actionClosePreparedStatementRequest, message)
}

/**
 * Encode CommandGetCatalogs message (empty message)
 */
export function encodeCommandGetCatalogs(): Uint8Array {
  return wrapInAny(TypeUrls.commandGetCatalogs, new Uint8Array())
}

/**
 * Encode CommandGetDbSchemas message
 *
 * message CommandGetDbSchemas {
 *   optional string catalog = 1;
 *   optional string db_schema_filter_pattern = 2;
 * }
 */
export function encodeCommandGetDbSchemas(
  catalog?: string,
  dbSchemaFilterPattern?: string
): Uint8Array {
  const parts: Uint8Array[] = []

  if (catalog !== undefined) {
    parts.push(encodeString(1, catalog))
  }

  if (dbSchemaFilterPattern !== undefined) {
    parts.push(encodeString(2, dbSchemaFilterPattern))
  }

  const message = concat(...parts)
  return wrapInAny(TypeUrls.commandGetDbSchemas, message)
}

/**
 * Encode CommandGetTables message
 *
 * message CommandGetTables {
 *   optional string catalog = 1;
 *   optional string db_schema_filter_pattern = 2;
 *   optional string table_name_filter_pattern = 3;
 *   repeated string table_types = 4;
 *   bool include_schema = 5;
 * }
 */
export function encodeCommandGetTables(options: {
  catalog?: string
  dbSchemaFilterPattern?: string
  tableNameFilterPattern?: string
  tableTypes?: string[]
  includeSchema?: boolean
}): Uint8Array {
  const parts: Uint8Array[] = []

  if (options.catalog !== undefined) {
    parts.push(encodeString(1, options.catalog))
  }

  if (options.dbSchemaFilterPattern !== undefined) {
    parts.push(encodeString(2, options.dbSchemaFilterPattern))
  }

  if (options.tableNameFilterPattern !== undefined) {
    parts.push(encodeString(3, options.tableNameFilterPattern))
  }

  if (options.tableTypes) {
    for (const tableType of options.tableTypes) {
      parts.push(encodeString(4, tableType))
    }
  }

  if (options.includeSchema) {
    // Boolean true encoded as varint 1
    parts.push(concat(encodeTag(5, wireType.varint), encodeVarint(1)))
  }

  const message = concat(...parts)
  return wrapInAny(TypeUrls.commandGetTables, message)
}

/**
 * Encode CommandGetTableTypes message (empty message)
 */
export function encodeCommandGetTableTypes(): Uint8Array {
  return wrapInAny(TypeUrls.commandGetTableTypes, new Uint8Array())
}

/**
 * Encode CommandGetPrimaryKeys message
 *
 * message CommandGetPrimaryKeys {
 *   optional string catalog = 1;
 *   optional string db_schema = 2;
 *   string table = 3;
 * }
 */
export function encodeCommandGetPrimaryKeys(
  table: string,
  catalog?: string,
  dbSchema?: string
): Uint8Array {
  const parts: Uint8Array[] = []

  if (catalog !== undefined) {
    parts.push(encodeString(1, catalog))
  }

  if (dbSchema !== undefined) {
    parts.push(encodeString(2, dbSchema))
  }

  parts.push(encodeString(3, table))

  const message = concat(...parts)
  return wrapInAny(TypeUrls.commandGetPrimaryKeys, message)
}

// ============================================================================
// Protobuf Decoding Utilities
// ============================================================================

/**
 * Simple protobuf field reader for decoding responses
 */
export interface ProtoField {
  fieldNumber: number
  wireType: number
  value: Uint8Array | number | bigint
}

/**
 * Decode varint from buffer at offset, returns [value, bytesRead]
 */
function decodeVarint(buffer: Uint8Array, offset: number): [number, number] {
  let result = 0
  let shift = 0
  let bytesRead = 0

  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead]
    result |= (byte & 0x7f) << shift

    bytesRead++

    if ((byte & 0x80) === 0) {
      break
    }

    shift += 7
  }

  return [result >>> 0, bytesRead]
}

/**
 * Parse protobuf fields from a buffer
 */
export function parseProtoFields(buffer: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = []
  let offset = 0

  while (offset < buffer.length) {
    const [tag, tagBytes] = decodeVarint(buffer, offset)
    offset += tagBytes

    const fieldNumber = tag >>> 3
    const wt = tag & 0x7

    let value: Uint8Array | number | bigint

    switch (wt) {
      case wireType.varint: {
        const [v, vBytes] = decodeVarint(buffer, offset)
        offset += vBytes
        value = v
        break
      }

      case wireType.fixed64: {
        value = buffer.slice(offset, offset + 8)
        offset += 8
        break
      }

      case wireType.lengthDelimited: {
        const [length, lenBytes] = decodeVarint(buffer, offset)
        offset += lenBytes
        value = buffer.slice(offset, offset + length)
        offset += length
        break
      }

      case wireType.fixed32: {
        value = buffer.slice(offset, offset + 4)
        offset += 4
        break
      }

      default:
        throw new Error(`Unknown wire type: ${String(wt)}`)
    }

    fields.push({ fieldNumber, wireType: wt, value })
  }

  return fields
}

/**
 * Get a string field from parsed proto fields
 */
export function getStringField(fields: ProtoField[], fieldNumber: number): string | undefined {
  const field = fields.find((f) => f.fieldNumber === fieldNumber)
  if (field && field.value instanceof Uint8Array) {
    return new TextDecoder().decode(field.value)
  }
  return undefined
}

/**
 * Get a bytes field from parsed proto fields
 */
export function getBytesField(fields: ProtoField[], fieldNumber: number): Uint8Array | undefined {
  const field = fields.find((f) => f.fieldNumber === fieldNumber)
  if (field && field.value instanceof Uint8Array) {
    return field.value
  }
  return undefined
}

/**
 * Get a number field from parsed proto fields
 */
export function getNumberField(fields: ProtoField[], fieldNumber: number): number | undefined {
  const field = fields.find((f) => f.fieldNumber === fieldNumber)
  if (field && typeof field.value === "number") {
    return field.value
  }
  return undefined
}

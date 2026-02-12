/**
 * Unit tests for protobuf encoding/decoding utilities
 */

import { describe, expect, test } from "bun:test"

import {
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
  encodeCommandStatementQuery,
  encodeCommandStatementUpdate,
  getBytesField,
  getNumberField,
  getStringField,
  parseProtoFields,
  TypeUrls
} from "../../proto"

describe("TypeUrls", () => {
  test("should have correct type URL prefix", () => {
    expect(TypeUrls.commandStatementQuery).toContain("arrow.flight.protocol.sql")
    expect(TypeUrls.commandStatementUpdate).toContain("arrow.flight.protocol.sql")
  })

  test("should have all required type URLs", () => {
    expect(TypeUrls.commandStatementQuery).toBeDefined()
    expect(TypeUrls.commandStatementUpdate).toBeDefined()
    expect(TypeUrls.commandGetCatalogs).toBeDefined()
    expect(TypeUrls.commandGetDbSchemas).toBeDefined()
    expect(TypeUrls.commandGetTables).toBeDefined()
    expect(TypeUrls.commandGetTableTypes).toBeDefined()
    expect(TypeUrls.commandGetPrimaryKeys).toBeDefined()
    expect(TypeUrls.commandGetExportedKeys).toBeDefined()
    expect(TypeUrls.commandGetImportedKeys).toBeDefined()
    expect(TypeUrls.commandGetSqlInfo).toBeDefined()
    expect(TypeUrls.commandGetXdbcTypeInfo).toBeDefined()
    expect(TypeUrls.commandGetCrossReference).toBeDefined()
  })
})

describe("encodeCommandStatementQuery", () => {
  test("should encode query without transaction ID", () => {
    const encoded = encodeCommandStatementQuery("SELECT 1")

    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(encoded.length).toBeGreaterThan(0)

    // Decode and verify type URL is present
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandStatementQuery)
  })

  test("should encode query with transaction ID", () => {
    const transactionId = new Uint8Array([1, 2, 3, 4])
    const encoded = encodeCommandStatementQuery("SELECT 1", transactionId)

    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(encoded.length).toBeGreaterThan(0)
  })

  test("should handle empty query", () => {
    const encoded = encodeCommandStatementQuery("")

    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(encoded.length).toBeGreaterThan(0)
  })

  test("should handle unicode in query", () => {
    const encoded = encodeCommandStatementQuery("SELECT '日本語' AS text")

    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(encoded.length).toBeGreaterThan(0)
  })
})

describe("encodeCommandStatementUpdate", () => {
  test("should encode update statement", () => {
    const encoded = encodeCommandStatementUpdate("INSERT INTO t VALUES (1)")

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandStatementUpdate)
  })
})

describe("encodeCommandGetCatalogs", () => {
  test("should encode empty message", () => {
    const encoded = encodeCommandGetCatalogs()

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetCatalogs)
    expect(decoded.value.length).toBe(0) // Empty message body
  })
})

describe("encodeCommandGetDbSchemas", () => {
  test("should encode without filters", () => {
    const encoded = encodeCommandGetDbSchemas()

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetDbSchemas)
  })

  test("should encode with catalog filter", () => {
    const encoded = encodeCommandGetDbSchemas("my_catalog")

    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(encoded.length).toBeGreaterThan(encodeCommandGetDbSchemas().length)
  })

  test("should encode with schema pattern", () => {
    const encoded = encodeCommandGetDbSchemas(undefined, "public%")

    expect(encoded).toBeInstanceOf(Uint8Array)
  })

  test("should encode with both filters", () => {
    const encoded = encodeCommandGetDbSchemas("catalog", "schema%")

    expect(encoded).toBeInstanceOf(Uint8Array)
  })
})

describe("encodeCommandGetTables", () => {
  test("should encode without options", () => {
    const encoded = encodeCommandGetTables({})

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetTables)
  })

  test("should encode with all options", () => {
    const encoded = encodeCommandGetTables({
      catalog: "my_catalog",
      dbSchemaFilterPattern: "public%",
      tableNameFilterPattern: "user%",
      tableTypes: ["TABLE", "VIEW"],
      includeSchema: true
    })

    expect(encoded).toBeInstanceOf(Uint8Array)
    // Should be larger than empty message
    expect(encoded.length).toBeGreaterThan(encodeCommandGetTables({}).length)
  })

  test("should encode multiple table types", () => {
    const encoded = encodeCommandGetTables({
      tableTypes: ["TABLE", "VIEW", "SYSTEM TABLE"]
    })

    expect(encoded).toBeInstanceOf(Uint8Array)
  })
})

describe("encodeCommandGetTableTypes", () => {
  test("should encode empty message", () => {
    const encoded = encodeCommandGetTableTypes()

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetTableTypes)
  })
})

describe("encodeCommandGetPrimaryKeys", () => {
  test("should encode with table only", () => {
    const encoded = encodeCommandGetPrimaryKeys("users")

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetPrimaryKeys)
  })

  test("should encode with catalog and schema", () => {
    const encoded = encodeCommandGetPrimaryKeys("users", "catalog", "schema")

    expect(encoded).toBeInstanceOf(Uint8Array)
    expect(encoded.length).toBeGreaterThan(encodeCommandGetPrimaryKeys("users").length)
  })
})

describe("encodeCommandGetExportedKeys", () => {
  test("should encode with table only", () => {
    const encoded = encodeCommandGetExportedKeys("users")

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetExportedKeys)
  })
})

describe("encodeCommandGetImportedKeys", () => {
  test("should encode with table only", () => {
    const encoded = encodeCommandGetImportedKeys("orders")

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetImportedKeys)
  })
})

describe("encodeCommandGetSqlInfo", () => {
  test("should encode empty message for all info", () => {
    const encoded = encodeCommandGetSqlInfo()

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetSqlInfo)
    expect(decoded.value.length).toBe(0) // Empty message retrieves all info
  })

  test("should encode with empty array for all info", () => {
    const encoded = encodeCommandGetSqlInfo([])

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetSqlInfo)
    expect(decoded.value.length).toBe(0)
  })

  test("should encode with single info code", () => {
    const encoded = encodeCommandGetSqlInfo([0]) // FLIGHT_SQL_SERVER_NAME

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetSqlInfo)
    expect(decoded.value.length).toBeGreaterThan(0)
  })

  test("should encode with multiple info codes", () => {
    const encoded = encodeCommandGetSqlInfo([0, 1, 2]) // Server name, version, arrow version

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetSqlInfo)
    // Multiple varints should make the message larger than single
    const singleEncoded = encodeCommandGetSqlInfo([0])
    expect(encoded.length).toBeGreaterThan(singleEncoded.length)
  })
})

describe("encodeCommandGetXdbcTypeInfo", () => {
  test("should encode empty message for all types", () => {
    const encoded = encodeCommandGetXdbcTypeInfo()

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetXdbcTypeInfo)
    expect(decoded.value.length).toBe(0) // Empty message retrieves all types
  })

  test("should encode with specific data type", () => {
    const encoded = encodeCommandGetXdbcTypeInfo(12) // VARCHAR

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetXdbcTypeInfo)
    expect(decoded.value.length).toBeGreaterThan(0)
  })

  test("should encode data type as varint", () => {
    const encoded = encodeCommandGetXdbcTypeInfo(4) // INTEGER

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    const fields = parseProtoFields(decoded.value)
    expect(fields.length).toBe(1)
    expect(fields[0].fieldNumber).toBe(1)
    expect(fields[0].wireType).toBe(0) // varint
    expect(fields[0].value).toBe(4)
  })
})

describe("encodeCommandGetCrossReference", () => {
  test("should encode with required pk and fk tables", () => {
    const encoded = encodeCommandGetCrossReference({
      pkTable: "users",
      fkTable: "orders"
    })

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetCrossReference)
    expect(decoded.value.length).toBeGreaterThan(0)
  })

  test("should encode with all options", () => {
    const encoded = encodeCommandGetCrossReference({
      pkTable: "users",
      fkTable: "orders",
      pkCatalog: "main",
      pkDbSchema: "public",
      fkCatalog: "main",
      fkDbSchema: "public"
    })

    expect(encoded).toBeInstanceOf(Uint8Array)
    // Should be larger than minimal message
    const minimalEncoded = encodeCommandGetCrossReference({
      pkTable: "users",
      fkTable: "orders"
    })
    expect(encoded.length).toBeGreaterThan(minimalEncoded.length)
  })

  test("should encode with only pk catalog and schema", () => {
    const encoded = encodeCommandGetCrossReference({
      pkTable: "users",
      fkTable: "orders",
      pkCatalog: "main",
      pkDbSchema: "public"
    })

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetCrossReference)
  })

  test("should encode with only fk catalog and schema", () => {
    const encoded = encodeCommandGetCrossReference({
      pkTable: "users",
      fkTable: "orders",
      fkCatalog: "main",
      fkDbSchema: "public"
    })

    expect(encoded).toBeInstanceOf(Uint8Array)
    const decoded = parseAnyMessage(encoded)
    expect(decoded.typeUrl).toBe(TypeUrls.commandGetCrossReference)
  })
})

describe("parseProtoFields", () => {
  test("should parse empty buffer", () => {
    const fields = parseProtoFields(new Uint8Array())

    expect(fields).toEqual([])
  })

  test("should parse varint field", () => {
    // Field 1, varint, value 42
    const buffer = new Uint8Array([0x08, 0x2a])
    const fields = parseProtoFields(buffer)

    expect(fields.length).toBe(1)
    expect(fields[0].fieldNumber).toBe(1)
    expect(fields[0].wireType).toBe(0) // varint
    expect(fields[0].value).toBe(42)
  })

  test("should parse length-delimited field", () => {
    // Field 1, length-delimited, "hello"
    const buffer = new Uint8Array([0x0a, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f])
    const fields = parseProtoFields(buffer)

    expect(fields.length).toBe(1)
    expect(fields[0].fieldNumber).toBe(1)
    expect(fields[0].wireType).toBe(2) // length-delimited
    expect(fields[0].value).toBeInstanceOf(Uint8Array)
    expect(new TextDecoder().decode(fields[0].value as Uint8Array)).toBe("hello")
  })

  test("should parse multiple fields", () => {
    // Field 1 varint 1, Field 2 length-delimited "ab"
    const buffer = new Uint8Array([0x08, 0x01, 0x12, 0x02, 0x61, 0x62])
    const fields = parseProtoFields(buffer)

    expect(fields.length).toBe(2)
    expect(fields[0].fieldNumber).toBe(1)
    expect(fields[1].fieldNumber).toBe(2)
  })
})

describe("getStringField", () => {
  test("should extract string from fields", () => {
    const fields = [{ fieldNumber: 1, wireType: 2, value: new TextEncoder().encode("hello") }]

    expect(getStringField(fields, 1)).toBe("hello")
  })

  test("should return undefined for missing field", () => {
    const fields = [{ fieldNumber: 1, wireType: 2, value: new TextEncoder().encode("hello") }]

    expect(getStringField(fields, 2)).toBeUndefined()
  })

  test("should return undefined for non-bytes field", () => {
    const fields = [{ fieldNumber: 1, wireType: 0, value: 42 }]

    expect(getStringField(fields, 1)).toBeUndefined()
  })
})

describe("getBytesField", () => {
  test("should extract bytes from fields", () => {
    const bytes = new Uint8Array([1, 2, 3])
    const fields = [{ fieldNumber: 1, wireType: 2, value: bytes }]

    expect(getBytesField(fields, 1)).toBe(bytes)
  })

  test("should return undefined for missing field", () => {
    const fields = [{ fieldNumber: 1, wireType: 2, value: new Uint8Array() }]

    expect(getBytesField(fields, 2)).toBeUndefined()
  })
})

describe("getNumberField", () => {
  test("should extract number from fields", () => {
    const fields = [{ fieldNumber: 1, wireType: 0, value: 42 }]

    expect(getNumberField(fields, 1)).toBe(42)
  })

  test("should return undefined for missing field", () => {
    const fields = [{ fieldNumber: 1, wireType: 0, value: 42 }]

    expect(getNumberField(fields, 2)).toBeUndefined()
  })

  test("should return undefined for non-number field", () => {
    const fields = [{ fieldNumber: 1, wireType: 2, value: new Uint8Array() }]

    expect(getNumberField(fields, 1)).toBeUndefined()
  })
})

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Parse an Any message to extract type URL and value
 */
function parseAnyMessage(buffer: Uint8Array): { typeUrl: string; value: Uint8Array } {
  const fields = parseProtoFields(buffer)

  const typeUrlBytes = getBytesField(fields, 1)
  const value = getBytesField(fields, 2) ?? new Uint8Array()

  const typeUrl = typeUrlBytes ? new TextDecoder().decode(typeUrlBytes) : ""

  return { typeUrl, value }
}

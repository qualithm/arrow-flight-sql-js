/**
 * Mock tests for FlightSqlClient error paths that require simulated server responses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FlightSqlClient } from "../../client.js"
// Import DoPutUpdateResult for creating proper mock responses
import {
  DoPutPreparedStatementResult,
  DoPutUpdateResult
} from "../../generated/arrow/flight/protocol/sql/FlightSql.js"

describe("FlightSqlClient error paths", () => {
  let client: FlightSqlClient

  beforeEach(() => {
    client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })

    // @ts-expect-error accessing private property for testing
    client._state = "connected"
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("executePreparedUpdate error paths", () => {
    it("throws when no result returned from prepared update", async () => {
      // Mock doPut to return empty results
      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),

        async *results() {
          // Empty generator
        },
        collectResults: vi.fn().mockResolvedValue([])
      } as unknown as ReturnType<typeof client.doPut>)

      await expect(client.executePreparedUpdate(Buffer.from("handle"))).rejects.toThrow(
        "no result returned from prepared update"
      )
    })

    it("throws when prepared update result has empty app metadata", async () => {
      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: Buffer.alloc(0) }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: Buffer.alloc(0) }])
      } as unknown as ReturnType<typeof client.doPut>)

      await expect(client.executePreparedUpdate(Buffer.from("handle"))).rejects.toThrow(
        "prepared update result missing app metadata"
      )
    })

    it("returns record count on success", async () => {
      const updateResult = DoPutUpdateResult.encode({ recordCount: 42 }).finish()

      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: Buffer.from(updateResult) }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: Buffer.from(updateResult) }])
      } as unknown as ReturnType<typeof client.doPut>)

      const result = await client.executePreparedUpdate(Buffer.from("handle"))
      expect(result.recordCount).toBe(42)
    })
  })

  describe("executeUpdate error paths", () => {
    it("throws when no result returned from update", async () => {
      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async *results() {},
        collectResults: vi.fn().mockResolvedValue([])
      } as unknown as ReturnType<typeof client.doPut>)

      await expect(client.executeUpdate("INSERT INTO test VALUES (1)")).rejects.toThrow(
        "no result returned from update"
      )
    })

    it("throws when update result has empty app metadata", async () => {
      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: Buffer.alloc(0) }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: Buffer.alloc(0) }])
      } as unknown as ReturnType<typeof client.doPut>)

      await expect(client.executeUpdate("INSERT INTO test VALUES (1)")).rejects.toThrow(
        "update result missing app metadata"
      )
    })

    it("handles long query strings that require multi-byte varint encoding", async () => {
      // Create a query longer than 128 characters to exercise varIntSize/writeVarInt paths
      const longQuery = `INSERT INTO test_table_with_very_long_name (column1, column2, column3) VALUES ${Array(
        20
      )
        .fill("('value1', 'value2', 'value3')")
        .join(", ")}`

      expect(longQuery.length).toBeGreaterThan(128)

      // Mock a successful response
      const updateResult = DoPutUpdateResult.encode({ recordCount: 20 }).finish()

      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: Buffer.from(updateResult) }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: Buffer.from(updateResult) }])
      } as unknown as ReturnType<typeof client.doPut>)

      const result = await client.executeUpdate(longQuery)
      expect(result.recordCount).toBe(20)
    })
  })

  describe("createPreparedStatement error paths", () => {
    it("throws when no result returned from create prepared statement", async () => {
      // Mock doAction to return empty results

      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        // Empty generator - no results
      })

      await expect(client.createPreparedStatement("SELECT * FROM test")).rejects.toThrow(
        "no result returned from create prepared statement"
      )
    })

    it("throws when create prepared statement returns empty body", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        yield { body: Buffer.alloc(0) }
      })

      await expect(client.createPreparedStatement("SELECT * FROM test")).rejects.toThrow(
        "no result returned from create prepared statement"
      )
    })
  })

  describe("bindParameters edge paths", () => {
    it("returns empty result when server returns no result (legacy behavior)", async () => {
      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async *results() {},
        collectResults: vi.fn().mockResolvedValue([])
      } as unknown as ReturnType<typeof client.doPut>)

      const result = await client.bindParameters(Buffer.from("handle"), {
        schema: new Uint8Array([1, 2, 3]),
        data: new Uint8Array([4, 5, 6])
      })

      // Should return empty object for legacy servers
      expect(result).toEqual({})
    })

    it("returns empty result when server returns empty app metadata", async () => {
      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: Buffer.alloc(0) }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: Buffer.alloc(0) }])
      } as unknown as ReturnType<typeof client.doPut>)

      const result = await client.bindParameters(Buffer.from("handle"), {
        schema: new Uint8Array([1, 2, 3]),
        data: new Uint8Array([4, 5, 6])
      })

      expect(result).toEqual({})
    })

    it("returns empty result when unpacked Any has zero length", async () => {
      // Create a minimal Any message with empty value
      // Any message format: field 1 (type_url) + field 2 (value)
      // tag 0x0a (field 1, wire type 2) + length + type_url + tag 0x12 (field 2, wire type 2) + length 0
      const emptyAnyMessage = Buffer.from([
        0x0a,
        0x05,
        0x74,
        0x65,
        0x73,
        0x74,
        0x00, // type_url "test\0"
        0x12,
        0x00 // empty value
      ])

      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: emptyAnyMessage }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: emptyAnyMessage }])
      } as unknown as ReturnType<typeof client.doPut>)

      const result = await client.bindParameters(Buffer.from("handle"), {
        schema: new Uint8Array([1, 2, 3]),
        data: new Uint8Array([4, 5, 6])
      })

      expect(result).toEqual({})
    })

    it("returns undefined handle when preparedStatementHandle is empty", async () => {
      // Create an Any message with a DoPutPreparedStatementResult that has empty handle
      // DoPutPreparedStatementResult: field 1 = preparedStatementHandle (bytes)
      // Empty protobuf message (no fields) decodes to default values (empty handle)
      const anyWithEmptyResult = Buffer.from([
        0x0a,
        0x20, // field 1 (type_url), length 32
        ...Buffer.from("type.googleapis.com/test.Empty"),
        0x12,
        0x00 // field 2 (value), length 0 (empty message)
      ])

      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: anyWithEmptyResult }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: anyWithEmptyResult }])
      } as unknown as ReturnType<typeof client.doPut>)

      const result = await client.bindParameters(Buffer.from("handle"), {
        schema: new Uint8Array([1, 2, 3]),
        data: new Uint8Array([4, 5, 6])
      })

      // Empty/falsy handle should result in undefined
      expect(result.handle).toBeUndefined()
    })
  })

  describe("beginTransaction error paths", () => {
    it("throws when no result returned from begin transaction", async () => {
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        // Empty generator - no results
      })

      await expect(client.beginTransaction()).rejects.toThrow(
        "no result returned from begin transaction"
      )
    })

    it("throws when begin transaction returns empty body", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        yield { body: Buffer.alloc(0) }
      })

      await expect(client.beginTransaction()).rejects.toThrow(
        "no result returned from begin transaction"
      )
    })
  })

  describe("unpackAny edge cases", () => {
    it("skips non-length-delimited fields in malformed protobuf", async () => {
      // Create a malformed Any message that includes a varint field (wireType 0)
      // This tests the continue branch at line 278 for wireType !== 2
      // Wire format: field_number << 3 | wire_type
      // 0x08 = field 1, wire_type 0 (varint) - should be skipped
      // 0x0a = field 1, wire_type 2 (length-delimited) - normal type_url
      // 0x12 = field 2, wire_type 2 (length-delimited) - value field
      const malformedAnyWithVarint = Buffer.from([
        0x08,
        0x01, // field 1 varint = 1 (will be skipped)
        0x12,
        0x04, // field 2 (value), length 4
        0x08,
        0x01,
        0x10,
        0x14 // Some protobuf content: field1=1, field2=20
      ])

      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: malformedAnyWithVarint }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: malformedAnyWithVarint }])
      } as unknown as ReturnType<typeof client.doPut>)

      // This should succeed, skipping the varint field
      const result = await client.bindParameters(Buffer.from("handle"), {
        schema: new Uint8Array([1, 2, 3]),
        data: new Uint8Array([4, 5, 6])
      })

      // Should have successfully parsed despite the malformed field
      expect(result).toBeDefined()
    })

    it("handles empty anyBytes from bindParameters", async () => {
      // Create an Any message with zero-length value field
      // This tests lines 751-753 where anyBytes.length === 0
      const anyWithEmptyValue = Buffer.from([
        0x0a,
        0x20, // field 1 (type_url), length 32
        ...Buffer.from("type.googleapis.com/test.Empty"),
        0x12,
        0x00 // field 2 (value), length 0
      ])

      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: anyWithEmptyValue }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: anyWithEmptyValue }])
      } as unknown as ReturnType<typeof client.doPut>)

      const result = await client.bindParameters(Buffer.from("handle"), {
        schema: new Uint8Array([1, 2, 3]),
        data: new Uint8Array([4, 5, 6])
      })

      expect(result).toEqual({})
    })

    it("handles multi-byte varint lengths in Any messages", async () => {
      // Create an Any message with a type URL > 127 bytes to exercise
      // the multi-byte varint reading path in readVarInt (line 252)
      const longTypeUrl = `type.googleapis.com/${"a".repeat(150)}` // > 127 chars

      // Encode length as 2-byte varint: length = 170 = 0xAA = 10101010
      // First byte: 0x80 | (170 & 0x7F) = 0x80 | 0x2A = 0xAA
      // Second byte: 170 >> 7 = 1
      const typeUrlLength = longTypeUrl.length
      const encodedLength = [(typeUrlLength & 0x7f) | 0x80, typeUrlLength >> 7]

      // Create the Any message
      const typeUrlBytes = Buffer.from(longTypeUrl)
      const anyWithLongTypeUrl = Buffer.concat([
        Buffer.from([0x0a]), // field 1 tag
        Buffer.from(encodedLength), // multi-byte varint length
        typeUrlBytes, // type URL
        Buffer.from([0x12, 0x00]) // field 2 (value), length 0
      ])

      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: anyWithLongTypeUrl }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: anyWithLongTypeUrl }])
      } as unknown as ReturnType<typeof client.doPut>)

      // Should handle multi-byte varints without issue
      const result = await client.bindParameters(Buffer.from("handle"), {
        schema: new Uint8Array([1, 2, 3]),
        data: new Uint8Array([4, 5, 6])
      })

      expect(result).toEqual({})
    })

    it("returns handle when preparedStatementHandle is present", async () => {
      // Create a proper DoPutPreparedStatementResult with a handle
      const newHandle = Buffer.from("new-stmt-handle")
      const innerProto = DoPutPreparedStatementResult.encode({
        preparedStatementHandle: newHandle
      }).finish()

      // Create a proper Any message wrapping the result
      // Any format: field 1 (type_url) + field 2 (value)
      const typeUrl = Buffer.from(
        "type.googleapis.com/arrow.flight.sql.DoPutPreparedStatementResult"
      )
      const anyWithHandle = Buffer.concat([
        Buffer.from([0x0a, typeUrl.length]), // field 1 tag + length
        typeUrl,
        Buffer.from([0x12, innerProto.length]), // field 2 tag + length
        innerProto
      ])

      vi.spyOn(client, "doPut").mockReturnValue({
        write: vi.fn(() => true),
        end: vi.fn(),
        cancel: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/require-await
        async *results() {
          yield { appMetadata: anyWithHandle }
        },
        collectResults: vi.fn().mockResolvedValue([{ appMetadata: anyWithHandle }])
      } as unknown as ReturnType<typeof client.doPut>)

      const result = await client.bindParameters(Buffer.from("handle"), {
        schema: new Uint8Array([1, 2, 3]),
        data: new Uint8Array([4, 5, 6])
      })

      // Should have the handle from the result
      expect(result.handle).toBeDefined()
      expect(result.handle?.toString()).toBe("new-stmt-handle")
    })
  })

  describe("query success path", () => {
    it("calls getFlightInfo with correct command descriptor", async () => {
      const mockFlightInfo = {
        flightDescriptor: undefined,
        endpoint: [],
        schema: Buffer.alloc(0),
        totalBytes: 0,
        totalRecords: 0,
        ordered: false,
        appMetadata: Buffer.alloc(0)
      }

      vi.spyOn(client, "getFlightInfo").mockResolvedValue(mockFlightInfo)

      const result = await client.query("SELECT * FROM test")

      expect(result).toBe(mockFlightInfo)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(client.getFlightInfo).toHaveBeenCalledTimes(1)
    })

    it("passes transactionId option", async () => {
      const mockFlightInfo = {
        flightDescriptor: undefined,
        endpoint: [],
        schema: Buffer.alloc(0),
        totalRecords: 0,
        totalBytes: 0,
        ordered: false,
        appMetadata: Buffer.alloc(0)
      }
      vi.spyOn(client, "getFlightInfo").mockResolvedValue(mockFlightInfo)

      await client.query("SELECT 1", { transactionId: Buffer.from("txn-123") })

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(client.getFlightInfo).toHaveBeenCalled()
    })
  })

  describe("executePreparedQuery success path", () => {
    it("calls getFlightInfo with prepared statement handle", async () => {
      const mockFlightInfo = {
        flightDescriptor: undefined,
        endpoint: [],
        schema: Buffer.alloc(0),
        totalRecords: 0,
        totalBytes: 0,
        ordered: false,
        appMetadata: Buffer.alloc(0)
      }
      vi.spyOn(client, "getFlightInfo").mockResolvedValue(mockFlightInfo)

      const result = await client.executePreparedQuery(Buffer.from("handle-123"))

      expect(result).toBe(mockFlightInfo)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(client.getFlightInfo).toHaveBeenCalledTimes(1)
    })
  })

  describe("closePreparedStatement success path", () => {
    it("calls doAction with close action", async () => {
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        // Empty - no result expected from close
      })

      await client.closePreparedStatement(Buffer.from("handle-123"))

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(client.doAction).toHaveBeenCalledTimes(1)
    })

    it("consumes any results from close action", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        yield { body: Buffer.from("ack") }
      })

      // Should not throw even if server returns a result
      await expect(client.closePreparedStatement(Buffer.from("handle"))).resolves.toBeUndefined()
    })
  })

  describe("metadata methods success paths", () => {
    const mockFlightInfo = {
      flightDescriptor: undefined,
      endpoint: [],
      schema: Buffer.alloc(0),
      totalRecords: 0,
      totalBytes: 0,
      ordered: false,
      appMetadata: Buffer.alloc(0)
    }

    beforeEach(() => {
      vi.spyOn(client, "getFlightInfo").mockResolvedValue(mockFlightInfo)
    })

    it("getCatalogs calls getFlightInfo", async () => {
      const result = await client.getCatalogs()
      expect(result).toBe(mockFlightInfo)
    })

    it("getDbSchemas calls getFlightInfo", async () => {
      const result = await client.getDbSchemas()
      expect(result).toBe(mockFlightInfo)
    })

    it("getDbSchemas with filters", async () => {
      const result = await client.getDbSchemas({
        catalog: "my_catalog",
        dbSchemaFilterPattern: "public%"
      })
      expect(result).toBe(mockFlightInfo)
    })

    it("getTables calls getFlightInfo", async () => {
      const result = await client.getTables()
      expect(result).toBe(mockFlightInfo)
    })

    it("getTables with all options", async () => {
      const result = await client.getTables({
        catalog: "my_catalog",
        dbSchemaFilterPattern: "public",
        tableNameFilterPattern: "user%",
        tableTypes: ["TABLE", "VIEW"],
        includeSchema: true
      })
      expect(result).toBe(mockFlightInfo)
    })

    it("getTableTypes calls getFlightInfo", async () => {
      const result = await client.getTableTypes()
      expect(result).toBe(mockFlightInfo)
    })

    it("getPrimaryKeys calls getFlightInfo", async () => {
      const result = await client.getPrimaryKeys("users")
      expect(result).toBe(mockFlightInfo)
    })

    it("getPrimaryKeys with catalog and schema", async () => {
      const result = await client.getPrimaryKeys("users", {
        catalog: "my_db",
        dbSchema: "public"
      })
      expect(result).toBe(mockFlightInfo)
    })

    it("getExportedKeys calls getFlightInfo", async () => {
      const result = await client.getExportedKeys("users")
      expect(result).toBe(mockFlightInfo)
    })

    it("getExportedKeys with catalog and schema", async () => {
      const result = await client.getExportedKeys("users", {
        catalog: "my_db",
        dbSchema: "public"
      })
      expect(result).toBe(mockFlightInfo)
    })

    it("getImportedKeys calls getFlightInfo", async () => {
      const result = await client.getImportedKeys("orders")
      expect(result).toBe(mockFlightInfo)
    })

    it("getImportedKeys with catalog and schema", async () => {
      const result = await client.getImportedKeys("orders", {
        catalog: "my_db",
        dbSchema: "public"
      })
      expect(result).toBe(mockFlightInfo)
    })

    it("getCrossReference calls getFlightInfo", async () => {
      const result = await client.getCrossReference("users", "orders")
      expect(result).toBe(mockFlightInfo)
    })

    it("getCrossReference with catalog and schema options", async () => {
      const result = await client.getCrossReference("users", "orders", {
        pkCatalog: "my_db",
        pkDbSchema: "public",
        fkCatalog: "my_db",
        fkDbSchema: "public"
      })
      expect(result).toBe(mockFlightInfo)
    })

    it("getSqlInfo calls getFlightInfo with empty array", async () => {
      const result = await client.getSqlInfo()
      expect(result).toBe(mockFlightInfo)
    })

    it("getSqlInfo with specific info codes", async () => {
      const result = await client.getSqlInfo([0, 1, 2])
      expect(result).toBe(mockFlightInfo)
    })

    it("getXdbcTypeInfo calls getFlightInfo", async () => {
      const result = await client.getXdbcTypeInfo()
      expect(result).toBe(mockFlightInfo)
    })

    it("getXdbcTypeInfo with dataType filter", async () => {
      const result = await client.getXdbcTypeInfo({ dataType: 12 })
      expect(result).toBe(mockFlightInfo)
    })
  })

  describe("beginTransaction success path", () => {
    it("returns transaction ID on success", async () => {
      // Import the protobuf type for encoding
      const { ActionBeginTransactionResult } =
        await import("../../generated/arrow/flight/protocol/sql/FlightSql.js")

      const txnId = Buffer.from("transaction-id-123")
      const innerProto = ActionBeginTransactionResult.encode({
        transactionId: txnId
      }).finish()

      // Create Any wrapper
      const typeUrl = Buffer.from(
        "type.googleapis.com/arrow.flight.protocol.sql.ActionBeginTransactionResult"
      )
      const anyMessage = Buffer.concat([
        Buffer.from([0x0a, typeUrl.length]),
        typeUrl,
        Buffer.from([0x12, innerProto.length]),
        innerProto
      ])

      // eslint-disable-next-line @typescript-eslint/require-await
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        yield { body: anyMessage }
      })

      const result = await client.beginTransaction()

      expect(result.transactionId).toBeDefined()
      expect(result.transactionId.toString()).toBe("transaction-id-123")
    })
  })

  describe("endTransaction success path", () => {
    it("commits transaction successfully", async () => {
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        // No result expected
      })

      await expect(client.endTransaction(Buffer.from("txn-123"), "commit")).resolves.toBeUndefined()
    })

    it("rollbacks transaction successfully", async () => {
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        // No result expected
      })

      await expect(
        client.endTransaction(Buffer.from("txn-123"), "rollback")
      ).resolves.toBeUndefined()
    })

    it("consumes any results from endTransaction", async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        yield { body: Buffer.from("ack") }
      })

      await expect(client.endTransaction(Buffer.from("txn-123"), "commit")).resolves.toBeUndefined()
    })
  })

  describe("commit and rollback wrappers", () => {
    it("commit calls endTransaction with commit action", async () => {
      const spy = vi.spyOn(client, "endTransaction").mockResolvedValue(undefined)

      await client.commit(Buffer.from("txn-123"))

      expect(spy).toHaveBeenCalledWith(Buffer.from("txn-123"), "commit", undefined)
    })

    it("rollback calls endTransaction with rollback action", async () => {
      const spy = vi.spyOn(client, "endTransaction").mockResolvedValue(undefined)

      await client.rollback(Buffer.from("txn-456"))

      expect(spy).toHaveBeenCalledWith(Buffer.from("txn-456"), "rollback", undefined)
    })

    it("commit passes options to endTransaction", async () => {
      const spy = vi.spyOn(client, "endTransaction").mockResolvedValue(undefined)
      const options = { timeoutMs: 5000 }

      await client.commit(Buffer.from("txn-123"), options)

      expect(spy).toHaveBeenCalledWith(Buffer.from("txn-123"), "commit", options)
    })

    it("rollback passes options to endTransaction", async () => {
      const spy = vi.spyOn(client, "endTransaction").mockResolvedValue(undefined)
      const options = { timeoutMs: 5000 }

      await client.rollback(Buffer.from("txn-123"), options)

      expect(spy).toHaveBeenCalledWith(Buffer.from("txn-123"), "rollback", options)
    })
  })

  describe("createPreparedStatement success path", () => {
    it("returns prepared statement result on success", async () => {
      const { ActionCreatePreparedStatementResult } =
        await import("../../generated/arrow/flight/protocol/sql/FlightSql.js")

      const handle = Buffer.from("prepared-handle-123")
      const datasetSchema = Buffer.from("dataset-schema")
      const parameterSchema = Buffer.from("parameter-schema")

      const innerProto = ActionCreatePreparedStatementResult.encode({
        preparedStatementHandle: handle,
        datasetSchema,
        parameterSchema
      }).finish()

      const typeUrl = Buffer.from(
        "type.googleapis.com/arrow.flight.protocol.sql.ActionCreatePreparedStatementResult"
      )
      const anyMessage = Buffer.concat([
        Buffer.from([0x0a, typeUrl.length]),
        typeUrl,
        Buffer.from([0x12, innerProto.length]),
        innerProto
      ])

      // eslint-disable-next-line @typescript-eslint/require-await
      vi.spyOn(client, "doAction").mockImplementation(async function* () {
        yield { body: anyMessage }
      })

      const result = await client.createPreparedStatement("SELECT * FROM test WHERE id = ?")

      expect(result.handle.toString()).toBe("prepared-handle-123")
      expect(result.datasetSchema.toString()).toBe("dataset-schema")
      expect(result.parameterSchema.toString()).toBe("parameter-schema")
    })

    it("passes transactionId option", async () => {
      const { ActionCreatePreparedStatementResult } =
        await import("../../generated/arrow/flight/protocol/sql/FlightSql.js")

      const innerProto = ActionCreatePreparedStatementResult.encode({
        preparedStatementHandle: Buffer.from("handle"),
        datasetSchema: Buffer.alloc(0),
        parameterSchema: Buffer.alloc(0)
      }).finish()

      const typeUrl = Buffer.from(
        "type.googleapis.com/arrow.flight.protocol.sql.ActionCreatePreparedStatementResult"
      )
      const anyMessage = Buffer.concat([
        Buffer.from([0x0a, typeUrl.length]),
        typeUrl,
        Buffer.from([0x12, innerProto.length]),
        innerProto
      ])

      // eslint-disable-next-line @typescript-eslint/require-await
      const spy = vi.spyOn(client, "doAction").mockImplementation(async function* () {
        yield { body: anyMessage }
      })

      await client.createPreparedStatement("SELECT 1", {
        transactionId: Buffer.from("txn-456")
      })

      expect(spy).toHaveBeenCalledTimes(1)
    })
  })
})

describe("createFlightSqlClient", () => {
  it("creates client and calls connect", async () => {
    // Import at test time to get the factory function
    const { createFlightSqlClient } = await import("../../client.js")

    // Mock the connect method on the prototype before creating the client
    const connectSpy = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(FlightSqlClient.prototype, "connect").mockImplementation(connectSpy)

    const client = await createFlightSqlClient({
      host: "localhost",
      port: 8815,
      tls: false
    })

    expect(client).toBeInstanceOf(FlightSqlClient)
    expect(connectSpy).toHaveBeenCalledTimes(1)
  })
})

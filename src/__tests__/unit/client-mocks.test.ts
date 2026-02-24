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
})

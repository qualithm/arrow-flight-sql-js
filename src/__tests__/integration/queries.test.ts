/**
 * Integration tests for Flight SQL query execution.
 *
 * Requires a running Arrow Flight SQL server with test fixtures.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test"

import { createFlightSqlClient, type FlightSqlClient, queryToTable } from "../../index"
import { config } from "./config"

describe("Query Integration", () => {
  let client: FlightSqlClient

  beforeAll(async () => {
    client = await createFlightSqlClient({
      host: config.host,
      port: config.port,
      tls: config.tls,
      auth: {
        type: "basic",
        username: config.credentials.admin.username,
        password: config.credentials.admin.password
      }
    })
    await client.handshake()
  })

  afterAll(() => {
    client.close()
  })

  describe("query", () => {
    it("executes SELECT * query on test.integers", async () => {
      const info = await client.query("SELECT * FROM test.integers")

      expect(info).toBeDefined()
      expect(info.schema).toBeDefined()
      expect(info.endpoint.length).toBeGreaterThan(0)
    })

    it("returns correct record count", async () => {
      const info = await client.query("SELECT * FROM test.integers")

      // test.integers has 100 records, but server may return -1 (unknown)
      expect(info.totalRecords === 100 || info.totalRecords === -1).toBe(true)
    })

    it("handles empty result set", async () => {
      const info = await client.query("SELECT * FROM test.empty")

      // Server may return 0 or -1 (unknown) for empty result
      expect(info.totalRecords === 0 || info.totalRecords === -1).toBe(true)
    })

    it("returns error for invalid SQL", async () => {
      try {
        await client.query("INVALID SQL SYNTAX")
        expect.unreachable("Expected error for invalid SQL")
      } catch (error) {
        // Server may return INVALID_ARGUMENT or INTERNAL for malformed SQL
        expect(["INVALID_ARGUMENT", "INTERNAL"]).toContain((error as { code: string }).code)
      }
    })

    it("returns error for non-existent table", async () => {
      try {
        await client.query("SELECT * FROM nonexistent_table")
        expect.unreachable("Expected error for non-existent table")
      } catch (error) {
        // Server may return NOT_FOUND or INTERNAL for missing table
        expect(["NOT_FOUND", "INTERNAL"]).toContain((error as { code: string }).code)
      }
    })
  })

  describe("queryToTable", () => {
    it("returns Arrow Table with correct row count", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.integers")

      expect(table.numRows).toBe(100)
    })

    it("has correct schema fields for integers table", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.integers")

      const fieldNames = table.schema.fields.map((f) => f.name)
      expect(fieldNames).toContain("id")
      expect(fieldNames).toContain("value")
    })

    it("has correct schema fields for strings table", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.strings")

      const fieldNames = table.schema.fields.map((f) => f.name)
      expect(fieldNames).toContain("id")
      expect(fieldNames).toContain("name")
    })

    it("can iterate rows", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.integers LIMIT 5")

      const rows: unknown[] = []
      for (const row of table) {
        rows.push(row)
      }

      expect(rows.length).toBe(5)
    })

    it("handles large datasets", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.large")

      expect(table.numRows).toBe(10000)
    })

    it("handles nested types", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.nested")

      expect(table.numRows).toBe(50)
      const fieldNames = table.schema.fields.map((f) => f.name)
      expect(fieldNames).toContain("items")
    })
  })
})

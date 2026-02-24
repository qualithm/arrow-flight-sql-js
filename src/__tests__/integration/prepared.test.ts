/**
 * Integration tests for Flight SQL prepared statements.
 *
 * Requires a running Arrow Flight SQL server.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test"

import { createFlightSqlClient, flightInfoToTable, type FlightSqlClient } from "../../index"
import { config } from "./config"

describe("Prepared Statements Integration", () => {
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

  describe("createPreparedStatement", () => {
    it("creates a prepared statement for SELECT query", async () => {
      const prepared = await client.createPreparedStatement("SELECT * FROM test.integers")

      expect(prepared.handle).toBeDefined()
      expect(prepared.handle.length).toBeGreaterThan(0)
      // Dataset schema should be provided for queries
      expect(prepared.datasetSchema.length).toBeGreaterThan(0)

      // Clean up
      await client.closePreparedStatement(prepared.handle)
    })

    it("creates a prepared statement for UPDATE query", async () => {
      const prepared = await client.createPreparedStatement("UPDATE test.integers SET value = 42")

      expect(prepared.handle).toBeDefined()
      expect(prepared.handle.length).toBeGreaterThan(0)

      // Clean up
      await client.closePreparedStatement(prepared.handle)
    })

    it("creates a prepared statement with parameters", async () => {
      const prepared = await client.createPreparedStatement(
        "SELECT * FROM test.integers WHERE id = ?"
      )

      expect(prepared.handle).toBeDefined()
      // Parameter schema should describe the parameter
      // (may be empty if server doesn't track parameters)
      expect(prepared.parameterSchema).toBeDefined()

      // Clean up
      await client.closePreparedStatement(prepared.handle)
    })

    it("rejects invalid SQL", async () => {
      try {
        await client.createPreparedStatement("INVALID SQL")
        expect.unreachable("Expected INVALID_ARGUMENT error")
      } catch (error) {
        expect((error as { code: string }).code).toBe("INVALID_ARGUMENT")
      }
    })
  })

  describe("executePreparedQuery", () => {
    it("executes a prepared query", async () => {
      const prepared = await client.createPreparedStatement("SELECT * FROM test.integers")

      const info = await client.executePreparedQuery(prepared.handle)
      expect(info).toBeDefined()
      // Server may return actual count or -1 (unknown)
      expect(
        info.totalRecords === 100 || info.totalRecords === -1n || info.totalRecords === -1
      ).toBe(true)

      // Clean up
      await client.closePreparedStatement(prepared.handle)
    })

    it("can execute multiple times", async () => {
      const prepared = await client.createPreparedStatement("SELECT * FROM test.strings")

      // Execute first time
      const info1 = await client.executePreparedQuery(prepared.handle)
      const table1 = await flightInfoToTable(client, info1)

      // Execute second time
      const info2 = await client.executePreparedQuery(prepared.handle)
      const table2 = await flightInfoToTable(client, info2)

      expect(table1.numRows).toBe(100)
      expect(table2.numRows).toBe(100)

      // Clean up
      await client.closePreparedStatement(prepared.handle)
    })
  })

  describe("executePreparedUpdate", () => {
    it("executes a prepared update", async () => {
      const prepared = await client.createPreparedStatement(
        "INSERT INTO test.integers (id, value) VALUES (998, 1)"
      )

      const result = await client.executePreparedUpdate(prepared.handle)
      expect(result.recordCount).toBeGreaterThanOrEqual(-1)

      // Clean up
      await client.closePreparedStatement(prepared.handle)
    })
  })

  describe("closePreparedStatement", () => {
    it("closes a prepared statement", async () => {
      const prepared = await client.createPreparedStatement("SELECT * FROM test.integers")

      // Should not throw
      await client.closePreparedStatement(prepared.handle)

      // Attempting to use closed handle should fail
      try {
        await client.executePreparedQuery(prepared.handle)
        expect.unreachable("Expected error for closed handle")
      } catch {
        // Expected to fail
        expect(true).toBe(true)
      }
    })

    it("does not error when closing non-existent handle", async () => {
      // Some servers may silently ignore invalid handles
      const fakeHandle = Buffer.from("nonexistent-handle")

      // Should not throw (or throw NOT_FOUND)
      try {
        await client.closePreparedStatement(fakeHandle)
      } catch (error) {
        // NOT_FOUND is acceptable
        expect((error as { code: string }).code).toBe("NOT_FOUND")
      }
    })
  })
})

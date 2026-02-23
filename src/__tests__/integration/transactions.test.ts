/**
 * Integration tests for Flight SQL transactions.
 *
 * Requires a running Arrow Flight SQL server with transaction support.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test"

import { createFlightSqlClient, type FlightSqlClient, queryToTable } from "../../index"
import { config } from "./config"

describe("Transactions Integration", () => {
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

  describe("beginTransaction", () => {
    let transactionId: Buffer | null = null

    afterEach(async () => {
      // Clean up any open transaction
      if (transactionId !== null) {
        try {
          await client.endTransaction(transactionId, "rollback")
        } catch {
          // Ignore errors during cleanup
        }
        transactionId = null
      }
    })

    it("begins a transaction", async () => {
      const result = await client.beginTransaction()

      expect(result.transactionId).toBeDefined()
      expect(result.transactionId.length).toBeGreaterThan(0)
      ;({ transactionId } = result)
    })

    it("begins multiple transactions", async () => {
      const result1 = await client.beginTransaction()
      const result2 = await client.beginTransaction()

      expect(result1.transactionId).toBeDefined()
      expect(result2.transactionId).toBeDefined()
      // Transaction IDs should be unique
      expect(result1.transactionId.toString()).not.toBe(result2.transactionId.toString())

      // Clean up both
      await client.endTransaction(result1.transactionId, "rollback")
      await client.endTransaction(result2.transactionId, "rollback")
    })
  })

  describe("endTransaction", () => {
    it("commits a transaction", async () => {
      const { transactionId } = await client.beginTransaction()

      // Commit should succeed (even without executing anything)
      await client.endTransaction(transactionId, "commit")
    })

    it("rolls back a transaction", async () => {
      const { transactionId } = await client.beginTransaction()

      // Rollback should succeed (even without executing anything)
      await client.endTransaction(transactionId, "rollback")
    })

    it("commits a transaction with pending updates", async () => {
      const { transactionId } = await client.beginTransaction()

      // Execute updates within the transaction
      const result1 = await client.executeUpdate(
        "INSERT INTO test.integers (id, value) VALUES (999, 1)",
        { transactionId }
      )
      expect(result1.recordCount).toBeGreaterThanOrEqual(0)

      const result2 = await client.executeUpdate("UPDATE test.integers SET value = 42", {
        transactionId
      })
      expect(result2.recordCount).toBeGreaterThanOrEqual(0)

      // Commit should succeed
      await client.endTransaction(transactionId, "commit")
    })

    it("rolls back a transaction with pending updates", async () => {
      const { transactionId } = await client.beginTransaction()

      // Execute updates within the transaction
      const result = await client.executeUpdate("DELETE FROM test.integers WHERE id = 1", {
        transactionId
      })
      expect(result.recordCount).toBeGreaterThanOrEqual(0)

      // Rollback should succeed and discard the pending delete
      await client.endTransaction(transactionId, "rollback")
    })
  })

  describe("query within transaction", () => {
    it("executes query within transaction", async () => {
      const { transactionId } = await client.beginTransaction()

      try {
        // Query within transaction
        const table = await queryToTable(client, "SELECT * FROM test.integers", { transactionId })
        expect(table.numRows).toBe(100)
      } finally {
        await client.endTransaction(transactionId, "rollback")
      }
    })
  })
})

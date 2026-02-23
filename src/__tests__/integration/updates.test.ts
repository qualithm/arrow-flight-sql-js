/**
 * Integration tests for Flight SQL update operations.
 *
 * Requires a running Arrow Flight SQL server.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test"

import { createFlightSqlClient, type FlightSqlClient } from "../../index"
import { config } from "./config"

describe("Update Integration", () => {
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

  describe("executeUpdate", () => {
    it("executes INSERT statement", async () => {
      const result = await client.executeUpdate(
        "INSERT INTO test_updates (id, value) VALUES (1, 'test')"
      )

      // recordCount should be -1 (unknown) or >= 0
      expect(result.recordCount).toBeGreaterThanOrEqual(-1)
    })

    it("executes UPDATE statement", async () => {
      const result = await client.executeUpdate("UPDATE test_updates SET value = 'updated'")

      expect(result.recordCount).toBeGreaterThanOrEqual(-1)
    })

    it("executes DELETE statement", async () => {
      const result = await client.executeUpdate("DELETE FROM test_updates WHERE id = 1")

      expect(result.recordCount).toBeGreaterThanOrEqual(-1)
    })

    it("returns error for invalid SQL", async () => {
      try {
        await client.executeUpdate("INVALID UPDATE")
        expect.unreachable("Expected INVALID_ARGUMENT error")
      } catch (error) {
        expect((error as { code: string }).code).toBe("INVALID_ARGUMENT")
      }
    })
  })

  describe("read-only user cannot update", () => {
    let readerClient: FlightSqlClient

    beforeAll(async () => {
      readerClient = await createFlightSqlClient({
        host: config.host,
        port: config.port,
        tls: config.tls,
        auth: {
          type: "basic",
          username: config.credentials.reader.username,
          password: config.credentials.reader.password
        }
      })
      await readerClient.handshake()
    })

    afterAll(() => {
      readerClient.close()
    })

    it("rejects INSERT with PERMISSION_DENIED", async () => {
      try {
        await readerClient.executeUpdate(
          "INSERT INTO test_updates (id, value) VALUES (999, 'denied')"
        )
        expect.unreachable("Expected PERMISSION_DENIED error")
      } catch (error) {
        expect((error as { code: string }).code).toBe("PERMISSION_DENIED")
      }
    })
  })
})

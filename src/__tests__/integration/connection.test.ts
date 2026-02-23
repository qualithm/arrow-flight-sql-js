/**
 * Integration tests for Flight SQL client connection and handshake.
 *
 * Requires a running Arrow Flight SQL server.
 *
 * @example
 * ```bash
 * # Start your Arrow Flight SQL server, then run:
 * bun test src/__tests__/integration
 * ```
 */
import { afterEach, describe, expect, it } from "bun:test"

import { createFlightSqlClient, FlightSqlClient } from "../../client"
import { config } from "./config"

describe("FlightSqlClient Integration", () => {
  let client: FlightSqlClient | null = null

  afterEach(() => {
    if (client !== null) {
      client.close()
      client = null
    }
  })

  describe("connect", () => {
    it("connects to the Arrow Flight SQL server", async () => {
      client = new FlightSqlClient({
        host: config.host,
        port: config.port,
        tls: config.tls
      })

      expect(client.isConnected).toBe(false)
      expect(client.state).toBe("disconnected")

      await client.connect()

      expect(client.isConnected).toBe(true)
      expect(client.state).toBe("connected")
    })

    it("connects using createFlightSqlClient helper", async () => {
      client = await createFlightSqlClient({
        host: config.host,
        port: config.port,
        tls: config.tls
      })

      expect(client.isConnected).toBe(true)
    })
  })

  describe("handshake", () => {
    it("performs basic auth handshake with valid credentials", async () => {
      client = new FlightSqlClient({
        host: config.host,
        port: config.port,
        tls: config.tls,
        auth: {
          type: "basic",
          username: config.credentials.admin.username,
          password: config.credentials.admin.password
        }
      })

      await client.connect()
      const result = await client.handshake()

      expect(result.protocolVersion).toBeGreaterThanOrEqual(0)
      expect(result.token).toBeDefined()
      expect(result.token?.length).toBeGreaterThan(0)
    })

    it("rejects invalid credentials", async () => {
      client = new FlightSqlClient({
        host: config.host,
        port: config.port,
        tls: config.tls,
        auth: {
          type: "basic",
          username: config.credentials.invalid.username,
          password: config.credentials.invalid.password
        }
      })

      await client.connect()

      try {
        await client.handshake()
        expect.unreachable("Expected handshake to fail")
      } catch (error) {
        expect((error as { code: string }).code).toBe("UNAUTHENTICATED")
      }
    })
  })
})

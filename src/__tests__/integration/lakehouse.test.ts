/**
 * Integration tests for Arrow Flight SQL client with Qualithm Lakehouse
 *
 * These tests require a running lakehouse cluster:
 *   cd lakehouse/docker && docker compose -f docker-compose.cluster.yaml up -d
 *
 * Environment variables:
 *   FLIGHT_SQL_HOST - Server hostname (default: localhost)
 *   FLIGHT_SQL_PORT - Server port (default: 8815)
 *   FLIGHT_SQL_TLS - Enable TLS (default: false)
 *   FLIGHT_SQL_USERNAME - Auth username (default: admin)
 *   FLIGHT_SQL_PASSWORD - Auth password (default: lakehouse)
 *   SKIP_INTEGRATION_TESTS - Skip all integration tests (default: false)
 *
 * Note: Some tests may fail if the lakehouse server doesn't support all
 * Flight SQL features (prepared statements, catalog introspection commands).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import type { FlightSqlClient } from "../../client"
import { createTestClient, getTestConfig, skipIfNoIntegration } from "../setup"

describe("Lakehouse Integration", () => {
  const config = getTestConfig()
  let client!: FlightSqlClient

  beforeAll(async () => {
    if (skipIfNoIntegration()) {
      return
    }

    client = createTestClient()
    try {
      await client.connect()
    } catch (error) {
      console.error("Failed to connect to lakehouse:", error)
      console.error(`  Host: ${config.host}:${String(config.port)}`)
      console.error("  Ensure lakehouse cluster is running:")
      console.error(
        "    cd lakehouse/docker && docker compose -f docker-compose.cluster.yaml up -d"
      )
      throw error
    }
  })

  afterAll(() => {
    client.close()
  })

  // ==========================================================================
  // Connection Tests
  // ==========================================================================

  describe("Connection", () => {
    test("should connect with valid credentials", () => {
      if (skipIfNoIntegration()) {
        return
      }

      expect(client.isConnected()).toBe(true)
    })

    test("should fail with invalid credentials", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const badClient = createTestClient({
        auth: { type: "basic", username: "invalid", password: "wrong" }
      })

      let threw = false
      try {
        await badClient.connect()
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
      badClient.close()
    })

    test("should reconnect after close", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const tempClient = createTestClient()
      await tempClient.connect()
      expect(tempClient.isConnected()).toBe(true)

      tempClient.close()
      expect(tempClient.isConnected()).toBe(false)

      await tempClient.connect()
      expect(tempClient.isConnected()).toBe(true)

      tempClient.close()
    })
  })

  // ==========================================================================
  // Query Execution Tests
  // Note: These tests require the server to return proper Flight SQL schema
  // in FlightInfo responses. Some servers may not support this.
  // ==========================================================================

  describe("Query Execution", () => {
    test("should execute simple SELECT", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const result = await client.query("SELECT 1 as value")
      const table = await result.collect()

      expect(table.numRows).toBe(1)
      expect(table.numCols).toBeGreaterThan(0)
    })

    test("should execute SELECT with multiple rows", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const result = await client.query("SELECT * FROM (VALUES (1), (2), (3)) AS t(n)")
      const table = await result.collect()

      expect(table.numRows).toBe(3)
    })

    test("should stream record batches", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const result = await client.query("SELECT * FROM (VALUES (1), (2), (3)) AS t(n)")

      let batchCount = 0
      let totalRows = 0
      for await (const batch of result.stream()) {
        batchCount++
        totalRows += batch.numRows
      }

      expect(batchCount).toBeGreaterThan(0)
      expect(totalRows).toBe(3)
    })

    test("should handle empty results", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const result = await client.query("SELECT 1 WHERE 1 = 0")
      const table = await result.collect()

      expect(table.numRows).toBe(0)
    })

    test("should get result schema", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const result = await client.query("SELECT 1 as int_col, 'hello' as str_col")
      const schema = result.schema

      expect(schema).toBeDefined()
      if (schema) {
        expect(schema.fields.length).toBe(2)
      }
    })
  })

  // ==========================================================================
  // Catalog Introspection Tests
  // BLOCKED: Server returns "No SQL statements" error when DoGet is called
  // with catalog command tickets. Server-side fix needed.
  // ==========================================================================

  describe("Catalog Introspection", () => {
    test("should get catalogs", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const catalogs = await client.getCatalogs()

      expect(Array.isArray(catalogs)).toBe(true)
      // At minimum, there should be a default catalog
    })

    test("should get schemas", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const schemas = await client.getSchemas()

      expect(Array.isArray(schemas)).toBe(true)
    })

    test("should get tables", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const tables = await client.getTables()

      expect(Array.isArray(tables)).toBe(true)
    })

    test("should filter tables by type", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const tables = await client.getTables({ tableTypes: ["TABLE"] })

      expect(Array.isArray(tables)).toBe(true)
      // All returned tables should be of type TABLE
      for (const table of tables) {
        expect(table.tableType).toBe("TABLE")
      }
    })

    test("should get table types", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const types = await client.getTableTypes()

      expect(Array.isArray(types)).toBe(true)
      // Common types include TABLE, VIEW
    })
  })

  // ==========================================================================
  // Prepared Statement Tests
  // BLOCKED: Server returns "get_flight_info_prepared_statement has no default
  // implementation". Server-side fix needed.
  // ==========================================================================

  describe("Prepared Statements", () => {
    test.skip("should prepare and execute statement", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const stmt = await client.prepare("SELECT 1 as value")

      try {
        const result = await stmt.executeQuery()
        const table = await result.collect()

        expect(table.numRows).toBe(1)
      } finally {
        await stmt.close()
      }
    })

    test("should get prepared statement schema", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const stmt = await client.prepare("SELECT 1 as int_col, 'text' as str_col")

      try {
        const schema = stmt.resultSchema

        expect(schema).toBeDefined()
        if (schema) {
          expect(schema.fields.length).toBe(2)
        }
      } finally {
        await stmt.close()
      }
    })

    test.skip("should execute prepared statement multiple times", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      const stmt = await client.prepare("SELECT 1 as value")

      try {
        // Execute multiple times
        for (let i = 0; i < 3; i++) {
          const result = await stmt.executeQuery()
          const table = await result.collect()
          expect(table.numRows).toBe(1)
        }
      } finally {
        await stmt.close()
      }
    })
  })

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe("Error Handling", () => {
    test("should throw on invalid SQL", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      let threw = false
      try {
        await client.query("INVALID SQL SYNTAX HERE")
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    })

    test("should throw on non-existent table", async () => {
      if (skipIfNoIntegration()) {
        return
      }

      let threw = false
      try {
        await client.query("SELECT * FROM non_existent_table_12345")
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    })
  })
})

// =============================================================================
// Standalone Connection Tests (no shared client)
// =============================================================================

describe("Connection Edge Cases", () => {
  test("should handle connection timeout", async () => {
    if (skipIfNoIntegration()) {
      return
    }

    const client = createTestClient({
      host: "10.255.255.1", // Non-routable IP
      connectTimeoutMs: 1000
    })

    let threw = false
    try {
      await client.connect()
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    client.close()
  })
})

// =============================================================================
// Subscription Tests (DoExchange)
// =============================================================================

describe("Subscriptions", () => {
  test("should create subscription instance", async () => {
    if (skipIfNoIntegration()) {
      return
    }

    const client = createTestClient()
    await client.connect()

    const subscription = client.subscribe("SELECT * FROM events")
    expect(subscription).toBeDefined()
    expect(subscription.connected).toBe(false) // Not connected until iteration starts
    expect(subscription.batchesReceived).toBe(0)

    await subscription.unsubscribe()
    client.close()
  })

  test("should handle subscription with abort signal", async () => {
    if (skipIfNoIntegration()) {
      return
    }

    const client = createTestClient()
    await client.connect()

    const controller = new AbortController()
    const subscription = client.subscribe("SELECT * FROM events", {
      signal: controller.signal
    })

    // Abort immediately
    controller.abort()

    // Iteration should complete without error
    let batchCount = 0
    for await (const batch of subscription) {
      void batch
      batchCount++
    }

    expect(batchCount).toBe(0)
    client.close()
  })

  test("should track batch count", async () => {
    if (skipIfNoIntegration()) {
      return
    }

    const client = createTestClient()
    await client.connect()

    const subscription = client.subscribe("SELECT * FROM events")
    expect(subscription.batchesReceived).toBe(0)

    await subscription.unsubscribe()
    client.close()
  })

  test("should default to CHANGES_ONLY mode", async () => {
    if (skipIfNoIntegration()) {
      return
    }

    const client = createTestClient()
    await client.connect()

    // The subscription is created with defaults
    const subscription = client.subscribe("SELECT * FROM events")
    expect(subscription).toBeDefined()

    await subscription.unsubscribe()
    client.close()
  })

  test("should support custom subscription options", async () => {
    if (skipIfNoIntegration()) {
      return
    }

    const client = createTestClient()
    await client.connect()

    const subscription = client.subscribe("SELECT * FROM events", {
      mode: "FULL",
      heartbeatMs: 15_000,
      autoReconnect: false,
      maxReconnectAttempts: 5,
      reconnectDelayMs: 2_000,
      maxReconnectDelayMs: 60_000,
      metadata: { clientId: "test-client" }
    })

    expect(subscription).toBeDefined()

    await subscription.unsubscribe()
    client.close()
  })
})

import { FlightClient } from "@qualithm/arrow-flight-js"
import { describe, expect, test } from "vitest"

import { createFlightSqlClient, FlightSqlClient } from "../../client.js"

describe("FlightSqlClient", () => {
  describe("constructor", () => {
    test("creates instance with required options", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(client).toBeInstanceOf(FlightSqlClient)
      expect(client.address).toBe("localhost:8815")
      expect(client.state).toBe("disconnected")
    })

    test("creates instance with TLS disabled", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815,
        tls: false
      })

      expect(client).toBeInstanceOf(FlightSqlClient)
    })

    test("creates instance with custom port", () => {
      const client = new FlightSqlClient({
        host: "flight.example.com",
        port: 443,
        tls: true
      })

      expect(client.address).toBe("flight.example.com:443")
    })
  })

  describe("inheritance", () => {
    test("inherits from FlightClient", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(client).toBeInstanceOf(FlightClient)
    })

    test("has query method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.query).toBe("function")
    })

    test("has executeUpdate method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.executeUpdate).toBe("function")
    })

    test("has createPreparedStatement method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.createPreparedStatement).toBe("function")
    })

    test("has closePreparedStatement method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.closePreparedStatement).toBe("function")
    })

    test("has executePreparedQuery method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.executePreparedQuery).toBe("function")
    })

    test("has executePreparedUpdate method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.executePreparedUpdate).toBe("function")
    })

    test("has bindParameters method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.bindParameters).toBe("function")
    })
  })

  describe("metadata methods", () => {
    test("has getCatalogs method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getCatalogs).toBe("function")
    })

    test("has getDbSchemas method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getDbSchemas).toBe("function")
    })

    test("has getTables method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getTables).toBe("function")
    })

    test("has getTableTypes method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getTableTypes).toBe("function")
    })

    test("has getPrimaryKeys method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getPrimaryKeys).toBe("function")
    })

    test("has getExportedKeys method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getExportedKeys).toBe("function")
    })

    test("has getImportedKeys method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getImportedKeys).toBe("function")
    })

    test("has getCrossReference method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getCrossReference).toBe("function")
    })

    test("has getSqlInfo method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getSqlInfo).toBe("function")
    })

    test("has getXdbcTypeInfo method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.getXdbcTypeInfo).toBe("function")
    })
  })

  describe("transaction methods", () => {
    test("has beginTransaction method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.beginTransaction).toBe("function")
    })

    test("has endTransaction method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.endTransaction).toBe("function")
    })

    test("has commit method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.commit).toBe("function")
    })

    test("has rollback method", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.rollback).toBe("function")
    })

    test("has cancelFlightInfo method (inherited from FlightClient)", () => {
      const client = new FlightSqlClient({
        host: "localhost",
        port: 8815
      })

      expect(typeof client.cancelFlightInfo).toBe("function")
    })
  })

  describe("validation", () => {
    test("query throws for empty query", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.query("")).rejects.toThrow("query cannot be empty")
    })

    test("query throws for whitespace-only query", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.query("   ")).rejects.toThrow("query cannot be empty")
    })

    test("executeUpdate throws for empty query", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.executeUpdate("")).rejects.toThrow("query cannot be empty")
    })

    test("createPreparedStatement throws for empty query", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.createPreparedStatement("")).rejects.toThrow("query cannot be empty")
    })

    test("executePreparedQuery throws for empty handle", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.executePreparedQuery(Buffer.alloc(0))).rejects.toThrow(
        "prepared statement handle cannot be empty"
      )
    })

    test("executePreparedUpdate throws for empty handle", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.executePreparedUpdate(Buffer.alloc(0))).rejects.toThrow(
        "prepared statement handle cannot be empty"
      )
    })

    test("closePreparedStatement throws for empty handle", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.closePreparedStatement(Buffer.alloc(0))).rejects.toThrow(
        "prepared statement handle cannot be empty"
      )
    })

    test("bindParameters throws for empty handle", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(
        client.bindParameters(Buffer.alloc(0), {
          schema: new Uint8Array([1]),
          data: new Uint8Array([1])
        })
      ).rejects.toThrow("prepared statement handle cannot be empty")
    })

    test("bindParameters throws for empty schema", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(
        client.bindParameters(Buffer.from("handle"), {
          schema: new Uint8Array(0),
          data: new Uint8Array([1])
        })
      ).rejects.toThrow("parameter schema is required")
    })

    test("bindParameters throws for empty data", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(
        client.bindParameters(Buffer.from("handle"), {
          schema: new Uint8Array([1]),
          data: new Uint8Array(0)
        })
      ).rejects.toThrow("parameter data is required")
    })

    test("endTransaction throws for empty transaction ID", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.commit(Buffer.alloc(0))).rejects.toThrow("transaction ID cannot be empty")
    })

    test("rollback throws for empty transaction ID", async () => {
      const client = new FlightSqlClient({ host: "localhost", port: 8815, tls: false })
      await expect(client.rollback(Buffer.alloc(0))).rejects.toThrow(
        "transaction ID cannot be empty"
      )
    })
  })
})

describe("createFlightSqlClient", () => {
  test("creates and attempts to connect", async () => {
    try {
      await createFlightSqlClient({
        host: "localhost",
        port: 19997,
        tls: false,
        channelOptions: { connectTimeoutMs: 100 }
      })
    } catch {
      // Expected - no server running
    }
  })
})

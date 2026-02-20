import { FlightClient } from "@qualithm/arrow-flight-js"
import { describe, expect, test } from "bun:test"

import { FlightSqlClient } from "../../client.js"

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
})

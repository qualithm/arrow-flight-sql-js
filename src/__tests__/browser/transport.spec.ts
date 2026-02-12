/**
 * Browser integration tests for Arrow Flight SQL library
 *
 * These tests verify the library loads correctly in a browser environment
 * and can instantiate the gRPC-web transport. Full integration tests
 * against a Flight SQL server require a gRPC-web proxy (e.g., Envoy).
 */
import { expect, test } from "@playwright/test"

test.describe("Browser Module Loading", () => {
  test("should load the library successfully", async ({ page }) => {
    await page.goto("/")

    // Wait for library to load
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__, {
      timeout: 5000
    })

    // Verify FlightSql global is available
    const hasFlightSql = await page.evaluate(() => {
      return typeof window.FlightSql === "object"
    })
    expect(hasFlightSql).toBe(true)
  })

  test("should export FlightSqlClient", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const hasClient = await page.evaluate(() => {
      return typeof window.FlightSql.FlightSqlClient === "function"
    })
    expect(hasClient).toBe(true)
  })

  test("should export GrpcWebTransport", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const hasTransport = await page.evaluate(() => {
      return typeof window.FlightSql.GrpcWebTransport === "function"
    })
    expect(hasTransport).toBe(true)
  })

  test("should export createGrpcWebTransport factory", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const hasFactory = await page.evaluate(() => {
      return typeof window.FlightSql.createGrpcWebTransport === "function"
    })
    expect(hasFactory).toBe(true)
  })
})

test.describe("GrpcWebTransport in Browser", () => {
  test("should create transport instance", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const canCreate = await page.evaluate(() => {
      try {
        const transport = new window.FlightSql.GrpcWebTransport({
          host: "localhost",
          port: 50051,
          tls: false
        })
        // If we get here without throwing, the transport was created
        return typeof transport.isConnected === "function"
      } catch {
        return false
      }
    })
    expect(canCreate).toBe(true)
  })

  test("should detect browser runtime", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const runtime = await page.evaluate(() => {
      const info = window.FlightSql.detectRuntime()
      return {
        runtime: info.runtime,
        isBrowser: info.isBrowser,
        supportsGrpcJs: info.supportsGrpcJs
      }
    })

    expect(runtime.runtime).toBe("browser")
    expect(runtime.isBrowser).toBe(true)
    expect(runtime.supportsGrpcJs).toBe(false)
  })

  test("should create transport with TLS config", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const canCreate = await page.evaluate(() => {
      try {
        const transport = new window.FlightSql.GrpcWebTransport({
          host: "flight.example.com",
          port: 443,
          tls: true,
          connectTimeoutMs: 5000,
          requestTimeoutMs: 30000
        })
        return !transport.isConnected() // Not connected until connect() called
      } catch {
        return false
      }
    })
    expect(canCreate).toBe(true)
  })

  test("should get registered transport factory for browser", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const hasFactory = await page.evaluate(() => {
      const factory = window.FlightSql.getTransportFactory("browser")
      return typeof factory === "function"
    })
    expect(hasFactory).toBe(true)
  })
})

test.describe("Error Handling", () => {
  test("should throw when calling methods without connect()", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const throwsError = await page.evaluate(() => {
      try {
        const transport = new window.FlightSql.GrpcWebTransport({
          host: "localhost",
          port: 50051,
          tls: false
        })
        // Should throw because not connected
        transport.doGet({ ticket: new Uint8Array([1, 2, 3]) })
        return false
      } catch (e: unknown) {
        return (e as Error).message.includes("not connected")
      }
    })
    expect(throwsError).toBe(true)
  })

  test("should throw on unsupported bidirectional streaming", async ({ page }) => {
    await page.goto("/")
    await page.waitForFunction(() => window.__FLIGHT_SQL_LOADED__)

    const result = await page.evaluate(() => {
      const transport = new window.FlightSql.GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      const errors = []

      try {
        transport.doPut()
      } catch (e: unknown) {
        errors.push((e as Error).message.includes("not supported"))
      }

      try {
        transport.doExchange()
      } catch (e: unknown) {
        errors.push((e as Error).message.includes("not supported"))
      }

      try {
        transport.handshake()
      } catch (e: unknown) {
        errors.push((e as Error).message.includes("not supported"))
      }

      return errors
    })

    expect(result).toEqual([true, true, true])
  })
})

// Declare global types for TypeScript (interface required for Window augmentation)
declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    __FLIGHT_SQL_LOADED__: boolean
    FlightSql: {
      FlightSqlClient: new (options: unknown) => unknown
      GrpcWebTransport: new (options: {
        host: string
        port: number
        tls: boolean
        connectTimeoutMs?: number
        requestTimeoutMs?: number
      }) => {
        isConnected: () => boolean
        doGet: (ticket: { ticket: Uint8Array }) => unknown
        doPut: () => unknown
        doExchange: () => unknown
        handshake: () => unknown
      }
      createGrpcWebTransport: (options: unknown) => unknown
      getTransportFactory: (runtime: string) => ((options: unknown) => unknown) | undefined
      detectRuntime: () => {
        runtime: string
        isBrowser: boolean
        supportsGrpcJs: boolean
      }
    }
  }
}

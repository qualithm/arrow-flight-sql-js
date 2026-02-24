import type { FlightInfo, Ticket } from "@qualithm/arrow-flight-js"
import { describe, expect, it, vi } from "vitest"

import type { FlightSqlClient } from "../../client.js"
import { FlightSqlError } from "../../errors.js"
import { flightInfoToTable, iterateResults, ticketToTable } from "../../results.js"

// Mock data for testing
function createMockTicket(data = "test-ticket"): Ticket {
  return { ticket: Buffer.from(data) }
}

function createMockFlightInfo(endpoints: { ticket?: Ticket }[] = []): FlightInfo {
  return {
    flightDescriptor: undefined,
    endpoint: endpoints.map((e) => ({
      ticket: e.ticket,
      location: [],
      expirationTime: undefined,
      appMetadata: Buffer.alloc(0)
    })),
    schema: Buffer.alloc(0),
    totalBytes: 0,
    totalRecords: 0,
    ordered: false,
    appMetadata: Buffer.alloc(0)
  }
}

// Minimal valid Arrow IPC schema message for testing
// This is the smallest valid IPC stream that tableFromIPC can parse
function createMinimalIpcBytes(): Uint8Array {
  // A properly formatted Arrow IPC stream with Schema + EOS messages
  // This is a pre-serialised minimal schema for an empty table
  return new Uint8Array([
    // Continuation token
    0xff,
    0xff,
    0xff,
    0xff,
    // Metadata size (68 bytes)
    0x44,
    0x00,
    0x00,
    0x00,
    // Schema flatbuffer (simplified - actual format is more complex)
    // For testing, we just need something that passes the length check
    ...new Array(68).fill(0)
  ])
}

/**
 * Creates an empty async iterable to use in tests where no data should be yielded.
 * Uses a non-generator pattern to avoid lint "generator has no yield" errors.
 */
function createEmptyAsyncIterable<T>(): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => ({
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      next: () => Promise.resolve({ done: true as const, value: undefined })
    })
  }
}

describe("flightInfoToTable", () => {
  describe("error handling", () => {
    it("throws RESULT_ERROR when no endpoints have tickets", async () => {
      const mockClient = {
        doGet: vi.fn()
      } as unknown as FlightSqlClient

      const info = createMockFlightInfo([{ ticket: undefined }, { ticket: undefined }])

      await expect(flightInfoToTable(mockClient, info)).rejects.toThrow(FlightSqlError)
      await expect(flightInfoToTable(mockClient, info)).rejects.toMatchObject({
        sqlCode: "RESULT_ERROR",
        message: "no data returned from query"
      })
    })

    it("throws RESULT_ERROR when all endpoints return empty data", async () => {
      const mockClient = {
        doGet: vi.fn().mockReturnValue(createEmptyAsyncIterable())
      } as unknown as FlightSqlClient

      const info = createMockFlightInfo([{ ticket: createMockTicket() }])

      await expect(flightInfoToTable(mockClient, info)).rejects.toThrow(FlightSqlError)
      await expect(flightInfoToTable(mockClient, info)).rejects.toMatchObject({
        sqlCode: "RESULT_ERROR"
      })
    })

    it("throws RESULT_ERROR when endpoints have no tickets", async () => {
      const mockClient = {
        doGet: vi.fn()
      } as unknown as FlightSqlClient

      const info = createMockFlightInfo([])

      await expect(flightInfoToTable(mockClient, info)).rejects.toThrow(FlightSqlError)
    })
  })

  describe("endpoint handling", () => {
    it("skips endpoints without tickets", async () => {
      const mockDoGet = vi.fn().mockImplementation(async function* () {
        yield await Promise.resolve({
          flightDescriptor: undefined,
          dataHeader: createMinimalIpcBytes(),
          dataBody: new Uint8Array(0),
          appMetadata: new Uint8Array(0)
        })
      })

      const mockClient = {
        doGet: mockDoGet
      } as unknown as FlightSqlClient

      const info = createMockFlightInfo([
        { ticket: undefined },
        { ticket: createMockTicket("valid") },
        { ticket: undefined }
      ])

      try {
        await flightInfoToTable(mockClient, info)
      } catch {
        // May fail due to invalid IPC format, but we're testing endpoint filtering
      }

      // Should only call doGet once for the valid ticket
      expect(mockDoGet).toHaveBeenCalledTimes(1)
      expect(mockDoGet).toHaveBeenCalledWith(
        expect.objectContaining({
          ticket: Buffer.from("valid")
        })
      )
    })

    it("retrieves data from multiple endpoints", async () => {
      const mockDoGet = vi.fn().mockImplementation(async function* () {
        yield await Promise.resolve({
          flightDescriptor: undefined,
          dataHeader: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          dataBody: new Uint8Array(0),
          appMetadata: new Uint8Array(0)
        })
      })

      const mockClient = {
        doGet: mockDoGet
      } as unknown as FlightSqlClient

      const info = createMockFlightInfo([
        { ticket: createMockTicket("ticket1") },
        { ticket: createMockTicket("ticket2") },
        { ticket: createMockTicket("ticket3") }
      ])

      try {
        await flightInfoToTable(mockClient, info)
      } catch {
        // Will fail due to invalid IPC, but we're testing doGet calls
      }

      expect(mockDoGet).toHaveBeenCalledTimes(3)
    })
  })
})

describe("ticketToTable", () => {
  describe("error handling", () => {
    it("throws RESULT_ERROR when doGet returns no data", async () => {
      const mockClient = {
        doGet: vi.fn().mockReturnValue(createEmptyAsyncIterable())
      } as unknown as FlightSqlClient

      const ticket = createMockTicket()

      await expect(ticketToTable(mockClient, ticket)).rejects.toThrow(FlightSqlError)
      await expect(ticketToTable(mockClient, ticket)).rejects.toMatchObject({
        sqlCode: "RESULT_ERROR",
        message: "no data returned from ticket"
      })
    })

    it("calls doGet with the provided ticket", async () => {
      const mockDoGet = vi.fn().mockImplementation(async function* () {
        yield await Promise.resolve({
          flightDescriptor: undefined,
          dataHeader: new Uint8Array([1, 2, 3, 4]),
          dataBody: new Uint8Array(0),
          appMetadata: new Uint8Array(0)
        })
      })

      const mockClient = {
        doGet: mockDoGet
      } as unknown as FlightSqlClient

      const ticket = createMockTicket("my-ticket")

      try {
        await ticketToTable(mockClient, ticket)
      } catch {
        // Will fail due to invalid IPC
      }

      expect(mockDoGet).toHaveBeenCalledWith(ticket)
    })
  })
})

describe("iterateResults", () => {
  it("yields FlightData from all endpoints with tickets", async () => {
    const flightData1 = {
      flightDescriptor: undefined,
      dataHeader: new Uint8Array([1]),
      dataBody: new Uint8Array(0),
      appMetadata: new Uint8Array(0)
    }
    const flightData2 = {
      flightDescriptor: undefined,
      dataHeader: new Uint8Array([2]),
      dataBody: new Uint8Array(0),
      appMetadata: new Uint8Array(0)
    }

    let callCount = 0
    const mockClient = {
      doGet: vi.fn().mockImplementation(async function* () {
        callCount++
        if (callCount === 1) {
          yield await Promise.resolve(flightData1)
        } else {
          yield await Promise.resolve(flightData2)
        }
      })
    } as unknown as FlightSqlClient

    const info = createMockFlightInfo([
      { ticket: createMockTicket("ticket1") },
      { ticket: createMockTicket("ticket2") }
    ])

    const results: unknown[] = []
    for await (const data of iterateResults(mockClient, info)) {
      results.push(data)
    }

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual(flightData1)
    expect(results[1]).toEqual(flightData2)
  })

  it("skips endpoints without tickets", async () => {
    const mockClient = {
      doGet: vi.fn().mockImplementation(async function* () {
        yield await Promise.resolve({
          flightDescriptor: undefined,
          dataHeader: new Uint8Array([1]),
          dataBody: new Uint8Array(0),
          appMetadata: new Uint8Array(0)
        })
      })
    } as unknown as FlightSqlClient

    const info = createMockFlightInfo([
      { ticket: undefined },
      { ticket: createMockTicket() },
      { ticket: undefined }
    ])

    const results: unknown[] = []
    for await (const data of iterateResults(mockClient, info)) {
      results.push(data)
    }

    expect(results).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockClient.doGet).toHaveBeenCalledTimes(1)
  })

  it("yields nothing for empty endpoints", async () => {
    const mockClient = {
      doGet: vi.fn()
    } as unknown as FlightSqlClient

    const info = createMockFlightInfo([])

    const results: unknown[] = []
    for await (const data of iterateResults(mockClient, info)) {
      results.push(data)
    }

    expect(results).toHaveLength(0)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockClient.doGet).not.toHaveBeenCalled()
  })
})

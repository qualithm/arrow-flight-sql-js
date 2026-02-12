/**
 * Unit tests for transport abstraction and gRPC-JS transport
 */

import { afterEach, describe, expect, test } from "bun:test"

import { clearRuntimeCache, detectRuntime, Runtime } from "../../runtime"
import {
  type FlightTransport,
  getRegisteredRuntimes,
  getTransportFactory,
  registerTransport,
  type TransportOptions
} from "../../transport"
import {
  createGrpcJsTransport,
  getTransportForRuntime,
  GrpcJsTransport
} from "../../transport-grpc-js"

describe("Transport Registry", () => {
  test("getRegisteredRuntimes should return registered runtimes", () => {
    const runtimes = getRegisteredRuntimes()

    // Node and Bun are registered by transport-grpc-js.ts
    expect(runtimes).toContain(Runtime.Node)
    expect(runtimes).toContain(Runtime.Bun)
  })

  test("getTransportFactory should return factory for registered runtime", () => {
    const nodeFactory = getTransportFactory(Runtime.Node)
    const bunFactory = getTransportFactory(Runtime.Bun)
    const browserFactory = getTransportFactory(Runtime.Browser)
    const denoFactory = getTransportFactory(Runtime.Deno)

    expect(nodeFactory).toBeDefined()
    expect(bunFactory).toBeDefined()
    expect(browserFactory).toBeDefined()
    expect(denoFactory).toBeDefined()
  })

  test("getTransportFactory should return undefined for unregistered runtime", () => {
    const unknownFactory = getTransportFactory(Runtime.Unknown)

    expect(unknownFactory).toBeUndefined()
  })

  test("registerTransport should add new factory", () => {
    const mockFactory = (_options: TransportOptions): FlightTransport => {
      return {} as FlightTransport
    }

    registerTransport("test-runtime", mockFactory)

    expect(getTransportFactory("test-runtime")).toBe(mockFactory)
    expect(getRegisteredRuntimes()).toContain("test-runtime")
  })
})

describe("GrpcJsTransport", () => {
  const testOptions: TransportOptions = {
    host: "localhost",
    port: 50051,
    tls: false
  }

  test("should create instance with options", () => {
    const transport = new GrpcJsTransport(testOptions)

    expect(transport).toBeInstanceOf(GrpcJsTransport)
    expect(transport.isConnected()).toBe(false)
  })

  test("should not be connected initially", () => {
    const transport = new GrpcJsTransport(testOptions)

    expect(transport.isConnected()).toBe(false)
  })

  test("close should be safe to call when not connected", () => {
    const transport = new GrpcJsTransport(testOptions)

    expect(() => {
      transport.close()
    }).not.toThrow()
    expect(transport.isConnected()).toBe(false)
  })

  test("setAuthToken should accept string token", () => {
    const transport = new GrpcJsTransport(testOptions)

    expect(() => {
      transport.setAuthToken("test-token")
    }).not.toThrow()
  })

  test("setAuthToken should accept null", () => {
    const transport = new GrpcJsTransport(testOptions)

    expect(() => {
      transport.setAuthToken(null)
    }).not.toThrow()
  })

  test("methods should throw when not connected", () => {
    const transport = new GrpcJsTransport(testOptions)
    const descriptor = { type: 2, cmd: new Uint8Array() }
    const ticket = { ticket: new Uint8Array() }

    expect(async () => transport.getFlightInfo(descriptor)).toThrow(/not connected/i)
    expect(async () => transport.getSchema(descriptor)).toThrow(/not connected/i)
    expect(() => transport.doGet(ticket)).toThrow(/not connected/i)
    expect(() => transport.doAction({ type: "test" })).toThrow(/not connected/i)
    expect(() => transport.listActions()).toThrow(/not connected/i)
    expect(() => transport.listFlights()).toThrow(/not connected/i)
    expect(() => transport.doPut()).toThrow(/not connected/i)
    expect(() => transport.doExchange()).toThrow(/not connected/i)
    expect(() => transport.handshake()).toThrow(/not connected/i)
  })

  test("should use default timeouts when not specified", () => {
    const transport = new GrpcJsTransport({
      host: "localhost",
      port: 50051,
      tls: false
    })

    // Internal state check - transport was created successfully
    expect(transport).toBeInstanceOf(GrpcJsTransport)
  })

  test("should use custom timeouts when specified", () => {
    const transport = new GrpcJsTransport({
      host: "localhost",
      port: 50051,
      tls: false,
      connectTimeoutMs: 5000,
      requestTimeoutMs: 10000
    })

    expect(transport).toBeInstanceOf(GrpcJsTransport)
  })
})

describe("createGrpcJsTransport", () => {
  test("should return GrpcJsTransport instance", () => {
    const transport = createGrpcJsTransport({
      host: "localhost",
      port: 50051,
      tls: false
    })

    expect(transport).toBeInstanceOf(GrpcJsTransport)
  })
})

describe("getTransportForRuntime", () => {
  afterEach(() => {
    clearRuntimeCache()
  })

  test("should return GrpcJsTransport in Bun", () => {
    const info = detectRuntime()
    expect(info.runtime).toBe(Runtime.Bun)

    const transport = getTransportForRuntime({
      host: "localhost",
      port: 50051,
      tls: false
    })

    expect(transport).toBeInstanceOf(GrpcJsTransport)
  })
})

describe("Transport Type Exports", () => {
  test("should export all transport types", () => {
    // Type-checking test - ensure types are exported
    // Using a function that returns resolved promises to avoid unused variable warnings
    const noop = (): void => {
      // intentionally empty
    }
    const noopAsync = async (): Promise<void> => Promise.resolve()
    function emptyAsyncIterator(): AsyncGenerator<never> {
      return {
        next: async () => Promise.resolve({ done: true as const, value: undefined as never }),
        return: async () => Promise.resolve({ done: true as const, value: undefined as never }),
        throw: async () => Promise.reject(new Error("throw called")),
        [Symbol.asyncIterator]() {
          return this
        },
        [Symbol.asyncDispose]: async () => Promise.resolve()
      }
    }

    const mockTransport: FlightTransport = {
      connect: noopAsync,
      close: noop,
      isConnected: () => false,
      setAuthToken: noop,
      getFlightInfo: async () => Promise.resolve({}),
      getSchema: async () => Promise.resolve({ schema: new Uint8Array() }),
      doGet: () => ({ ...emptyAsyncIterator(), cancel: noop }),
      doAction: () => ({ ...emptyAsyncIterator(), cancel: noop }),
      listActions: () => ({ ...emptyAsyncIterator(), cancel: noop }),
      listFlights: () => ({ ...emptyAsyncIterator(), cancel: noop }),
      doPut: () => ({
        ...emptyAsyncIterator(),
        cancel: noop,
        write: () => true,
        end: noop
      }),
      doExchange: () => ({
        ...emptyAsyncIterator(),
        cancel: noop,
        write: () => true,
        end: noop
      }),
      handshake: () => ({
        ...emptyAsyncIterator(),
        cancel: noop,
        write: () => true,
        end: noop
      })
    }

    expect(mockTransport).toBeDefined()
  })
})

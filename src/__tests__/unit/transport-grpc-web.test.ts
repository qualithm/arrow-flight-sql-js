/**
 * Unit tests for gRPC-Web Transport
 */
import { describe, expect, test } from "bun:test"

import { createGrpcWebTransport, getWebTransport, GrpcWebTransport } from "../../transport-grpc-web"

describe("GrpcWebTransport", () => {
  describe("constructor", () => {
    test("should create transport with minimal options", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      expect(transport).toBeDefined()
      expect(transport.isConnected()).toBe(false)
    })

    test("should create transport with TLS", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 443,
        tls: true
      })

      expect(transport).toBeDefined()
    })

    test("should create transport with custom timeouts", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false,
        connectTimeoutMs: 5000,
        requestTimeoutMs: 10000
      })

      expect(transport).toBeDefined()
    })
  })

  describe("isConnected", () => {
    test("should return false before connect", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      expect(transport.isConnected()).toBe(false)
    })
  })

  describe("close", () => {
    test("should set connected to false", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      transport.close()
      expect(transport.isConnected()).toBe(false)
    })
  })

  describe("setAuthToken", () => {
    test("should accept token", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      // Should not throw
      transport.setAuthToken("test-token")
      transport.setAuthToken(null)
    })
  })

  describe("ensureConnected", () => {
    test("should throw when not connected", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      // Calling a method that requires connection should throw
      expect(() => {
        transport.doGet({ ticket: new Uint8Array([1, 2, 3]) })
      }).toThrow("Transport not connected")
    })
  })

  describe("unsupported methods", () => {
    test("doPut should throw", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      expect(() => {
        transport.doPut()
      }).toThrow("DoPut (client streaming) is not supported in gRPC-web")
    })

    test("doExchange should throw", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      expect(() => {
        transport.doExchange()
      }).toThrow("DoExchange (bidirectional streaming) is not supported in gRPC-web")
    })

    test("handshake should throw", () => {
      const transport = new GrpcWebTransport({
        host: "localhost",
        port: 50051,
        tls: false
      })

      expect(() => {
        transport.handshake()
      }).toThrow("Handshake (bidirectional streaming) is not supported in gRPC-web")
    })
  })
})

describe("createGrpcWebTransport", () => {
  test("should create GrpcWebTransport instance", () => {
    const transport = createGrpcWebTransport({
      host: "localhost",
      port: 50051,
      tls: false
    })

    expect(transport).toBeInstanceOf(GrpcWebTransport)
  })
})

describe("getWebTransport", () => {
  test("should create GrpcWebTransport instance", () => {
    const transport = getWebTransport({
      host: "localhost",
      port: 50051,
      tls: false
    })

    expect(transport).toBeInstanceOf(GrpcWebTransport)
  })
})

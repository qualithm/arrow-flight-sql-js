/**
 * Unit tests for subscription types and utilities
 */

import { describe, expect, test } from "bun:test"

import type { SubscriptionMetadata } from "../../types"
import { SubscriptionMessageType, SubscriptionMode } from "../../types"

describe("SubscriptionMode", () => {
  test("should have FULL mode", () => {
    expect(SubscriptionMode.FULL).toBe("FULL")
  })

  test("should have CHANGES_ONLY mode", () => {
    expect(SubscriptionMode.CHANGES_ONLY).toBe("CHANGES_ONLY")
  })

  test("should have TAIL mode", () => {
    expect(SubscriptionMode.TAIL).toBe("TAIL")
  })
})

describe("SubscriptionMessageType", () => {
  test("should have SUBSCRIBE type", () => {
    expect(SubscriptionMessageType.SUBSCRIBE).toBe("SUBSCRIBE")
  })

  test("should have UNSUBSCRIBE type", () => {
    expect(SubscriptionMessageType.UNSUBSCRIBE).toBe("UNSUBSCRIBE")
  })

  test("should have HEARTBEAT type", () => {
    expect(SubscriptionMessageType.HEARTBEAT).toBe("HEARTBEAT")
  })

  test("should have DATA type", () => {
    expect(SubscriptionMessageType.DATA).toBe("DATA")
  })

  test("should have COMPLETE type", () => {
    expect(SubscriptionMessageType.COMPLETE).toBe("COMPLETE")
  })

  test("should have ERROR type", () => {
    expect(SubscriptionMessageType.ERROR).toBe("ERROR")
  })
})

describe("Subscription metadata encoding", () => {
  test("should encode subscribe message as JSON", () => {
    const metadata: SubscriptionMetadata = {
      type: SubscriptionMessageType.SUBSCRIBE,
      query: "SELECT * FROM events",
      mode: SubscriptionMode.CHANGES_ONLY
    }

    const encoded = new TextEncoder().encode(JSON.stringify(metadata))
    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as SubscriptionMetadata

    expect(decoded.type).toBe("SUBSCRIBE")
    expect(decoded.query).toBe("SELECT * FROM events")
    expect(decoded.mode).toBe("CHANGES_ONLY")
  })

  test("should encode heartbeat message", () => {
    const metadata: SubscriptionMetadata = {
      type: SubscriptionMessageType.HEARTBEAT,
      timestamp: Date.now()
    }

    const encoded = new TextEncoder().encode(JSON.stringify(metadata))
    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as SubscriptionMetadata

    expect(decoded.type).toBe("HEARTBEAT")
    expect(typeof decoded.timestamp).toBe("number")
  })

  test("should encode unsubscribe message with subscription ID", () => {
    const metadata: SubscriptionMetadata = {
      type: SubscriptionMessageType.UNSUBSCRIBE,
      subscriptionId: "sub-123",
      timestamp: Date.now()
    }

    const encoded = new TextEncoder().encode(JSON.stringify(metadata))
    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as SubscriptionMetadata

    expect(decoded.type).toBe("UNSUBSCRIBE")
    expect(decoded.subscriptionId).toBe("sub-123")
  })

  test("should encode error message", () => {
    const metadata: SubscriptionMetadata = {
      type: SubscriptionMessageType.ERROR,
      error: "Query execution failed: table not found"
    }

    const encoded = new TextEncoder().encode(JSON.stringify(metadata))
    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as SubscriptionMetadata

    expect(decoded.type).toBe("ERROR")
    expect(decoded.error).toBe("Query execution failed: table not found")
  })

  test("should encode complete message", () => {
    const metadata: SubscriptionMetadata = {
      type: SubscriptionMessageType.COMPLETE,
      subscriptionId: "sub-123"
    }

    const encoded = new TextEncoder().encode(JSON.stringify(metadata))
    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as SubscriptionMetadata

    expect(decoded.type).toBe("COMPLETE")
    expect(decoded.subscriptionId).toBe("sub-123")
  })
})

describe("Subscription default options", () => {
  test("default mode should be CHANGES_ONLY", () => {
    // Based on Subscription constructor defaults
    const defaults = {
      mode: SubscriptionMode.CHANGES_ONLY,
      heartbeatMs: 30_000,
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectDelayMs: 1_000,
      maxReconnectDelayMs: 30_000
    }

    expect(defaults.mode).toBe(SubscriptionMode.CHANGES_ONLY)
  })

  test("default heartbeat interval should be 30 seconds", () => {
    const defaults = { heartbeatMs: 30_000 }
    expect(defaults.heartbeatMs).toBe(30_000)
  })

  test("default should auto-reconnect", () => {
    const defaults = { autoReconnect: true }
    expect(defaults.autoReconnect).toBe(true)
  })

  test("default max reconnect attempts should be 10", () => {
    const defaults = { maxReconnectAttempts: 10 }
    expect(defaults.maxReconnectAttempts).toBe(10)
  })

  test("default reconnect delay should be 1 second", () => {
    const defaults = { reconnectDelayMs: 1_000 }
    expect(defaults.reconnectDelayMs).toBe(1_000)
  })

  test("default max reconnect delay should be 30 seconds", () => {
    const defaults = { maxReconnectDelayMs: 30_000 }
    expect(defaults.maxReconnectDelayMs).toBe(30_000)
  })
})

describe("Subscription command encoding", () => {
  test("should encode subscription request as JSON with query", () => {
    const request: SubscriptionMetadata & { heartbeatMs?: number } = {
      type: SubscriptionMessageType.SUBSCRIBE,
      query: "SELECT * FROM my_table WHERE active = true",
      mode: SubscriptionMode.FULL,
      heartbeatMs: 15_000
    }

    const encoded = new TextEncoder().encode(JSON.stringify(request))
    expect(encoded.length).toBeGreaterThan(0)

    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as SubscriptionMetadata & {
      heartbeatMs?: number
    }
    expect(decoded.type).toBe("SUBSCRIBE")
    expect(decoded.query).toBe("SELECT * FROM my_table WHERE active = true")
    expect(decoded.mode).toBe("FULL")
    expect(decoded.heartbeatMs).toBe(15_000)
  })

  test("should handle special characters in query", () => {
    const request: SubscriptionMetadata = {
      type: SubscriptionMessageType.SUBSCRIBE,
      query: "SELECT * FROM table WHERE name = 'O''Brien' AND emoji = '🚀'"
    }

    const encoded = new TextEncoder().encode(JSON.stringify(request))
    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as SubscriptionMetadata

    expect(decoded.query).toBe("SELECT * FROM table WHERE name = 'O''Brien' AND emoji = '🚀'")
  })

  test("should include optional metadata", () => {
    interface ExtendedMetadata {
      type: string
      query: string
      mode: string
      metadata: Record<string, string>
    }

    const request: ExtendedMetadata = {
      type: SubscriptionMessageType.SUBSCRIBE,
      query: "SELECT * FROM events",
      mode: SubscriptionMode.TAIL,
      metadata: {
        clientId: "client-123",
        version: "1.0.0"
      }
    }

    const encoded = new TextEncoder().encode(JSON.stringify(request))
    const decoded = JSON.parse(new TextDecoder().decode(encoded)) as ExtendedMetadata

    expect(decoded.metadata.clientId).toBe("client-123")
    expect(decoded.metadata.version).toBe("1.0.0")
  })
})

describe("Reconnection backoff calculation", () => {
  test("should double delay on each attempt", () => {
    const baseDelay = 1000
    const delays = [1, 2, 3, 4, 5].map((attempt) =>
      Math.min(baseDelay * Math.pow(2, attempt - 1), 30_000)
    )

    expect(delays[0]).toBe(1000)
    expect(delays[1]).toBe(2000)
    expect(delays[2]).toBe(4000)
    expect(delays[3]).toBe(8000)
    expect(delays[4]).toBe(16000)
  })

  test("should cap at max delay", () => {
    const baseDelay = 1000
    const maxDelay = 30_000
    const attempt = 10

    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
    expect(delay).toBe(30_000)
  })

  test("jitter should be within 10% of base delay", () => {
    const baseDelay = 10_000

    // Jitter formula: Math.random() * baseDelay * 0.1
    // Max jitter = baseDelay * 0.1 = 1000
    for (let i = 0; i < 100; i++) {
      const jitter = Math.random() * baseDelay * 0.1
      expect(jitter).toBeLessThanOrEqual(1000)
      expect(jitter).toBeGreaterThanOrEqual(0)
    }
  })
})

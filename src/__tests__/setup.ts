/**
 * Test setup and utilities for Arrow Flight SQL tests
 */

import { FlightSqlClient } from "../client"
import type { FlightSqlClientOptions } from "../types"

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Get integration test configuration from environment variables
 */
export function getTestConfig(): {
  host: string
  port: number
  tls: boolean
  username: string
  password: string
  skipIntegration: boolean
} {
  return {
    host: process.env.FLIGHT_SQL_HOST ?? "localhost",
    port: Number(process.env.FLIGHT_SQL_PORT ?? "8815"),
    tls: process.env.FLIGHT_SQL_TLS === "true",
    username: process.env.FLIGHT_SQL_USERNAME ?? "admin",
    password: process.env.FLIGHT_SQL_PASSWORD ?? "lakehouse",
    skipIntegration: process.env.SKIP_INTEGRATION_TESTS === "true"
  }
}

/**
 * Create a test client with default configuration
 */
export function createTestClient(overrides?: Partial<FlightSqlClientOptions>): FlightSqlClient {
  const config = getTestConfig()

  return new FlightSqlClient({
    host: config.host,
    port: config.port,
    tls: config.tls,
    auth: {
      type: "basic",
      username: config.username,
      password: config.password
    },
    connectTimeoutMs: 10_000,
    requestTimeoutMs: 30_000,
    ...overrides
  })
}

/**
 * Run a test with a connected client, ensuring cleanup
 */
export async function withTestClient<T>(
  fn: (client: FlightSqlClient) => Promise<T>,
  overrides?: Partial<FlightSqlClientOptions>
): Promise<T> {
  const client = createTestClient(overrides)

  try {
    await client.connect()
    return await fn(client)
  } finally {
    client.close()
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Skip test if integration tests are disabled
 */
export function skipIfNoIntegration(): boolean {
  const config = getTestConfig()
  if (config.skipIntegration) {
    console.warn("Skipping integration test (SKIP_INTEGRATION_TESTS=true)")
    return true
  }
  return false
}

/**
 * Collect all batches from an async iterable into an array
 */
export async function collectBatches<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of iterable) {
    results.push(item)
  }
  return results
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timeout waiting for condition after ${String(timeoutMs)}ms`)
}

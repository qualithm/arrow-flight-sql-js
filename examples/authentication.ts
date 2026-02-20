/**
 * Authentication example.
 *
 * Demonstrates different authentication methods for connecting
 * to a Flight SQL server.
 *
 * @example
 * ```bash
 * bun run examples/authentication.ts
 * ```
 */
import { createFlightSqlClient, FlightSqlClient } from "../src/index.js"

async function main(): Promise<void> {
  console.log("=== Authentication Examples ===\n")

  // Example 1: No authentication (for local development)
  console.log("--- Example 1: No Authentication ---")
  await withNoAuth()

  // Example 2: Basic authentication (username/password)
  console.log("\n--- Example 2: Basic Authentication ---")
  await withBasicAuth()

  // Example 3: Bearer token authentication
  console.log("\n--- Example 3: Bearer Token Authentication ---")
  await withBearerAuth()

  // Example 4: Two-step connection (create then connect)
  console.log("\n--- Example 4: Two-Step Connection ---")
  await twoStepConnection()
}

async function withNoAuth(): Promise<void> {
  // Simple connection without authentication
  // Typically used for local development or testing
  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("  Connected without authentication")
  client.close()
  console.log("  Connection closed")
}

async function withBasicAuth(): Promise<void> {
  // Basic authentication with username and password
  // The credentials are sent with each request
  try {
    const client = await createFlightSqlClient({
      host: "localhost",
      port: 8815,
      tls: false,
      auth: {
        type: "basic",
        username: "demo_user",
        password: "demo_password"
      }
    })

    console.log("  Connected with basic auth")
    client.close()
    console.log("  Connection closed")
  } catch (error) {
    console.log("  Connection failed (expected if server doesn't support basic auth)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function withBearerAuth(): Promise<void> {
  // Bearer token authentication
  // Commonly used with OAuth2 or JWT tokens
  try {
    const client = await createFlightSqlClient({
      host: "localhost",
      port: 8815,
      tls: false,
      auth: {
        type: "bearer",
        token: "your-jwt-or-oauth-token"
      }
    })

    console.log("  Connected with bearer token")
    client.close()
    console.log("  Connection closed")
  } catch (error) {
    console.log("  Connection failed (expected if server doesn't support bearer auth)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function twoStepConnection(): Promise<void> {
  // Two-step connection: create client first, then connect
  // Useful when you need to configure the client before connecting
  const client = new FlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("  Client created (not yet connected)")

  await client.connect()
  console.log("  Now connected")

  client.close()
  console.log("  Connection closed")
}

main().catch(console.error)

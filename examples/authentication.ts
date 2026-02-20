/**
 * Authentication and TLS connections example.
 *
 * Demonstrates different authentication methods and TLS configurations
 * for connecting to a Flight SQL server.
 *
 * @example
 * ```bash
 * bun run examples/authentication.ts
 * ```
 */
import { readFileSync } from "node:fs"

import { createFlightSqlClient } from "../src/index.js"

async function main(): Promise<void> {
  console.log("=== Authentication Examples ===\n")

  // Basic authentication patterns
  console.log("--- Example 1: No Authentication ---")
  await withNoAuth()

  console.log("\n--- Example 2: Basic Authentication ---")
  await withBasicAuth()

  console.log("\n--- Example 3: Bearer Token ---")
  await withBearerAuth()

  // TLS connection patterns
  console.log("\n=== TLS Connection Examples ===\n")

  console.log("--- Example 4: TLS with System CA ---")
  await withTLS()

  console.log("\n--- Example 5: TLS with Custom CA ---")
  await withCustomCA()

  console.log("\n--- Example 6: Mutual TLS (mTLS) ---")
  await withMutualTLS()
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
  } catch (error) {
    console.log("  Connection failed (expected if server doesn't support basic auth)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function withBearerAuth(): Promise<void> {
  // Bearer token authentication (OAuth2/JWT)
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
  } catch (error) {
    console.log("  Connection failed (expected if server doesn't support bearer auth)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function withTLS(): Promise<void> {
  // TLS connection using system-installed CA certificates
  // Works for servers with certificates signed by public CAs
  try {
    const client = await createFlightSqlClient({
      host: "flight-sql.example.com",
      port: 443,
      tls: true
    })

    console.log("  Connected with TLS (system CAs)")
    client.close()
  } catch (error) {
    console.log("  Connection failed (expected if server not available)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function withCustomCA(): Promise<void> {
  // TLS with custom CA certificate for self-signed or private CAs
  try {
    const caCert = readFileSync("/path/to/ca-certificate.pem")

    const client = await createFlightSqlClient({
      host: "internal-flight-sql.company.local",
      port: 8815,
      tls: {
        rootCerts: caCert
      }
    })

    console.log("  Connected with custom CA certificate")
    client.close()
  } catch (error) {
    console.log("  Connection failed (expected if cert file not found)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function withMutualTLS(): Promise<void> {
  // Mutual TLS (mTLS) - server verifies client certificate
  try {
    const caCert = readFileSync("/path/to/ca-certificate.pem")
    const clientCert = readFileSync("/path/to/client-certificate.pem")
    const clientKey = readFileSync("/path/to/client-key.pem")

    const client = await createFlightSqlClient({
      host: "secure-flight-sql.company.local",
      port: 8815,
      tls: {
        rootCerts: caCert,
        certChain: clientCert,
        privateKey: clientKey
      }
    })

    console.log("  Connected with mutual TLS (mTLS)")
    client.close()
  } catch (error) {
    console.log("  Connection failed (expected if cert files not found)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

main().catch(console.error)

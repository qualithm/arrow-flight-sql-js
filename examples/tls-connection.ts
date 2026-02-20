/**
 * TLS connection example.
 *
 * Demonstrates connecting to a Flight SQL server with TLS encryption
 * using various certificate configurations for production environments.
 *
 * @example
 * ```bash
 * bun run examples/tls-connection.ts
 * ```
 */
import { readFileSync } from "node:fs"

import { createFlightSqlClient, queryToTable } from "../src/index.js"

async function main(): Promise<void> {
  console.log("=== TLS Connection Examples ===\n")

  // Example 1: TLS with system CA certificates (default)
  console.log("--- Example 1: System CA Certificates ---")
  await withSystemCerts()

  // Example 2: TLS with custom CA certificate
  console.log("\n--- Example 2: Custom CA Certificate ---")
  await withCustomCA()

  // Example 3: Mutual TLS (mTLS) with client certificate
  console.log("\n--- Example 3: Mutual TLS (mTLS) ---")
  await withMutualTLS()

  // Example 4: TLS with certificate verification disabled (development only)
  console.log("\n--- Example 4: Skip Certificate Verification ---")
  await withSkipVerify()
}

async function withSystemCerts(): Promise<void> {
  // Simple TLS connection using system-installed CA certificates
  // This works for servers with certificates signed by public CAs
  try {
    const client = await createFlightSqlClient({
      host: "flight-sql.example.com",
      port: 443,
      tls: true
    })

    console.log("  Connected with TLS (system CAs)")
    const table = await queryToTable(client, "SELECT 1 AS test")
    console.log("  Query result rows:", table.numRows)
    client.close()
  } catch (error) {
    console.log("  Connection failed (expected if server not available)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function withCustomCA(): Promise<void> {
  // TLS connection with a custom CA certificate
  // Use this when connecting to servers with self-signed or private CA certificates
  try {
    // Load your CA certificate (PEM format)
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
  // Mutual TLS (mTLS) requires both server and client certificates
  // The server verifies the client's identity using the client certificate
  try {
    // Load certificates (PEM format)
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

async function withSkipVerify(): Promise<void> {
  // WARNING: Only use this for local development or testing!
  // Disabling certificate verification makes the connection vulnerable
  // to man-in-the-middle attacks.
  try {
    const client = await createFlightSqlClient({
      host: "localhost",
      port: 8815,
      tls: {
        verifyServerCert: false // Skips certificate verification
      }
    })

    console.log("  Connected with TLS (verification disabled)")
    console.log("  WARNING: This is insecure and should only be used for development!")
    client.close()
  } catch (error) {
    console.log("  Connection failed (expected if server not available)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

main().catch(console.error)

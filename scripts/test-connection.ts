#!/usr/bin/env bun
/**
 * Demo script to test Arrow Flight SQL server connectivity.
 *
 * Usage:
 *   bun run demo
 *
 * Environment variables:
 *   FLIGHT_HOST - Server hostname (default: localhost)
 *   FLIGHT_PORT - Server port (default: 8815)
 *   FLIGHT_TLS  - Enable TLS (default: false)
 */

import { createFlightSqlClient } from "../src/index.js"

const host = process.env.FLIGHT_HOST ?? "localhost"
const port = Number(process.env.FLIGHT_PORT ?? 8815)
const tls = process.env.FLIGHT_TLS === "true"

console.log("Arrow Flight SQL Connection Test")
console.log("=================================")
console.log(`Host: ${host}:${String(port)}`)
console.log(`TLS:  ${String(tls)}\n`)

try {
  const client = await createFlightSqlClient({ host, port, tls })
  console.log("Connected successfully!")
  client.close()
} catch (error) {
  console.error("Connection failed:", error instanceof Error ? error.message : String(error))
  process.exit(1)
}

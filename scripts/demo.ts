#!/usr/bin/env bun
/**
 * Demo script showcasing the Arrow Flight SQL client.
 *
 * Run with: bun run demo
 *
 * This demo requires a running Flight SQL server. You can start one with:
 * - DuckDB: duckdb -cmd "INSTALL arrow; LOAD arrow;" :memory:
 * - Apache Arrow Flight SQL Example Server
 */

import { createFlightSqlClient, queryToTable } from "../src/index.js"

console.log("Arrow Flight SQL Client Demo")
console.log("============================\n")

const host = process.env.FLIGHT_HOST ?? "localhost"
const port = Number(process.env.FLIGHT_PORT ?? 8815)

console.log(`Connecting to ${host}:${String(port)}...`)

try {
  const client = await createFlightSqlClient({
    host,
    port,
    tls: false
  })

  console.log("Connected!\n")

  // Execute a simple query
  console.log("Executing query: SELECT 1 as value")
  const info = await client.query("SELECT 1 as value")
  console.log("FlightInfo received:")
  console.log("  - Endpoints:", info.endpoint.length)

  // If we can retrieve the table
  if (info.endpoint.length > 0) {
    const table = await queryToTable(client, "SELECT 1 as value, 'hello' as message")
    console.log("\nQuery result:")
    console.log("  - Rows:", table.numRows)
    console.log("  - Schema:", table.schema.fields.map((f) => f.name).join(", "))
  }

  client.close()
  console.log("\nDemo completed successfully!")
} catch (error) {
  console.error("Demo failed:", error instanceof Error ? error.message : String(error))
  console.log("\nNote: This demo requires a running Flight SQL server.")
  process.exit(1)
}

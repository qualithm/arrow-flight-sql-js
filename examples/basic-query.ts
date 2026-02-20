/**
 * Basic query execution example.
 *
 * Demonstrates connecting to a Flight SQL server and executing
 * simple queries with result handling.
 *
 * @example
 * ```bash
 * bun run examples/basic-query.ts
 * ```
 */
import { createFlightSqlClient, queryToTable } from "../src/index.js"

async function main(): Promise<void> {
  console.log("=== Basic Query Examples ===\n")

  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server\n")

  try {
    // Example 1: Simple SELECT query
    console.log("--- Example 1: Simple Query ---")
    await simpleQuery(client)

    // Example 2: Query with column inspection
    console.log("\n--- Example 2: Schema Inspection ---")
    await schemaInspection(client)

    // Example 3: Row iteration
    console.log("\n--- Example 3: Row Iteration ---")
    await rowIteration(client)
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

async function simpleQuery(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Execute a simple query and get results as an Arrow Table
    const table = await queryToTable(client, "SELECT * FROM users LIMIT 10")

    console.log(`  Rows returned: ${String(table.numRows)}`)
  } catch (error) {
    console.log("  Query failed (expected if table doesn't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function schemaInspection(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    const table = await queryToTable(client, "SELECT id, name, email FROM users LIMIT 1")

    console.log("  Schema:")
    for (const field of table.schema.fields) {
      console.log(`    ${field.name}: ${JSON.stringify(field.type)}`)
    }
  } catch (error) {
    console.log("  Query failed (expected if table doesn't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function rowIteration(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    const table = await queryToTable(client, "SELECT * FROM users LIMIT 3")

    console.log("  Data:")
    for (const row of table) {
      console.log("   ", JSON.stringify(row))
    }
  } catch (error) {
    console.log("  Query failed (expected if table doesn't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

main().catch(console.error)

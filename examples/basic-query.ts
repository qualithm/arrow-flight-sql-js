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
  // Connect to a Flight SQL server
  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server")

  try {
    // Execute a simple query and get results as an Arrow Table
    const table = await queryToTable(client, "SELECT * FROM users LIMIT 10")

    console.log("\nQuery Results:")
    console.log(`  Rows: ${String(table.numRows)}`)
    console.log(`  Columns: ${table.schema.fields.map((f) => f.name).join(", ")}`)

    // Iterate over rows
    console.log("\nData:")
    for (const row of table) {
      console.log(" ", JSON.stringify(row))
    }
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

main().catch(console.error)

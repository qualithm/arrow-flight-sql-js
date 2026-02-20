/**
 * Prepared statements example.
 *
 * Demonstrates creating, executing, and closing prepared statements
 * for parameterised queries.
 *
 * @example
 * ```bash
 * bun run examples/prepared-statements.ts
 * ```
 */
import { createFlightSqlClient, flightInfoToTable } from "../src/index.js"

async function main(): Promise<void> {
  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server")

  // Keep track of handles for cleanup
  const handles: Buffer[] = []

  try {
    // Create a prepared statement for a query
    console.log("\n1. Creating prepared statement...")
    const prepared = await client.createPreparedStatement(
      "SELECT * FROM users WHERE department = ? AND active = ?"
    )
    handles.push(prepared.handle)

    console.log("   Handle:", `${prepared.handle.toString("hex").slice(0, 16)}...`)
    console.log("   Dataset schema length:", prepared.datasetSchema.length, "bytes")
    console.log("   Parameter schema length:", prepared.parameterSchema.length, "bytes")

    // Note: Parameter binding requires Arrow IPC format
    // In a real application, you would:
    // 1. Create an Arrow table with parameter values
    // 2. Convert to IPC format
    // 3. Call client.bindParameters(handle, { schema, data })

    // Execute the prepared query (without parameters for this example)
    console.log("\n2. Executing prepared query...")
    const info = await client.executePreparedQuery(prepared.handle)

    console.log("   Total records:", info.totalRecords)
    console.log("   Endpoints:", info.endpoint.length)

    // Fetch results
    const table = await flightInfoToTable(client, info)
    console.log("   Returned rows:", table.numRows)

    // Create a prepared statement for an update
    console.log("\n3. Creating prepared update statement...")
    const updatePrepared = await client.createPreparedStatement(
      "UPDATE users SET last_login = NOW() WHERE id = ?"
    )
    handles.push(updatePrepared.handle)

    // Execute the prepared update
    console.log("   Executing prepared update...")
    const updateResult = await client.executePreparedUpdate(updatePrepared.handle)
    console.log("   Rows affected:", updateResult.recordCount)
  } finally {
    // Always close prepared statements to release server resources
    console.log("\n4. Closing prepared statements...")
    for (const handle of handles) {
      await client.closePreparedStatement(handle)
      console.log("   Closed:", `${handle.toString("hex").slice(0, 16)}...`)
    }

    client.close()
    console.log("\nConnection closed")
  }
}

main().catch(console.error)

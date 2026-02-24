/**
 * Prepared statements example.
 *
 * Demonstrates creating and executing prepared statements with
 * parameter binding for parameterised queries and updates.
 *
 * @example
 * ```bash
 * bun run examples/prepared-statements.ts
 * ```
 */
import { tableFromArrays, tableToIPC } from "apache-arrow"

import { createFlightSqlClient, flightInfoToTable } from "../src/index.js"

async function main(): Promise<void> {
  console.log("=== Prepared Statement Examples ===\n")

  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server\n")

  try {
    // Example 1: Simple prepared statement
    console.log("--- Example 1: Simple Prepared Statement ---")
    await simplePreparedStatement(client)

    // Example 2: Prepared statement with parameters
    console.log("\n--- Example 2: Parameterised Query ---")
    await parameterisedQuery(client)

    // Example 3: Prepared update statement
    console.log("\n--- Example 3: Prepared Update ---")
    await preparedUpdate(client)

    // Example 4: Reusing prepared statements
    console.log("\n--- Example 4: Reusing Prepared Statements ---")
    await reusingPreparedStatement(client)
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

async function simplePreparedStatement(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Create a prepared statement
    const prepared = await client.createPreparedStatement("SELECT * FROM users LIMIT 5")
    console.log("  Prepared statement created")

    // Check the schemas
    if (prepared.datasetSchema.length > 0) {
      console.log("  Result schema available:", prepared.datasetSchema.length, "bytes")
    }
    if (prepared.parameterSchema.length > 0) {
      console.log("  Parameter schema available:", prepared.parameterSchema.length, "bytes")
    }

    // Execute the prepared statement
    const info = await client.executePreparedQuery(prepared.handle)
    const table = await flightInfoToTable(client, info)
    console.log("  Rows returned:", table.numRows)

    // Always close prepared statements when done
    await client.closePreparedStatement(prepared.handle)
    console.log("  Prepared statement closed")
  } catch (error) {
    console.log("  Query failed (expected if table doesn't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function parameterisedQuery(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Create a prepared statement with a parameter placeholder
    const prepared = await client.createPreparedStatement("SELECT * FROM users WHERE id = ?")
    console.log("  Prepared statement created")

    // Create parameter data as Arrow IPC
    // The parameter schema should match what the server expects
    const params = tableFromArrays({ id: [42] })
    const ipcData = tableToIPC(params)

    // Split IPC data into schema and data portions
    // Note: This is a simplified example; real implementations may need
    // to parse the IPC stream to correctly separate schema and record batch
    const schemaBytes = ipcData.slice(0, 512) // Approximate schema size
    const dataBytes = ipcData.slice(512)

    // Bind the parameters
    const bindResult = await client.bindParameters(prepared.handle, {
      schema: schemaBytes,
      data: dataBytes
    })
    console.log("  Parameters bound")

    // Use updated handle if provided, otherwise use original
    const handle = bindResult.handle ?? prepared.handle

    // Execute with bound parameters
    const info = await client.executePreparedQuery(handle)
    const table = await flightInfoToTable(client, info)
    console.log("  Rows returned:", table.numRows)

    // Clean up
    await client.closePreparedStatement(prepared.handle)
    console.log("  Prepared statement closed")
  } catch (error) {
    console.log("  Query failed (parameterised queries may not be supported)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function preparedUpdate(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Create a prepared UPDATE statement
    const prepared = await client.createPreparedStatement(
      "UPDATE users SET active = false WHERE last_login < ?"
    )
    console.log("  Prepared statement created")

    // Create parameter data
    const params = tableFromArrays({ last_login: ["2024-01-01"] })
    const ipcData = tableToIPC(params)

    const schemaBytes = ipcData.slice(0, 512)
    const dataBytes = ipcData.slice(512)

    // Bind parameters
    await client.bindParameters(prepared.handle, {
      schema: schemaBytes,
      data: dataBytes
    })
    console.log("  Parameters bound")

    // Execute the prepared update
    const result = await client.executePreparedUpdate(prepared.handle)
    console.log("  Rows updated:", result.recordCount)

    // Clean up
    await client.closePreparedStatement(prepared.handle)
    console.log("  Prepared statement closed")
  } catch (error) {
    console.log("  Update failed (expected if table doesn't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function reusingPreparedStatement(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Create a prepared statement once
    const prepared = await client.createPreparedStatement("SELECT * FROM users WHERE id = ?")
    console.log("  Prepared statement created")

    // Execute multiple times with different parameter values
    const userIds = [1, 2, 3]
    let totalRows = 0

    for (const userId of userIds) {
      // Bind new parameters for each execution
      const params = tableFromArrays({ id: [userId] })
      const ipcData = tableToIPC(params)

      const schemaBytes = ipcData.slice(0, 512)
      const dataBytes = ipcData.slice(512)

      const bindResult = await client.bindParameters(prepared.handle, {
        schema: schemaBytes,
        data: dataBytes
      })

      // Execute with current parameters
      const handle = bindResult.handle ?? prepared.handle
      const info = await client.executePreparedQuery(handle)
      const table = await flightInfoToTable(client, info)
      totalRows += table.numRows
      console.log(`  User ${String(userId)}: ${String(table.numRows)} rows`)
    }

    console.log("  Total rows:", totalRows)

    // Close only once after all executions
    await client.closePreparedStatement(prepared.handle)
    console.log("  Prepared statement closed")
  } catch (error) {
    console.log("  Query failed (expected if table doesn't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

main().catch(console.error)

/**
 * Prepared statements example.
 *
 * Demonstrates creating, executing, and closing prepared statements
 * for parameterised queries, including parameter binding with Arrow IPC format.
 *
 * @example
 * ```bash
 * bun run examples/prepared-statements.ts
 * ```
 */
import {
  type RecordBatch,
  RecordBatchStreamWriter,
  tableFromArrays,
  tableFromIPC
} from "apache-arrow"

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
    // Example 1: Basic prepared statement without parameters
    console.log("\n--- Example 1: Basic Prepared Statement ---")
    await basicPreparedStatement(client, handles)

    // Example 2: Prepared statement with parameter binding
    console.log("\n--- Example 2: Parameter Binding ---")
    await preparedStatementWithBinding(client, handles)

    // Example 3: Prepared update with parameters
    console.log("\n--- Example 3: Prepared Update with Parameters ---")
    await preparedUpdateWithBinding(client, handles)

    // Example 4: Prepared statement within a transaction
    console.log("\n--- Example 4: Prepared Statement in Transaction ---")
    await preparedStatementInTransaction(client, handles)
  } finally {
    // Always close prepared statements to release server resources
    console.log("\n--- Cleanup: Closing Prepared Statements ---")
    for (const handle of handles) {
      await client.closePreparedStatement(handle)
      console.log("  Closed:", `${handle.toString("hex").slice(0, 16)}...`)
    }

    client.close()
    console.log("\nConnection closed")
  }
}

async function basicPreparedStatement(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>,
  handles: Buffer[]
): Promise<void> {
  // Create a simple prepared statement
  console.log("1. Creating prepared statement...")
  const prepared = await client.createPreparedStatement("SELECT * FROM users LIMIT 10")
  handles.push(prepared.handle)

  console.log("   Handle:", `${prepared.handle.toString("hex").slice(0, 16)}...`)
  console.log("   Dataset schema length:", prepared.datasetSchema.length, "bytes")

  // Execute without parameters
  console.log("2. Executing prepared query...")
  const info = await client.executePreparedQuery(prepared.handle)

  console.log("   Total records:", info.totalRecords)
  console.log("   Endpoints:", info.endpoint.length)

  // Fetch results
  const table = await flightInfoToTable(client, info)
  console.log("   Returned rows:", table.numRows)
}

async function preparedStatementWithBinding(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>,
  handles: Buffer[]
): Promise<void> {
  // Create a prepared statement with parameters
  console.log("1. Creating parameterised prepared statement...")
  const prepared = await client.createPreparedStatement(
    "SELECT * FROM users WHERE department = ? AND active = ?"
  )
  handles.push(prepared.handle)

  // Inspect the parameter schema returned by the server
  if (prepared.parameterSchema.length > 0) {
    const paramSchema = tableFromIPC(prepared.parameterSchema).schema
    console.log("   Parameter schema fields:")
    for (const field of paramSchema.fields) {
      console.log(`     - ${field.name}: ${String(field.type)}`)
    }
  }

  // Build parameter values as an Arrow RecordBatch
  console.log("2. Building parameter values...")
  const parameterData = await buildParameterBatch({ department: "Engineering", active: true })
  console.log("   Schema bytes:", parameterData.schema.length)
  console.log("   Data bytes:", parameterData.data.length)

  // Bind parameters to the prepared statement
  console.log("3. Binding parameters...")
  const bindResult = await client.bindParameters(prepared.handle, parameterData)
  if (bindResult.handle) {
    console.log(
      "   Bind successful, handle:",
      `${bindResult.handle.toString("hex").slice(0, 16)}...`
    )
  } else {
    console.log("   Bind successful")
  }

  // Execute with bound parameters
  console.log("4. Executing with parameters...")
  const info = await client.executePreparedQuery(prepared.handle)

  const table = await flightInfoToTable(client, info)
  console.log("   Returned rows:", table.numRows)

  // Re-execute with different parameter values
  console.log("5. Re-binding with different values...")
  const newParams = await buildParameterBatch({ department: "Sales", active: false })
  await client.bindParameters(prepared.handle, newParams)

  const newInfo = await client.executePreparedQuery(prepared.handle)
  const newTable = await flightInfoToTable(client, newInfo)
  console.log("   Returned rows with new params:", newTable.numRows)
}

async function preparedUpdateWithBinding(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>,
  handles: Buffer[]
): Promise<void> {
  // Create a prepared update statement
  console.log("1. Creating prepared update statement...")
  const prepared = await client.createPreparedStatement("UPDATE users SET active = ? WHERE id = ?")
  handles.push(prepared.handle)

  // Build parameters for update
  console.log("2. Building update parameters...")
  const parameterData = await buildUpdateParameterBatch({ active: false, id: 42 })

  // Bind and execute
  console.log("3. Binding and executing update...")
  await client.bindParameters(prepared.handle, parameterData)
  const result = await client.executePreparedUpdate(prepared.handle)
  console.log("   Rows affected:", result.recordCount)
}

async function preparedStatementInTransaction(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>,
  handles: Buffer[]
): Promise<void> {
  // Begin a transaction
  console.log("1. Beginning transaction...")
  const txn = await client.beginTransaction()

  try {
    // Create a prepared statement bound to the transaction
    // The transactionId ensures all executions use this transaction
    console.log("2. Creating prepared statement in transaction...")
    const prepared = await client.createPreparedStatement(
      "INSERT INTO audit_log (action, user_id) VALUES (?, ?)",
      { transactionId: txn.transactionId }
    )
    handles.push(prepared.handle)

    // Execute multiple times with different parameters
    console.log("3. Executing prepared statement multiple times...")
    const actions = [
      { action: "login", userId: 1 },
      { action: "view_page", userId: 1 },
      { action: "logout", userId: 1 }
    ]

    for (const params of actions) {
      const parameterData = await buildAuditParameterBatch(params)
      await client.bindParameters(prepared.handle, parameterData)
      const result = await client.executePreparedUpdate(prepared.handle)
      console.log(`   ${params.action}: affected ${String(result.recordCount)} row(s)`)
    }

    // Commit all inserts atomically
    console.log("4. Committing transaction...")
    await client.commit(txn.transactionId)
    console.log("   All audit entries committed")
  } catch (error) {
    console.log("   Error occurred, rolling back...")
    await client.rollback(txn.transactionId)
    throw error
  }
}

/**
 * Builds an Arrow IPC record batch for audit log parameters.
 */
async function buildAuditParameterBatch(params: { action: string; userId: number }): Promise<{
  schema: Uint8Array
  data: Uint8Array
}> {
  const table = tableFromArrays({
    action: [params.action],
    user_id: [params.userId]
  })

  return recordBatchToIPC(table.batches[0])
}

/**
 * Builds an Arrow IPC record batch for query parameters.
 *
 * This demonstrates how to create parameter data in the format
 * required by Flight SQL's bindParameters method.
 */
async function buildParameterBatch(params: { department: string; active: boolean }): Promise<{
  schema: Uint8Array
  data: Uint8Array
}> {
  // Create a table from the parameter values
  const table = tableFromArrays({
    department: [params.department],
    active: [params.active]
  })

  // Get the first (and only) batch
  const batch = table.batches[0]

  // Serialise to Arrow IPC format
  return recordBatchToIPC(batch)
}

/**
 * Builds an Arrow IPC record batch for update parameters.
 */
async function buildUpdateParameterBatch(params: { active: boolean; id: number }): Promise<{
  schema: Uint8Array
  data: Uint8Array
}> {
  // Create a table from the parameter values
  const table = tableFromArrays({
    active: [params.active],
    id: [params.id]
  })

  // Get the first (and only) batch
  const batch = table.batches[0]

  return recordBatchToIPC(batch)
}

/**
 * Converts a RecordBatch to Arrow IPC format, separating schema and data.
 *
 * Flight SQL expects parameters as:
 * - schema: The Arrow schema in IPC format
 * - data: The record batch data in IPC stream format
 */
async function recordBatchToIPC(
  batch: RecordBatch
): Promise<{ schema: Uint8Array; data: Uint8Array }> {
  // Create an IPC stream writer
  const writer = RecordBatchStreamWriter.writeAll([batch])
  const fullBuffer = await writer.toUint8Array()

  // The IPC stream format includes the schema followed by record batches
  // For Flight SQL, we need to provide them separately
  // Schema message starts after the magic bytes and includes the schema
  const schemaWriter = RecordBatchStreamWriter.writeAll([])
  schemaWriter.reset(undefined, batch.schema)
  const schemaBuffer = await schemaWriter.toUint8Array()

  return {
    schema: schemaBuffer,
    data: fullBuffer
  }
}

main().catch(console.error)

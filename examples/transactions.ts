/**
 * Transaction handling example.
 *
 * Demonstrates beginning, committing, and rolling back transactions
 * for atomic operations.
 *
 * @example
 * ```bash
 * bun run examples/transactions.ts
 * ```
 */
import { createFlightSqlClient, queryToTable } from "../src/index.js"

async function main(): Promise<void> {
  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server")

  try {
    // Example 1: Successful transaction
    console.log("\n--- Example 1: Successful Transaction ---")
    await successfulTransaction(client)

    // Example 2: Transaction with rollback
    console.log("\n--- Example 2: Transaction with Rollback ---")
    await transactionWithRollback(client)

    // Example 3: Queries within a transaction
    console.log("\n--- Example 3: Queries Within Transaction ---")
    await queriesWithinTransaction(client)
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

async function successfulTransaction(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  // Begin a new transaction
  console.log("1. Beginning transaction...")
  const txn = await client.beginTransaction()
  console.log("   Transaction ID:", `${txn.transactionId.toString("hex").slice(0, 16)}...`)

  try {
    // Execute multiple operations within the transaction
    console.log("2. Executing operations...")

    const result1 = await client.executeUpdate(
      "INSERT INTO orders (user_id, amount) VALUES (1, 100.00)",
      { transactionId: txn.transactionId }
    )
    console.log("   Insert: affected", result1.recordCount, "rows")

    const result2 = await client.executeUpdate(
      "UPDATE accounts SET balance = balance - 100.00 WHERE user_id = 1",
      { transactionId: txn.transactionId }
    )
    console.log("   Update: affected", result2.recordCount, "rows")

    // Commit the transaction
    console.log("3. Committing transaction...")
    await client.commit(txn.transactionId)
    console.log("   Transaction committed successfully!")
  } catch (error) {
    // Rollback on any error
    console.log("   Error occurred, rolling back...")
    await client.rollback(txn.transactionId)
    throw error
  }
}

async function transactionWithRollback(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  console.log("1. Beginning transaction...")
  const txn = await client.beginTransaction()

  try {
    // First operation succeeds
    console.log("2. Executing first operation...")
    const result1 = await client.executeUpdate("INSERT INTO audit_log (action) VALUES ('test')", {
      transactionId: txn.transactionId
    })
    console.log("   Insert: affected", result1.recordCount, "rows")

    // Simulate an error condition
    console.log("3. Simulating error...")
    throw new Error("Simulated business logic error")
  } catch (error) {
    // Rollback the transaction
    console.log("4. Rolling back transaction...")
    await client.rollback(txn.transactionId)
    console.log("   Transaction rolled back - no changes persisted")

    // In a real application, you might rethrow or handle the error
    console.log("   Original error:", error instanceof Error ? error.message : error)
  }
}

async function queriesWithinTransaction(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  // Transactions can include SELECT queries to read uncommitted changes
  console.log("1. Beginning transaction...")
  const txn = await client.beginTransaction()

  try {
    // Insert a new record
    console.log("2. Inserting record...")
    await client.executeUpdate(
      "INSERT INTO users (id, name, active) VALUES (999, 'Pending User', true)",
      { transactionId: txn.transactionId }
    )

    // Query within the same transaction to see uncommitted changes
    // queryToTable supports transactionId via options
    console.log("3. Querying uncommitted changes...")
    const table = await queryToTable(client, "SELECT * FROM users WHERE id = 999", {
      transactionId: txn.transactionId
    })
    console.log("   Found rows (uncommitted):", table.numRows)

    // Decide whether to commit based on query results
    if (table.numRows > 0) {
      console.log("4. Committing transaction...")
      await client.commit(txn.transactionId)
      console.log("   Changes committed")
    } else {
      console.log("4. Rolling back (unexpected result)...")
      await client.rollback(txn.transactionId)
    }
  } catch (error) {
    await client.rollback(txn.transactionId)
    throw error
  }
}

main().catch(console.error)

/**
 * Transaction support example.
 *
 * Demonstrates beginning, committing, and rolling back transactions
 * for atomic database operations.
 *
 * @example
 * ```bash
 * bun run examples/transactions.ts
 * ```
 */
import { createFlightSqlClient, queryToTable } from "../src/index.js"

async function main(): Promise<void> {
  console.log("=== Transaction Examples ===\n")

  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server\n")

  try {
    // Example 1: Basic transaction with commit
    console.log("--- Example 1: Transaction with Commit ---")
    await basicTransactionCommit(client)

    // Example 2: Transaction with rollback
    console.log("\n--- Example 2: Transaction with Rollback ---")
    await transactionRollback(client)

    // Example 3: Multiple operations in a transaction
    console.log("\n--- Example 3: Multiple Operations ---")
    await multipleOperations(client)

    // Example 4: Error handling pattern
    console.log("\n--- Example 4: Error Handling Pattern ---")
    await errorHandlingPattern(client)
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

async function basicTransactionCommit(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Begin a new transaction
    const txn = await client.beginTransaction()
    console.log("  Transaction started")

    // Execute an update within the transaction
    const result = await client.executeUpdate(
      "INSERT INTO users (name, email, active) VALUES ('Alice', 'alice@example.com', true)",
      { transactionId: txn.transactionId }
    )
    console.log("  Rows inserted:", result.recordCount)

    // Commit the transaction to make changes permanent
    await client.commit(txn.transactionId)
    console.log("  Transaction committed")
  } catch (error) {
    console.log("  Transaction failed (expected if server doesn't support transactions)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function transactionRollback(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Begin a transaction
    const txn = await client.beginTransaction()
    console.log("  Transaction started")

    // Make some changes
    await client.executeUpdate("DELETE FROM users WHERE id = 999", {
      transactionId: txn.transactionId
    })
    console.log("  Delete executed (not committed)")

    // Rollback to undo the changes
    await client.rollback(txn.transactionId)
    console.log("  Transaction rolled back - changes discarded")
  } catch (error) {
    console.log("  Transaction failed (expected if server doesn't support transactions)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function multipleOperations(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Begin a transaction
    const txn = await client.beginTransaction()
    console.log("  Transaction started")

    // Operation 1: Insert a new user
    const insertResult = await client.executeUpdate(
      "INSERT INTO users (name, email, active) VALUES ('Bob', 'bob@example.com', true)",
      { transactionId: txn.transactionId }
    )
    console.log("  Insert:", insertResult.recordCount, "row(s)")

    // Operation 2: Update related records
    const updateResult = await client.executeUpdate(
      "UPDATE accounts SET balance = 100.00 WHERE user_email = 'bob@example.com'",
      { transactionId: txn.transactionId }
    )
    console.log("  Update:", updateResult.recordCount, "row(s)")

    // Operation 3: Query within the transaction (see uncommitted data)
    const table = await queryToTable(
      client,
      "SELECT * FROM users WHERE email = 'bob@example.com'",
      { transactionId: txn.transactionId }
    )
    console.log("  Uncommitted rows visible:", table.numRows)

    // Commit all operations atomically
    await client.commit(txn.transactionId)
    console.log("  All operations committed")
  } catch (error) {
    console.log("  Operations failed (expected if tables don't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function errorHandlingPattern(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  let txn: Awaited<ReturnType<typeof client.beginTransaction>> | undefined

  try {
    // Begin transaction
    txn = await client.beginTransaction()
    console.log("  Transaction started")

    // Perform operations that might fail
    await client.executeUpdate("INSERT INTO orders (user_id, total) VALUES (1, 99.99)", {
      transactionId: txn.transactionId
    })
    console.log("  Order created")

    await client.executeUpdate(
      "UPDATE inventory SET quantity = quantity - 1 WHERE product_id = 42",
      { transactionId: txn.transactionId }
    )
    console.log("  Inventory updated")

    await client.executeUpdate("UPDATE accounts SET balance = balance - 99.99 WHERE user_id = 1", {
      transactionId: txn.transactionId
    })
    console.log("  Account charged")

    // All succeeded - commit
    await client.commit(txn.transactionId)
    console.log("  Transaction committed successfully")
  } catch (error) {
    // Something failed - rollback if transaction was started
    if (txn !== undefined) {
      try {
        await client.rollback(txn.transactionId)
        console.log("  Transaction rolled back due to error")
      } catch (rollbackError) {
        console.log(
          "  Rollback also failed:",
          rollbackError instanceof Error ? rollbackError.message : rollbackError
        )
      }
    }
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

main().catch(console.error)

/**
 * Update operations example.
 *
 * Demonstrates executing INSERT, UPDATE, and DELETE statements
 * that modify data in the database.
 *
 * @example
 * ```bash
 * bun run examples/updates.ts
 * ```
 */
import { createFlightSqlClient } from "../src/index.js"

async function main(): Promise<void> {
  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server")

  try {
    // Example 1: INSERT statement
    console.log("\n--- Example 1: INSERT ---")
    const insertResult = await client.executeUpdate(
      "INSERT INTO users (name, email, active) VALUES ('Alice', 'alice@example.com', true)"
    )
    console.log("  Rows inserted:", insertResult.recordCount)

    // Example 2: UPDATE statement
    console.log("\n--- Example 2: UPDATE ---")
    const updateResult = await client.executeUpdate(
      "UPDATE users SET active = false WHERE last_login < '2024-01-01'"
    )
    console.log("  Rows updated:", updateResult.recordCount)

    // Example 3: DELETE statement
    console.log("\n--- Example 3: DELETE ---")
    const deleteResult = await client.executeUpdate("DELETE FROM users WHERE id = 42")
    console.log("  Rows deleted:", deleteResult.recordCount)

    // Example 4: Multiple inserts with different data
    console.log("\n--- Example 4: Batch Inserts ---")
    const names = ["Bob", "Carol", "Dave"]
    let totalInserted = 0n

    for (const name of names) {
      const result = await client.executeUpdate(
        `INSERT INTO users (name, email, active) VALUES ('${name}', '${name.toLowerCase()}@example.com', true)`
      )
      totalInserted += BigInt(result.recordCount)
    }
    console.log("  Total rows inserted:", String(totalInserted))

    // Example 5: Using call options
    console.log("\n--- Example 5: With Call Options ---")
    const resultWithOptions = await client.executeUpdate(
      "INSERT INTO audit_log (action, timestamp) VALUES ('example', NOW())",
      {
        timeoutMs: 5000,
        headers: { "x-request-id": "example-123" }
      }
    )
    console.log("  Rows affected:", resultWithOptions.recordCount)
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

main().catch(console.error)

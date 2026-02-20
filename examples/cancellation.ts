/**
 * Query cancellation example.
 *
 * Demonstrates cancelling long-running queries before they complete.
 *
 * @example
 * ```bash
 * bun run examples/cancellation.ts
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
    // Start a potentially long-running query
    // In a real scenario, this might be a complex query on a large dataset
    console.log("\n--- Starting Query ---")
    const info = await client.query("SELECT * FROM large_table")

    console.log("  Query started")
    console.log("  Total records:", String(info.totalRecords))
    console.log("  Endpoints:", info.endpoint.length)

    // Cancel the query before fetching all results
    // This is useful when:
    // - User requests cancellation
    // - Timeout is reached
    // - Application is shutting down
    console.log("\n--- Cancelling Query ---")
    const result = await client.cancelFlightInfo(info)

    // Check the cancellation result
    switch (result) {
      case "cancelled": {
        console.log("  Query cancelled successfully")
        console.log("  No further data will be fetched")
        break
      }
      case "cancelling": {
        console.log("  Cancellation in progress")
        console.log("  Server is still processing the cancellation request")
        break
      }
      case "not-cancellable": {
        console.log("  Query cannot be cancelled")
        console.log("  Server does not support cancellation for this query")
        break
      }
      case "unspecified": {
        console.log("  Cancellation status unspecified")
        break
      }
    }

    // Note: After cancellation, attempting to fetch results may fail
    // or return partial data depending on the server implementation
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

main().catch(console.error)

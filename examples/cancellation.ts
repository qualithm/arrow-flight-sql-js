/**
 * Query cancellation example.
 *
 * Demonstrates cancelling long-running queries using the
 * CancelFlightInfo action.
 *
 * @example
 * ```bash
 * bun run examples/cancellation.ts
 * ```
 */
import { createFlightSqlClient } from "../src/index.js"

async function main(): Promise<void> {
  console.log("=== Query Cancellation Examples ===\n")

  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server\n")

  try {
    // Example 1: Basic cancellation
    console.log("--- Example 1: Basic Cancellation ---")
    await basicCancellation(client)

    // Example 2: Concurrent query with cancellation
    console.log("\n--- Example 2: Concurrent Query Cancellation ---")
    await concurrentCancellation(client)
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

async function basicCancellation(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Start a query (but don't fetch results yet)
    const info = await client.query("SELECT * FROM large_table")
    console.log("  Query started, FlightInfo received")
    console.log("  Endpoints:", info.endpoint.length)

    // Cancel the query before fetching results
    const status = await client.cancelFlightInfo(info)
    console.log("  Cancel status:", status)

    // Status values:
    // - "unspecified": Status unknown
    // - "cancelled": Successfully cancelled
    // - "cancelling": Cancellation in progress
    // - "not_cancellable": Query cannot be cancelled
  } catch (error) {
    console.log("  Cancellation failed (server may not support cancellation)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function concurrentCancellation(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Start multiple queries
    const queries = ["SELECT * FROM users", "SELECT * FROM orders", "SELECT * FROM products"]

    console.log("  Starting", queries.length, "concurrent queries")

    const flightInfos = await Promise.all(
      queries.map(async (query, index) => {
        const info = await client.query(query)
        console.log(`  Query ${String(index + 1)} started`)
        return { index, info }
      })
    )

    // Cancel the second query
    const toCancel = flightInfos[1]
    console.log("  Cancelling query 2...")
    const status = await client.cancelFlightInfo(toCancel.info)
    console.log("  Query 2 cancel status:", status)

    // Fetch results from non-cancelled queries
    for (const { index, info } of flightInfos) {
      if (index === 1) {
        console.log(`  Query ${String(index + 1)}: skipped (cancelled)`)
        continue
      }

      const totalChunks = await fetchEndpoints(client, info.endpoint)
      console.log(`  Query ${String(index + 1)}: fetched ${String(totalChunks)} chunks`)
    }
  } catch (error) {
    console.log("  Concurrent queries failed (expected if tables don't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function fetchEndpoints(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>,
  endpoints: { ticket?: { ticket: Buffer } }[]
): Promise<number> {
  let totalChunks = 0
  for (const endpoint of endpoints) {
    if (endpoint.ticket) {
      for await (const _data of client.doGet(endpoint.ticket)) {
        totalChunks++
      }
    }
  }
  return totalChunks
}

main().catch(console.error)

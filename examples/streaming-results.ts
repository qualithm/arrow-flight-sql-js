/**
 * Streaming results example.
 *
 * Demonstrates processing large result sets without loading
 * everything into memory at once.
 *
 * @example
 * ```bash
 * bun run examples/streaming-results.ts
 * ```
 */
import { createFlightSqlClient, iterateResults } from "../src/index.js"

async function main(): Promise<void> {
  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server")

  try {
    // Get flight info first (useful for inspection)
    const info = await client.query("SELECT * FROM large_table")

    console.log("\nFlight Info:")
    console.log(`  Total records: ${String(info.totalRecords)}`)
    console.log(`  Total bytes: ${String(info.totalBytes)}`)
    console.log(`  Endpoints: ${String(info.endpoint.length)}`)

    // Option 1: Stream results batch by batch
    console.log("\nStreaming results:")
    let batchCount = 0
    let totalBytes = 0

    for await (const data of iterateResults(client, info)) {
      batchCount++
      totalBytes += data.dataBody.length

      // Process each batch without holding all data in memory
      console.log(`  Batch ${String(batchCount)}: ${String(data.dataBody.length)} bytes`)
    }

    console.log(`\nTotal: ${String(batchCount)} batches, ${String(totalBytes)} bytes`)

    // Option 2: If you need the full table, use flightInfoToTable
    // (This loads everything into memory)
    // const table = await flightInfoToTable(client, info)
  } finally {
    client.close()
  }
}

main().catch(console.error)

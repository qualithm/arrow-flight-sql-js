/**
 * Streaming results example.
 *
 * Demonstrates processing large result sets without loading
 * everything into memory at once, and fetching individual endpoints.
 *
 * @example
 * ```bash
 * bun run examples/streaming-results.ts
 * ```
 */
import { createFlightSqlClient, iterateResults, ticketToTable } from "../src/index.js"

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
    console.log("\n--- Option 1: Stream by Batch ---")
    let batchCount = 0
    let totalBytes = 0

    for await (const data of iterateResults(client, info)) {
      batchCount++
      totalBytes += data.dataBody.length

      // Process each batch without holding all data in memory
      console.log(`  Batch ${String(batchCount)}: ${String(data.dataBody.length)} bytes`)
    }

    console.log(`  Total: ${String(batchCount)} batches, ${String(totalBytes)} bytes`)

    // Option 2: Fetch individual endpoints using ticketToTable
    // This is useful when endpoints are distributed across multiple servers
    // or when you want to process specific partitions
    console.log("\n--- Option 2: Fetch Individual Endpoints ---")
    for (let i = 0; i < info.endpoint.length; i++) {
      const endpoint = info.endpoint[i]

      if (endpoint.ticket) {
        console.log(`  Endpoint ${String(i + 1)}:`)

        // Log endpoint locations (where data can be fetched from)
        if (endpoint.location.length > 0) {
          console.log(`    Locations: ${endpoint.location.map((loc) => loc.uri).join(", ")}`)
        } else {
          console.log("    Location: current server")
        }

        // Fetch this endpoint's data as a table
        const table = await ticketToTable(client, endpoint.ticket)
        console.log(`    Rows: ${String(table.numRows)}`)
        console.log(`    Columns: ${table.schema.fields.map((f) => f.name).join(", ")}`)

        // Process the table data
        if (table.numRows > 0) {
          // Show first row as sample
          const firstRow = table.get(0)
          console.log(`    First row: ${JSON.stringify(firstRow)}`)
        }
      }
    }

    // Option 3: Parallel endpoint fetching for distributed queries
    // When endpoints are on different servers, fetch in parallel
    console.log("\n--- Option 3: Parallel Endpoint Fetching ---")
    const ticketsToFetch = info.endpoint
      .filter(
        (ep): ep is typeof ep & { ticket: NonNullable<typeof ep.ticket> } => ep.ticket !== undefined
      )
      .map((ep) => ep.ticket)

    if (ticketsToFetch.length > 1) {
      console.log(`  Fetching ${String(ticketsToFetch.length)} endpoints in parallel...`)

      const tables = await Promise.all(
        ticketsToFetch.map(async (ticket) => ticketToTable(client, ticket))
      )

      let totalRows = 0
      for (const table of tables) {
        totalRows += table.numRows
      }
      console.log(`  Total rows from all endpoints: ${String(totalRows)}`)
    } else {
      console.log("  Only one endpoint, parallel fetch not needed")
    }

    // Note: For very large datasets, prefer iterateResults to avoid memory issues
    // const table = await flightInfoToTable(client, info) // Loads everything into memory
  } finally {
    client.close()
  }
}

main().catch(console.error)

/**
 * Database metadata queries example.
 *
 * Demonstrates querying database metadata: catalogs, schemas,
 * tables, columns, keys, and server capabilities.
 *
 * @example
 * ```bash
 * bun run examples/metadata-queries.ts
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

  try {
    // List catalogs
    console.log("\n--- Catalogs ---")
    const catalogInfo = await client.getCatalogs()
    const catalogs = await flightInfoToTable(client, catalogInfo)
    for (const row of catalogs) {
      console.log(`  ${JSON.stringify(row)}`)
    }

    // List schemas (optionally filtered by catalog)
    console.log("\n--- Schemas ---")
    const schemaInfo = await client.getDbSchemas({
      // catalog: "my_catalog"  // Optional filter
    })
    const schemas = await flightInfoToTable(client, schemaInfo)
    for (const row of schemas) {
      console.log(`  ${JSON.stringify(row)}`)
    }

    // List tables with filtering
    console.log("\n--- Tables ---")
    const tableInfo = await client.getTables({
      // catalog: "my_catalog",
      // dbSchemaFilterPattern: "public",
      // tableNameFilterPattern: "user%",
      tableTypes: ["TABLE", "VIEW"],
      includeSchema: false // Set to true to include Arrow schema
    })
    const tables = await flightInfoToTable(client, tableInfo)
    for (const row of tables) {
      console.log(`  ${JSON.stringify(row)}`)
    }

    // Get table types (e.g., TABLE, VIEW, SYSTEM TABLE)
    console.log("\n--- Table Types ---")
    const typeInfo = await client.getTableTypes()
    const types = await flightInfoToTable(client, typeInfo)
    for (const row of types) {
      console.log(`  ${JSON.stringify(row)}`)
    }

    // Get primary keys for a table
    console.log("\n--- Primary Keys (users table) ---")
    try {
      const pkInfo = await client.getPrimaryKeys("users", {
        // catalog: "my_catalog",
        // dbSchema: "public"
      })
      const pks = await flightInfoToTable(client, pkInfo)
      for (const row of pks) {
        console.log(`  ${JSON.stringify(row)}`)
      }
    } catch {
      console.log("  (table not found or no primary keys)")
    }

    // Get exported keys (foreign keys referencing this table)
    console.log("\n--- Exported Keys (users table) ---")
    try {
      const exportedInfo = await client.getExportedKeys("users")
      const exported = await flightInfoToTable(client, exportedInfo)
      for (const row of exported) {
        console.log(`  ${JSON.stringify(row)}`)
      }
    } catch {
      console.log("  (table not found or no foreign keys)")
    }

    // Get imported keys (foreign keys from this table)
    console.log("\n--- Imported Keys (orders table) ---")
    try {
      const importedInfo = await client.getImportedKeys("orders")
      const imported = await flightInfoToTable(client, importedInfo)
      for (const row of imported) {
        console.log(`  ${JSON.stringify(row)}`)
      }
    } catch {
      console.log("  (table not found or no foreign keys)")
    }

    // Get SQL info (server capabilities)
    console.log("\n--- SQL Info ---")
    const sqlInfo = await client.getSqlInfo()
    const info = await flightInfoToTable(client, sqlInfo)
    console.log("  Total info entries:", info.numRows)
    // Display first few entries
    let count = 0
    for (const row of info) {
      if (count++ >= 5) {
        console.log("  ... and", info.numRows - 5, "more")
        break
      }
      console.log(`  ${JSON.stringify(row)}`)
    }

    // Get supported data types
    console.log("\n--- XDBC Type Info ---")
    const xdbcInfo = await client.getXdbcTypeInfo()
    const xdbc = await flightInfoToTable(client, xdbcInfo)
    console.log("  Supported types:", xdbc.numRows)
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

main().catch(console.error)

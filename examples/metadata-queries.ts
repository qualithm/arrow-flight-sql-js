/**
 * Metadata queries example.
 *
 * Demonstrates querying database metadata: catalogs, schemas, tables,
 * keys, SQL capabilities, and data types.
 *
 * @example
 * ```bash
 * bun run examples/metadata-queries.ts
 * ```
 */
import { createFlightSqlClient, flightInfoToTable } from "../src/index.js"

/** Helper to safely get a string property from a row */
function getString(row: unknown, key: string): string | undefined {
  const obj = row as Record<string, unknown>
  const value = obj[key]
  return typeof value === "string" ? value : undefined
}

/** Helper to safely get a number property from a row */
function getNumber(row: unknown, key: string): number | undefined {
  const obj = row as Record<string, unknown>
  const value = obj[key]
  return typeof value === "number" ? value : undefined
}

async function main(): Promise<void> {
  console.log("=== Metadata Query Examples ===\n")

  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server\n")

  try {
    // Example 1: List catalogs
    console.log("--- Example 1: Catalogs ---")
    await listCatalogs(client)

    // Example 2: List database schemas
    console.log("\n--- Example 2: Database Schemas ---")
    await listDbSchemas(client)

    // Example 3: List tables
    console.log("\n--- Example 3: Tables ---")
    await listTables(client)

    // Example 4: List table types
    console.log("\n--- Example 4: Table Types ---")
    await listTableTypes(client)

    // Example 5: Get primary keys
    console.log("\n--- Example 5: Primary Keys ---")
    await getPrimaryKeys(client)

    // Example 6: Get foreign keys
    console.log("\n--- Example 6: Foreign Keys ---")
    await getForeignKeys(client)

    // Example 7: SQL info
    console.log("\n--- Example 7: SQL Info ---")
    await getSqlInfo(client)

    // Example 8: Type info
    console.log("\n--- Example 8: Type Info ---")
    await getTypeInfo(client)
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

async function listCatalogs(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    const info = await client.getCatalogs()
    const table = await flightInfoToTable(client, info)

    console.log("  Catalogs found:", table.numRows)
    for (const row of table) {
      const catalogName = getString(row, "catalog_name")
      console.log("    -", catalogName ?? "(unnamed)")
    }
  } catch (error) {
    console.log("  Failed to get catalogs")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function listDbSchemas(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Get all schemas
    const info = await client.getDbSchemas()
    const table = await flightInfoToTable(client, info)

    console.log("  Schemas found:", table.numRows)
    for (const row of table) {
      const catalogName = getString(row, "catalog_name")
      const schemaName = getString(row, "db_schema_name")
      console.log(`    - ${catalogName ?? ""}.${schemaName ?? "(unnamed)"}`)
    }
  } catch (error) {
    console.log("  Failed to get schemas")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function listTables(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Get all tables with schema information
    const info = await client.getTables({ includeSchema: true })
    const table = await flightInfoToTable(client, info)

    console.log("  Tables found:", table.numRows)
    for (const row of table) {
      const catalogName = getString(row, "catalog_name")
      const schemaName = getString(row, "db_schema_name")
      const tableName = getString(row, "table_name")
      const tableType = getString(row, "table_type")
      console.log(
        `    - ${catalogName ?? ""}.${schemaName ?? ""}.${tableName ?? "(unnamed)"} (${tableType ?? "unknown"})`
      )
    }
  } catch (error) {
    console.log("  Failed to get tables")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function listTableTypes(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    const info = await client.getTableTypes()
    const table = await flightInfoToTable(client, info)

    console.log("  Table types supported:", table.numRows)
    for (const row of table) {
      const tableType = getString(row, "table_type")
      console.log("    -", tableType ?? "(unknown)")
    }
  } catch (error) {
    console.log("  Failed to get table types")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function getPrimaryKeys(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Get primary keys for a specific table
    const info = await client.getPrimaryKeys("users", {
      dbSchema: "public"
    })
    const table = await flightInfoToTable(client, info)

    console.log("  Primary key columns:", table.numRows)
    for (const row of table) {
      const columnName = getString(row, "column_name")
      const keySeq = getNumber(row, "key_sequence")
      console.log(`    - ${columnName ?? "(unnamed)"} (sequence: ${String(keySeq ?? 0)})`)
    }
  } catch (error) {
    console.log("  Failed to get primary keys (expected if table doesn't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function getForeignKeys(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Get imported keys (foreign keys in this table referencing other tables)
    console.log("  Imported keys (foreign keys in 'orders'):")
    const importedInfo = await client.getImportedKeys("orders", {
      dbSchema: "public"
    })
    const importedTable = await flightInfoToTable(client, importedInfo)

    for (const row of importedTable) {
      const fkColumn = getString(row, "fk_column_name")
      const pkTable = getString(row, "pk_table_name")
      const pkColumn = getString(row, "pk_column_name")
      console.log(`    - ${fkColumn ?? ""} -> ${pkTable ?? ""}.${pkColumn ?? ""}`)
    }

    // Get exported keys (foreign keys in other tables referencing this table)
    console.log("  Exported keys (other tables referencing 'users'):")
    const exportedInfo = await client.getExportedKeys("users", {
      dbSchema: "public"
    })
    const exportedTable = await flightInfoToTable(client, exportedInfo)

    for (const row of exportedTable) {
      const fkTable = getString(row, "fk_table_name")
      const fkColumn = getString(row, "fk_column_name")
      const pkColumn = getString(row, "pk_column_name")
      console.log(`    - ${fkTable ?? ""}.${fkColumn ?? ""} -> ${pkColumn ?? ""}`)
    }
  } catch (error) {
    console.log("  Failed to get foreign keys (expected if tables don't exist)")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function getSqlInfo(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Get all SQL info
    const info = await client.getSqlInfo()
    const table = await flightInfoToTable(client, info)

    console.log("  SQL info entries:", table.numRows)

    // Common SqlInfo codes (from Flight SQL spec)
    const sqlInfoNames: Record<number, string> = {
      0: "FLIGHT_SQL_SERVER_NAME",
      1: "FLIGHT_SQL_SERVER_VERSION",
      2: "FLIGHT_SQL_SERVER_ARROW_VERSION",
      3: "FLIGHT_SQL_SERVER_READ_ONLY",
      500: "SQL_DDL_CATALOG",
      501: "SQL_DDL_SCHEMA",
      502: "SQL_DDL_TABLE"
    }

    for (const row of table) {
      const infoCode = getNumber(row, "info_name")
      const infoName =
        infoCode !== undefined ? (sqlInfoNames[infoCode] ?? `INFO_${String(infoCode)}`) : "unknown"
      console.log(`    - ${infoName}`)
    }
  } catch (error) {
    console.log("  Failed to get SQL info")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

async function getTypeInfo(
  client: Awaited<ReturnType<typeof createFlightSqlClient>>
): Promise<void> {
  try {
    // Get all supported data types
    const info = await client.getXdbcTypeInfo()
    const table = await flightInfoToTable(client, info)

    console.log("  Data types supported:", table.numRows)

    // Show first 5 types
    let count = 0
    for (const row of table) {
      if (count >= 5) {
        console.log(`    ... and ${String(table.numRows - 5)} more`)
        break
      }
      const typeName = getString(row, "type_name")
      const dataType = getNumber(row, "data_type")
      console.log(`    - ${typeName ?? "(unknown)"} (data_type: ${String(dataType ?? "?")})`)
      count++
    }
  } catch (error) {
    console.log("  Failed to get type info")
    console.log("  Error:", error instanceof Error ? error.message : error)
  }
}

main().catch(console.error)

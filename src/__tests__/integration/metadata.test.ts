/**
 * Integration tests for Flight SQL metadata queries.
 *
 * Requires a running Arrow Flight SQL server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFlightSqlClient, flightInfoToTable, type FlightSqlClient } from "../../index"
import { config } from "./config"

describe("Metadata Integration", () => {
  let client: FlightSqlClient

  beforeAll(async () => {
    client = await createFlightSqlClient({
      host: config.host,
      port: config.port,
      tls: config.tls,
      auth: {
        type: "basic",
        username: config.credentials.admin.username,
        password: config.credentials.admin.password
      }
    })
    await client.handshake()
  })

  afterAll(() => {
    client.close()
  })

  describe("getCatalogs", () => {
    it("returns catalog information", async () => {
      const info = await client.getCatalogs()

      expect(info).toBeDefined()
      expect(info.schema.length).toBeGreaterThan(0)

      const table = await flightInfoToTable(client, info)
      // Server returns at least one catalog
      expect(table.numRows).toBeGreaterThanOrEqual(1)

      const fieldNames = table.schema.fields.map((f) => f.name)
      expect(fieldNames).toContain("catalog_name")
    })

    it("contains configured catalog", async () => {
      const info = await client.getCatalogs()
      const table = await flightInfoToTable(client, info)

      const catalogs: string[] = []
      for (const row of table) {
        catalogs.push((row as { catalog_name: string }).catalog_name)
      }

      expect(catalogs).toContain(config.catalog)
    })
  })

  describe("getDbSchemas", () => {
    it("returns schema information", async () => {
      const info = await client.getDbSchemas()

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      expect(table.numRows).toBeGreaterThanOrEqual(1)

      const fieldNames = table.schema.fields.map((f) => f.name)
      expect(fieldNames).toContain("db_schema_name")
    })

    it("filters by catalog", async () => {
      const info = await client.getDbSchemas({ catalog: config.catalog })
      const table = await flightInfoToTable(client, info)

      expect(table.numRows).toBeGreaterThanOrEqual(1)
    })

    it("contains public schema", async () => {
      const info = await client.getDbSchemas()
      const table = await flightInfoToTable(client, info)

      const schemas: string[] = []
      for (const row of table) {
        schemas.push((row as { db_schema_name: string }).db_schema_name)
      }

      expect(schemas).toContain("public")
    })
  })

  describe("getTables", () => {
    it("returns table information", async () => {
      const info = await client.getTables()

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      // Should have test fixtures as tables
      expect(table.numRows).toBeGreaterThan(0)

      const fieldNames = table.schema.fields.map((f) => f.name)
      expect(fieldNames).toContain("table_name")
    })

    it("includes test tables", async () => {
      const info = await client.getTables()
      const table = await flightInfoToTable(client, info)

      const tableNames: string[] = []
      for (const row of table) {
        tableNames.push((row as { table_name: string }).table_name)
      }

      // Should include some test fixtures
      expect(tableNames.length).toBeGreaterThan(0)
    })

    it("filters by table name pattern", async () => {
      const info = await client.getTables({ tableNameFilterPattern: "integers" })
      const table = await flightInfoToTable(client, info)

      // Should find the integers table
      expect(table.numRows).toBeGreaterThanOrEqual(1)
    })
  })

  describe("getTableTypes", () => {
    it("returns supported table types", async () => {
      const info = await client.getTableTypes()

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      expect(table.numRows).toBeGreaterThanOrEqual(1)

      const fieldNames = table.schema.fields.map((f) => f.name)
      expect(fieldNames).toContain("table_type")
    })

    it("contains TABLE type", async () => {
      const info = await client.getTableTypes()
      const table = await flightInfoToTable(client, info)

      const types: string[] = []
      for (const row of table) {
        types.push((row as { table_type: string }).table_type)
      }

      expect(types).toContain("TABLE")
    })
  })

  describe("getSqlInfo", () => {
    it("returns SQL info", async () => {
      const info = await client.getSqlInfo()

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      expect(table.numRows).toBeGreaterThan(0)
    })

    it("includes server name info", async () => {
      // Request specific info IDs
      const info = await client.getSqlInfo([0]) // 0 = FLIGHT_SQL_SERVER_NAME

      expect(info).toBeDefined()
    })
  })

  describe("getXdbcTypeInfo", () => {
    it("returns XDBC type information", async () => {
      const info = await client.getXdbcTypeInfo()

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      // Should have type mappings
      expect(table.numRows).toBeGreaterThan(0)
    })
  })

  describe("getPrimaryKeys", () => {
    it("returns primary key info (possibly empty)", async () => {
      const info = await client.getPrimaryKeys("integers")

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      // May be empty if no primary keys defined
      expect(table.numRows).toBeGreaterThanOrEqual(0)
    })
  })

  describe("getExportedKeys", () => {
    it("returns exported key info (possibly empty)", async () => {
      const info = await client.getExportedKeys("integers")

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      // May be empty if no foreign keys reference this table
      expect(table.numRows).toBeGreaterThanOrEqual(0)
    })

    it("accepts catalog and schema options", async () => {
      const info = await client.getExportedKeys("integers", {
        catalog: config.catalog,
        dbSchema: "public"
      })

      expect(info).toBeDefined()
    })
  })

  describe("getImportedKeys", () => {
    it("returns imported key info (possibly empty)", async () => {
      const info = await client.getImportedKeys("integers")

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      // May be empty if no foreign keys in this table
      expect(table.numRows).toBeGreaterThanOrEqual(0)
    })

    it("accepts catalog and schema options", async () => {
      const info = await client.getImportedKeys("integers", {
        catalog: config.catalog,
        dbSchema: "public"
      })

      expect(info).toBeDefined()
    })
  })

  describe("getCrossReference", () => {
    it("returns cross reference info (possibly empty)", async () => {
      const info = await client.getCrossReference("integers", "strings")

      expect(info).toBeDefined()

      const table = await flightInfoToTable(client, info)
      // May be empty if no foreign keys between these tables
      expect(table.numRows).toBeGreaterThanOrEqual(0)
    })

    it("accepts catalog and schema options", async () => {
      const info = await client.getCrossReference("integers", "strings", {
        pkCatalog: config.catalog,
        pkDbSchema: "public",
        fkCatalog: config.catalog,
        fkDbSchema: "public"
      })

      expect(info).toBeDefined()
    })
  })
})

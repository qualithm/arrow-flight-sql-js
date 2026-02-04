#!/usr/bin/env bun
/**
 * Debug script to test schema parsing from lakehouse server
 */
import { MessageReader, RecordBatchReader, tableFromIPC } from "apache-arrow"

import { FlightSqlClient } from "../src/client"

async function testSchemaFormat() {
  const port = parseInt(process.env.FLIGHT_SQL_PORT ?? "8815", 10)
  console.log(`Connecting to localhost:${String(port)}...`)

  const client = new FlightSqlClient({
    host: "localhost",
    port,
    auth: { type: "basic", username: "admin", password: "lakehouse" },
    connectTimeoutMs: 10_000,
    requestTimeoutMs: 30_000
  })

  await client.connect()

  // Execute a query and check what we get
  const result = await client.query("SELECT 1 as value")
  const flightInfo = result.flightInfo
  const schemaBytes = flightInfo.schema

  console.log("FlightInfo received:")
  console.log("  Schema bytes length:", schemaBytes.length)
  if (schemaBytes.length > 0) {
    console.log(
      "  Schema bytes (first 64 hex):",
      Buffer.from(schemaBytes.slice(0, 64)).toString("hex")
    )
  }
  console.log("  Endpoints:", flightInfo.endpoints.length)

  // Try different parsing methods
  if (schemaBytes.length > 0) {
    console.log("\nTrying RecordBatchReader.from():")
    try {
      const reader = RecordBatchReader.from(schemaBytes)
      console.log("  Success! Schema:", reader.schema)
    } catch (e) {
      console.log("  Failed:", (e as Error).message)
    }

    console.log("\nTrying tableFromIPC():")
    try {
      const table = tableFromIPC(schemaBytes)
      console.log("  Success! Schema:", table.schema)
    } catch (e) {
      console.log("  Failed:", (e as Error).message)
    }

    console.log("\nTrying MessageReader:")
    try {
      const msgReader = new MessageReader(schemaBytes)
      const msg = msgReader.readMessage()
      console.log("  Message type:", msg?.headerType)
      console.log("  Message:", msg)
    } catch (e) {
      console.log("  Failed:", (e as Error).message)
    }
  }

  client.close()
}

testSchemaFormat().catch(console.error)

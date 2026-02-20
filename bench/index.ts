/**
 * Benchmarks entry point.
 *
 * Run with: bun run bench
 *
 * Note: Flight SQL benchmarks require a running server.
 * These benchmarks test the serialisation overhead only.
 */

/* eslint-disable no-console */

import {
  CommandStatementQuery,
  type CommandStatementQuery as CommandStatementQueryType,
  CommandStatementUpdate,
  type CommandStatementUpdate as CommandStatementUpdateType
} from "../src/generated/arrow/flight/protocol/sql/FlightSql.js"

const ITERATIONS = 100_000

console.log("Running benchmarks...\n")

// Benchmark CommandStatementQuery encoding
const queryEncodeStart = performance.now()
for (let i = 0; i < ITERATIONS; i++) {
  const command: CommandStatementQueryType = {
    query: "SELECT * FROM users WHERE id = 123",
    transactionId: undefined
  }
  CommandStatementQuery.encode(command).finish()
}
const queryEncodeEnd = performance.now()
const queryEncodeTime = queryEncodeEnd - queryEncodeStart

console.log(`CommandStatementQuery.encode: ${ITERATIONS.toLocaleString()} iterations`)
console.log(`  Total: ${queryEncodeTime.toFixed(2)}ms`)
console.log(`  Per call: ${((queryEncodeTime / ITERATIONS) * 1000).toFixed(3)}μs`)
console.log()

// Benchmark CommandStatementUpdate encoding
const updateEncodeStart = performance.now()
for (let i = 0; i < ITERATIONS; i++) {
  const command: CommandStatementUpdateType = {
    query: "INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')",
    transactionId: undefined
  }
  CommandStatementUpdate.encode(command).finish()
}
const updateEncodeEnd = performance.now()
const updateEncodeTime = updateEncodeEnd - updateEncodeStart

console.log(`CommandStatementUpdate.encode: ${ITERATIONS.toLocaleString()} iterations`)
console.log(`  Total: ${updateEncodeTime.toFixed(2)}ms`)
console.log(`  Per call: ${((updateEncodeTime / ITERATIONS) * 1000).toFixed(3)}μs`)
console.log()

console.log("Benchmarks complete.")

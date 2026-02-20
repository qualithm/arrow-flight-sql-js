/**
 * Benchmarks entry point.
 *
 * Run with: bun run bench
 */

/* eslint-disable no-console */

import { greet } from "../src/greet"

const ITERATIONS = 100_000

console.log("Running benchmarks...\n")

// Benchmark informal greeting
const informalStart = performance.now()
for (let i = 0; i < ITERATIONS; i++) {
  greet({ name: "World" })
}
const informalEnd = performance.now()
const informalTime = informalEnd - informalStart

console.log(`greet (informal): ${ITERATIONS.toLocaleString()} iterations`)
console.log(`  Total: ${informalTime.toFixed(2)}ms`)
console.log(`  Per call: ${((informalTime / ITERATIONS) * 1000).toFixed(3)}μs`)
console.log()

// Benchmark formal greeting
const formalStart = performance.now()
for (let i = 0; i < ITERATIONS; i++) {
  greet({ name: "World", formal: true })
}
const formalEnd = performance.now()
const formalTime = formalEnd - formalStart

console.log(`greet (formal): ${ITERATIONS.toLocaleString()} iterations`)
console.log(`  Total: ${formalTime.toFixed(2)}ms`)
console.log(`  Per call: ${((formalTime / ITERATIONS) * 1000).toFixed(3)}μs`)
console.log()

console.log("Benchmarks complete.")

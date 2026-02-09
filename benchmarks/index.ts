/**
 * Performance benchmarks for arrow-flight-sql-js
 *
 * Run with: bun run benchmarks/index.ts
 *
 * These benchmarks measure the performance of key operations:
 * - Protocol buffer encoding/decoding
 * - Arrow IPC parsing
 * - Query builder construction
 * - Retry logic overhead
 */

import { runAllBenchmarks } from "./runner"

runAllBenchmarks()

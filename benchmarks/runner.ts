/**
 * Benchmark runner utilities
 */

import { protoBenchmarks } from "./proto.bench"
import { queryBuilderBenchmarks } from "./query-builder.bench"
import { retryBenchmarks } from "./retry.bench"

export type BenchmarkResult = {
  name: string
  iterations: number
  totalMs: number
  opsPerSecond: number
  avgNsPerOp: number
  minNsPerOp: number
  maxNsPerOp: number
}

export type Benchmark = {
  name: string
  fn: () => void
  iterations?: number
}

/**
 * Run a single benchmark and return results
 */
export function runBenchmark(benchmark: Benchmark): BenchmarkResult {
  const iterations = benchmark.iterations ?? 10_000
  const timings: number[] = []

  // Warmup (10% of iterations)
  const warmupCount = Math.max(100, Math.floor(iterations * 0.1))
  for (let i = 0; i < warmupCount; i++) {
    benchmark.fn()
  }

  // Actual benchmark
  const startTotal = performance.now()

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    benchmark.fn()
    const end = performance.now()
    timings.push((end - start) * 1_000_000) // Convert to nanoseconds
  }

  const endTotal = performance.now()
  const totalMs = endTotal - startTotal

  // Calculate stats
  const avgNsPerOp = timings.reduce((a, b) => a + b, 0) / timings.length
  const minNsPerOp = Math.min(...timings)
  const maxNsPerOp = Math.max(...timings)
  const opsPerSecond = (iterations / totalMs) * 1000

  return {
    name: benchmark.name,
    iterations,
    totalMs,
    opsPerSecond,
    avgNsPerOp,
    minNsPerOp,
    maxNsPerOp
  }
}

/**
 * Format a benchmark result for display
 */
export function formatResult(result: BenchmarkResult): string {
  const ops = formatNumber(result.opsPerSecond)
  const avg = formatDuration(result.avgNsPerOp)
  const min = formatDuration(result.minNsPerOp)
  const max = formatDuration(result.maxNsPerOp)

  return `${result.name.padEnd(45)} ${ops.padStart(12)} ops/s  avg: ${avg.padStart(10)}  min: ${min.padStart(10)}  max: ${max.padStart(10)}`
}

/**
 * Format a number with thousands separators
 */
function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(2)}K`
  }
  return n.toFixed(2)
}

/**
 * Format nanoseconds as human-readable duration
 */
function formatDuration(ns: number): string {
  if (ns >= 1_000_000_000) {
    return `${(ns / 1_000_000_000).toFixed(2)}s`
  }
  if (ns >= 1_000_000) {
    return `${(ns / 1_000_000).toFixed(2)}ms`
  }
  if (ns >= 1_000) {
    return `${(ns / 1_000).toFixed(2)}µs`
  }
  return `${ns.toFixed(2)}ns`
}

/**
 * Run a group of benchmarks
 */
export function runBenchmarkGroup(name: string, benchmarks: Benchmark[]): void {
  console.warn(`\n${"=".repeat(80)}`)
  console.warn(`  ${name}`)
  console.warn("=".repeat(80))

  for (const benchmark of benchmarks) {
    const result = runBenchmark(benchmark)
    console.warn(formatResult(result))
  }
}

/**
 * Run all benchmark suites
 */
export function runAllBenchmarks(): void {
  console.warn("\n🚀 Arrow Flight SQL JS Benchmarks")
  console.warn("=".repeat(80))

  runBenchmarkGroup("Protocol Buffer Encoding", protoBenchmarks)
  runBenchmarkGroup("Query Builder", queryBuilderBenchmarks)
  runBenchmarkGroup("Retry Logic", retryBenchmarks)

  console.warn(`\n${"=".repeat(80)}`)
  console.warn("  Benchmarks complete")
  console.warn(`${"=".repeat(80)}\n`)
}

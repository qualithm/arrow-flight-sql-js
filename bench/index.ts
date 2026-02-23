/**
 * Flight SQL client benchmarks.
 *
 * Run with: FLIGHT_HOST=localhost FLIGHT_PORT=50051 bun run bench
 *
 * Requires a running Arrow Flight SQL server with test fixtures.
 */

/* eslint-disable no-console */

import {
  createFlightSqlClient,
  flightInfoToTable,
  type FlightSqlClient,
  iterateResults,
  queryToTable,
  ticketToTable
} from "../src/index"

const config = {
  host: process.env.FLIGHT_HOST ?? "localhost",
  port: parseInt(process.env.FLIGHT_PORT ?? "50051", 10),
  tls: process.env.FLIGHT_TLS === "true",
  username: process.env.FLIGHT_USER ?? "admin",
  password: process.env.FLIGHT_PASSWORD ?? "admin123"
}

const WARMUP_ITERATIONS = 15
const BENCHMARK_ITERATIONS = 100

type BenchmarkResult = {
  name: string
  iterations: number
  totalMs: number
  avgMs: number
  minMs: number
  maxMs: number
  stdDev: number
  cv: number // coefficient of variation (%)
  p50Ms: number
  p95Ms: number
  p99Ms: number
  rowsPerSec?: number
  bytesPerSec?: number
  opsPerSec?: number
  memoryDeltaBytes?: number
  skipped?: boolean
}

type QpsResult = {
  name: string
  durationMs: number
  totalQueries: number
  qps: number
  concurrency: number
  avgLatencyMs: number
  p50LatencyMs: number
  p99LatencyMs: number
  errors: number
}

const QPS_DURATION_SEC = 10
const QPS_CONCURRENCY_LEVELS = [1, 2, 4, 8, 16, 32]

function percentile(sortedArr: number[], p: number): number {
  const index = Math.ceil((p / 100) * sortedArr.length) - 1
  return sortedArr[Math.max(0, index)]
}

function formatResult(result: BenchmarkResult): void {
  if (result.skipped === true) {
    console.log(`${result.name}: [SKIPPED]\n`)
    return
  }
  const stability = result.cv > 30 ? " [UNSTABLE]" : ""
  console.log(`${result.name}:${stability}`)
  console.log(`  Iterations: ${String(result.iterations)}`)
  console.log(`  Total: ${result.totalMs.toFixed(2)}ms`)
  console.log(
    `  Avg: ${result.avgMs.toFixed(3)}ms (±${result.stdDev.toFixed(3)}ms, CV: ${result.cv.toFixed(1)}%)`
  )
  console.log(`  Min: ${result.minMs.toFixed(3)}ms`)
  console.log(`  Max: ${result.maxMs.toFixed(3)}ms`)
  console.log(`  P50: ${result.p50Ms.toFixed(3)}ms`)
  console.log(`  P95: ${result.p95Ms.toFixed(3)}ms`)
  console.log(`  P99: ${result.p99Ms.toFixed(3)}ms`)
  if (result.opsPerSec !== undefined) {
    console.log(`  Ops/sec: ${result.opsPerSec.toLocaleString()}`)
  }
  if (result.rowsPerSec !== undefined) {
    console.log(`  Throughput: ${result.rowsPerSec.toLocaleString()} rows/sec`)
  }
  if (result.bytesPerSec !== undefined) {
    const mbPerSec = result.bytesPerSec / (1024 * 1024)
    console.log(`  Bandwidth: ${mbPerSec.toFixed(2)} MB/sec`)
  }
  if (result.memoryDeltaBytes !== undefined) {
    const mb = result.memoryDeltaBytes / (1024 * 1024)
    console.log(`  Memory delta: ${mb.toFixed(2)} MB`)
  }
  console.log()
}

function triggerGC(): void {
  if (typeof Bun !== "undefined") {
    Bun.gc(true)
  } else if (typeof globalThis.gc === "function") {
    globalThis.gc()
  }
}

type BenchmarkMetrics = {
  rows?: number
  bytes?: number
}

async function benchmark(
  name: string,
  fn: () => Promise<number | BenchmarkMetrics | undefined>,
  iterations: number = BENCHMARK_ITERATIONS,
  options: { trackMemory?: boolean } = {}
): Promise<BenchmarkResult> {
  triggerGC()

  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await fn()
  }

  triggerGC()

  const memBefore = options.trackMemory === true ? process.memoryUsage().heapUsed : 0
  const times: number[] = []
  let totalRows = 0
  let totalBytes = 0

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const result = await fn()
    const end = performance.now()
    times.push(end - start)
    if (typeof result === "number") {
      totalRows += result
    } else if (result && typeof result === "object") {
      if (result.rows !== undefined) {
        totalRows += result.rows
      }
      if (result.bytes !== undefined) {
        totalBytes += result.bytes
      }
    }
  }

  const memAfter = options.trackMemory === true ? process.memoryUsage().heapUsed : 0
  const memoryDeltaBytes = options.trackMemory === true ? memAfter - memBefore : undefined

  times.sort((a, b) => a - b)

  const totalMs = times.reduce((a, b) => a + b, 0)
  const avgMs = totalMs / iterations
  const variance = times.reduce((sum, t) => sum + Math.pow(t - avgMs, 2), 0) / iterations
  const stdDev = Math.sqrt(variance)
  const cv = avgMs > 0 ? (stdDev / avgMs) * 100 : 0
  const rowsPerSec = totalRows > 0 ? (totalRows / totalMs) * 1000 : undefined
  const bytesPerSec = totalBytes > 0 ? (totalBytes / totalMs) * 1000 : undefined
  const opsPerSec = (iterations / totalMs) * 1000

  return {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs: times[0],
    maxMs: times[times.length - 1],
    stdDev,
    cv,
    p50Ms: percentile(times, 50),
    p95Ms: percentile(times, 95),
    p99Ms: percentile(times, 99),
    rowsPerSec,
    bytesPerSec,
    opsPerSec,
    memoryDeltaBytes
  }
}

/**
 * Run a benchmark that may fail (e.g., missing table).
 * Returns a skipped result instead of throwing.
 */
async function benchmarkOptional(
  name: string,
  fn: () => Promise<number | BenchmarkMetrics | undefined>,
  iterations: number = BENCHMARK_ITERATIONS,
  options: { trackMemory?: boolean } = {}
): Promise<BenchmarkResult> {
  try {
    return await benchmark(name, fn, iterations, options)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`SKIPPED: ${name} - ${message}`)
    return {
      name,
      iterations: 0,
      totalMs: 0,
      avgMs: 0,
      minMs: 0,
      maxMs: 0,
      stdDev: 0,
      cv: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      skipped: true
    }
  }
}

/**
 * Run a sustained QPS benchmark for a fixed duration with configurable concurrency.
 * Returns throughput and latency metrics under sustained load.
 */
async function benchmarkQps(
  name: string,
  fn: () => Promise<void>,
  options: { durationSec?: number; concurrency?: number } = {}
): Promise<QpsResult> {
  const durationMs = (options.durationSec ?? QPS_DURATION_SEC) * 1000
  const concurrency = options.concurrency ?? 1

  const latencies: number[] = []
  let completed = 0
  let errors = 0
  let running = true

  triggerGC()

  const startTime = performance.now()
  const deadline = startTime + durationMs

  const worker = async (): Promise<void> => {
    while (running && performance.now() < deadline) {
      const start = performance.now()
      try {
        await fn()
        latencies.push(performance.now() - start)
        completed++
      } catch {
        errors++
      }
    }
  }

  const workers = Array.from({ length: concurrency }, async () => worker())
  await Promise.all(workers)
  running = false

  const elapsed = performance.now() - startTime
  latencies.sort((a, b) => a - b)

  return {
    name,
    durationMs: elapsed,
    totalQueries: completed,
    qps: (completed / elapsed) * 1000,
    concurrency,
    avgLatencyMs:
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    p50LatencyMs: latencies.length > 0 ? percentile(latencies, 50) : 0,
    p99LatencyMs: latencies.length > 0 ? percentile(latencies, 99) : 0,
    errors
  }
}

function formatQpsResult(result: QpsResult): void {
  const errorRate =
    result.totalQueries > 0 ? (result.errors / (result.totalQueries + result.errors)) * 100 : 0
  console.log(
    `  C=${String(result.concurrency).padStart(2)} | ` +
      `QPS: ${result.qps.toFixed(0).padStart(6)} | ` +
      `Avg: ${result.avgLatencyMs.toFixed(2).padStart(7)}ms | ` +
      `P50: ${result.p50LatencyMs.toFixed(2).padStart(7)}ms | ` +
      `P99: ${result.p99LatencyMs.toFixed(2).padStart(7)}ms | ` +
      `Errors: ${String(result.errors).padStart(4)} (${errorRate.toFixed(1)}%)`
  )
}

/**
 * Run QPS sweep across concurrency levels to find throughput ceiling.
 */
async function runQpsSweep(
  name: string,
  fn: () => Promise<void>,
  concurrencyLevels: number[] = QPS_CONCURRENCY_LEVELS
): Promise<QpsResult[]> {
  console.log(`\n${name}:`)
  console.log("  Concurrency | QPS | Avg Latency | P50 Latency | P99 Latency | Errors")

  const results: QpsResult[] = []

  for (const concurrency of concurrencyLevels) {
    const result = await benchmarkQps(name, fn, {
      durationSec: QPS_DURATION_SEC,
      concurrency
    })
    formatQpsResult(result)
    results.push(result)

    // Stop if error rate exceeds 5%
    const errorRate =
      result.totalQueries > 0 ? result.errors / (result.totalQueries + result.errors) : 0
    if (errorRate > 0.05) {
      console.log("  (stopping sweep due to high error rate)")
      break
    }
  }

  return results
}

async function runBenchmarks(): Promise<void> {
  console.log("Flight SQL Database Benchmarks")
  console.log("================================")
  console.log(`Server: ${config.host}:${String(config.port)}`)
  console.log(`TLS: ${String(config.tls)}`)
  console.log(`Warmup: ${String(WARMUP_ITERATIONS)} iterations`)
  console.log(`Benchmark: ${String(BENCHMARK_ITERATIONS)} iterations`)
  console.log()

  console.log("Connecting...")
  const client: FlightSqlClient = await createFlightSqlClient({
    host: config.host,
    port: config.port,
    tls: config.tls,
    auth: {
      type: "basic",
      username: config.username,
      password: config.password
    }
  })

  await client.handshake()
  console.log("Connected.\n")

  const results: BenchmarkResult[] = []

  results.push(
    await benchmark(
      "Connection establishment",
      async () => {
        const c = await createFlightSqlClient({
          host: config.host,
          port: config.port,
          tls: config.tls,
          auth: {
            type: "basic",
            username: config.username,
            password: config.password
          }
        })
        await c.handshake()
        c.close()
        return undefined
      },
      20
    )
  )

  results.push(
    await benchmark("Query (metadata only)", async () => {
      await client.query("SELECT * FROM test.integers LIMIT 1")
      return undefined
    })
  )

  results.push(
    await benchmark("SELECT LIMIT 1 (full roundtrip)", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.integers LIMIT 1")
      return table.numRows
    })
  )

  results.push(
    await benchmark("SELECT * FROM test.integers (100 rows)", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.integers")
      return table.numRows
    })
  )

  results.push(
    await benchmark("SELECT with LIMIT 10", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.integers LIMIT 10")
      return table.numRows
    })
  )

  results.push(
    await benchmark("SELECT with WHERE clause", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.integers WHERE id > 50")
      return table.numRows
    })
  )

  results.push(
    await benchmark("SELECT * FROM test.strings", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.strings")
      return table.numRows
    })
  )

  results.push(
    await benchmark(
      "SELECT * FROM test.large (10000 rows)",
      async () => {
        const table = await queryToTable(client, "SELECT * FROM test.large")
        return table.numRows
      },
      20
    )
  )

  results.push(
    await benchmark("SELECT * FROM test.nested (50 rows)", async () => {
      const table = await queryToTable(client, "SELECT * FROM test.nested")
      return table.numRows
    })
  )

  results.push(
    await benchmark("Prepared statement lifecycle", async () => {
      const prepared = await client.createPreparedStatement("SELECT * FROM test.integers LIMIT 10")
      const info = await client.executePreparedQuery(prepared.handle)
      await client.closePreparedStatement(prepared.handle)
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("Transaction begin/commit", async () => {
      const txn = await client.beginTransaction()
      await client.commit(txn.transactionId)
      return undefined
    })
  )

  results.push(
    await benchmark("3 concurrent queries", async () => {
      const queries = [
        queryToTable(client, "SELECT * FROM test.integers LIMIT 1"),
        queryToTable(client, "SELECT * FROM test.strings LIMIT 1"),
        queryToTable(client, "SELECT * FROM test.nested LIMIT 1")
      ]
      const tables = await Promise.all(queries)
      return tables.reduce((sum, t) => sum + t.numRows, 0)
    })
  )

  results.push(
    await benchmarkOptional(
      "executeUpdate (INSERT)",
      async () => {
        const result = await client.executeUpdate(
          "INSERT INTO test.scratch (id, value) VALUES (1, 'bench')"
        )
        return result.recordCount
      },
      20
    )
  )

  results.push(
    await benchmarkOptional(
      "executePreparedUpdate",
      async () => {
        const prepared = await client.createPreparedStatement(
          "INSERT INTO test.scratch (id, value) VALUES (2, 'prepared')"
        )
        const result = await client.executePreparedUpdate(prepared.handle)
        await client.closePreparedStatement(prepared.handle)
        return result.recordCount
      },
      20
    )
  )

  results.push(
    await benchmark("getCatalogs", async () => {
      const info = await client.getCatalogs()
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("getDbSchemas", async () => {
      const info = await client.getDbSchemas()
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("getTables", async () => {
      const info = await client.getTables()
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("getTableTypes", async () => {
      const info = await client.getTableTypes()
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("getPrimaryKeys", async () => {
      const info = await client.getPrimaryKeys("integers", { catalog: "test" })
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("getExportedKeys", async () => {
      const info = await client.getExportedKeys("integers", { catalog: "test" })
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("getImportedKeys", async () => {
      const info = await client.getImportedKeys("integers", { catalog: "test" })
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("getSqlInfo", async () => {
      const info = await client.getSqlInfo()
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("getXdbcTypeInfo", async () => {
      const info = await client.getXdbcTypeInfo()
      return info.totalRecords
    })
  )

  results.push(
    await benchmark("Transaction begin/rollback", async () => {
      const txn = await client.beginTransaction()
      await client.rollback(txn.transactionId)
      return undefined
    })
  )

  results.push(
    await benchmark("flightInfoToTable (isolated)", async () => {
      const info = await client.query("SELECT * FROM test.integers LIMIT 10")
      const table = await flightInfoToTable(client, info)
      return table.numRows
    })
  )

  results.push(
    await benchmark("ticketToTable", async () => {
      const info = await client.query("SELECT * FROM test.integers LIMIT 10")
      if (info.endpoint.length > 0 && info.endpoint[0].ticket) {
        const table = await ticketToTable(client, info.endpoint[0].ticket)
        return table.numRows
      }
      return 0
    })
  )

  results.push(
    await benchmark("iterateResults (streaming 100 rows)", async () => {
      const info = await client.query("SELECT * FROM test.integers")
      let count = 0
      for await (const _data of iterateResults(client, info)) {
        count++
      }
      return count
    })
  )

  results.push(
    await benchmark("Prepared statement (parameterized query)", async () => {
      const prepared = await client.createPreparedStatement(
        "SELECT * FROM test.integers WHERE id > $1"
      )
      const info = await client.executePreparedQuery(prepared.handle)
      await client.closePreparedStatement(prepared.handle)
      return info.totalRecords
    })
  )

  results.push(
    await benchmark(
      "Error handling (invalid query)",
      async () => {
        try {
          await client.query("SELECT * FROM nonexistent_table_xyz")
        } catch {
          // Expected error
        }
        return undefined
      },
      50
    )
  )

  results.push(
    await benchmark(
      "Streaming large result (10000 rows)",
      async () => {
        const info = await client.query("SELECT * FROM test.large")
        let batches = 0
        for await (const _data of iterateResults(client, info)) {
          batches++
        }
        return batches
      },
      20
    )
  )

  results.push(
    await benchmarkOptional(
      "Transaction with INSERT",
      async () => {
        const txn = await client.beginTransaction()
        await client.executeUpdate(
          "INSERT INTO test.scratch (id, value) VALUES (100, 'txn_test')",
          { transactionId: txn.transactionId }
        )
        await client.commit(txn.transactionId)
        return 1
      },
      20
    )
  )

  results.push(
    await benchmarkOptional(
      "Transaction with INSERT then rollback",
      async () => {
        const txn = await client.beginTransaction()
        await client.executeUpdate(
          "INSERT INTO test.scratch (id, value) VALUES (101, 'rollback_test')",
          { transactionId: txn.transactionId }
        )
        await client.rollback(txn.transactionId)
        return 1
      },
      20
    )
  )

  results.push(
    await benchmark(
      "3 concurrent prepared statements",
      async () => {
        const stmts = await Promise.all([
          client.createPreparedStatement("SELECT * FROM test.integers LIMIT 5"),
          client.createPreparedStatement("SELECT * FROM test.strings LIMIT 5"),
          client.createPreparedStatement("SELECT * FROM test.nested LIMIT 5")
        ])
        const infos: Awaited<ReturnType<typeof client.executePreparedQuery>>[] = []
        for (const s of stmts) {
          infos.push(await client.executePreparedQuery(s.handle))
        }
        for (const s of stmts) {
          await client.closePreparedStatement(s.handle)
        }
        return infos.reduce((sum, i) => sum + i.totalRecords, 0)
      },
      50
    )
  )

  results.push(
    await benchmark(
      "Prepared statement reuse (10 executions)",
      async () => {
        const prepared = await client.createPreparedStatement("SELECT * FROM test.integers LIMIT 5")
        let total = 0
        for (let i = 0; i < 10; i++) {
          const info = await client.executePreparedQuery(prepared.handle)
          total += info.totalRecords
        }
        await client.closePreparedStatement(prepared.handle)
        return total
      },
      20
    )
  )

  results.push(
    await benchmark(
      "Query with connection reuse (10 queries)",
      async () => {
        let total = 0
        for (let i = 0; i < 10; i++) {
          const table = await queryToTable(client, "SELECT * FROM test.integers LIMIT 1")
          total += table.numRows
        }
        return total
      },
      20
    )
  )

  results.push(
    await benchmark(
      "Query with new connection each time",
      async () => {
        const c = await createFlightSqlClient({
          host: config.host,
          port: config.port,
          tls: config.tls,
          auth: {
            type: "basic",
            username: config.username,
            password: config.password
          }
        })
        await c.handshake()
        const table = await queryToTable(c, "SELECT * FROM test.integers LIMIT 1")
        c.close()
        return table.numRows
      },
      20
    )
  )

  // ================================
  // Parameterized batch size benchmarks
  // ================================
  console.log("\nRunning parameterized batch size benchmarks...")

  for (const limit of [1, 10, 100, 1000]) {
    results.push(
      await benchmark(
        `SELECT LIMIT ${String(limit)} rows`,
        async () => {
          const table = await queryToTable(
            client,
            `SELECT * FROM test.large LIMIT ${String(limit)}`
          )
          return table.numRows
        },
        50
      )
    )
  }

  // ================================
  // Memory tracking benchmarks
  // ================================
  console.log("\nRunning memory-tracked benchmarks...")

  results.push(
    await benchmark(
      "Large result with memory tracking (10000 rows)",
      async () => {
        const table = await queryToTable(client, "SELECT * FROM test.large")
        const estimatedBytes = table.numRows * 8 * table.numCols
        return { rows: table.numRows, bytes: estimatedBytes }
      },
      10,
      { trackMemory: true }
    )
  )

  // ================================
  // High concurrency stress tests
  // ================================
  console.log("\nRunning high-concurrency stress tests...")

  for (const concurrency of [5, 10, 20]) {
    results.push(
      await benchmark(
        `${String(concurrency)} concurrent queries`,
        async () => {
          const queries = Array.from({ length: concurrency }, async () =>
            queryToTable(client, "SELECT * FROM test.integers LIMIT 10")
          )
          const tables = await Promise.all(queries)
          return tables.reduce((sum, t) => sum + t.numRows, 0)
        },
        20
      )
    )
  }

  results.push(
    await benchmark(
      "Burst: 50 sequential queries",
      async () => {
        let total = 0
        for (let i = 0; i < 50; i++) {
          const table = await queryToTable(client, "SELECT * FROM test.integers LIMIT 1")
          total += table.numRows
        }
        return total
      },
      5
    )
  )

  // ================================
  // Edge case benchmarks
  // ================================
  console.log("\nRunning edge case benchmarks...")

  results.push(
    await benchmark(
      "Empty result set",
      async () => {
        const table = await queryToTable(client, "SELECT * FROM test.integers WHERE id < 0")
        return table.numRows
      },
      50
    )
  )

  results.push(
    await benchmark(
      "Single column projection",
      async () => {
        const table = await queryToTable(client, "SELECT id FROM test.integers")
        return table.numRows
      },
      50
    )
  )

  // ================================
  // QPS (Queries Per Second) Sustained Load Tests
  // ================================
  console.log("\n================================")
  console.log("QPS Sustained Load Tests")
  console.log(`Duration: ${String(QPS_DURATION_SEC)}s per concurrency level`)
  console.log(`Concurrency levels: ${QPS_CONCURRENCY_LEVELS.join(", ")}`)
  console.log("================================")

  const qpsResults: QpsResult[] = []

  qpsResults.push(
    ...(await runQpsSweep("SELECT LIMIT 1 (full roundtrip)", async () => {
      await queryToTable(client, "SELECT * FROM test.integers LIMIT 1")
    }))
  )

  qpsResults.push(
    ...(await runQpsSweep("getCatalogs (metadata)", async () => {
      await client.getCatalogs()
    }))
  )

  qpsResults.push(
    ...(await runQpsSweep("Query metadata only", async () => {
      await client.query("SELECT * FROM test.integers LIMIT 1")
    }))
  )

  qpsResults.push(
    ...(await runQpsSweep(
      "SELECT 100 rows",
      async () => {
        await queryToTable(client, "SELECT * FROM test.integers")
      },
      [1, 2, 4, 8]
    ))
  )

  console.log("\nQPS CSV Output:")
  console.log(
    "name,concurrency,duration_ms,total_queries,qps,avg_latency_ms,p50_latency_ms,p99_latency_ms,errors"
  )
  for (const r of qpsResults) {
    console.log(
      `"${r.name}",${String(r.concurrency)},${r.durationMs.toFixed(2)},${String(r.totalQueries)},` +
        `${r.qps.toFixed(2)},${r.avgLatencyMs.toFixed(3)},${r.p50LatencyMs.toFixed(3)},` +
        `${r.p99LatencyMs.toFixed(3)},${String(r.errors)}`
    )
  }

  client.close()

  console.log("================================")
  console.log("Benchmark Results Summary")
  console.log("================================\n")

  for (const result of results) {
    formatResult(result)
  }

  const completed = results.filter((r) => r.skipped !== true)
  const skipped = results.filter((r) => r.skipped === true)
  console.log(`\nCompleted: ${String(completed.length)} benchmarks`)
  if (skipped.length > 0) {
    console.log(
      `Skipped: ${String(skipped.length)} benchmarks (${skipped.map((r) => r.name).join(", ")})`
    )
  }

  console.log("\nCSV Output:")
  console.log(
    "name,iterations,total_ms,avg_ms,std_dev,cv_pct,min_ms,max_ms,p50_ms,p95_ms,p99_ms,ops_per_sec,rows_per_sec,bytes_per_sec,memory_delta_mb,skipped"
  )
  for (const r of results) {
    const memMb =
      r.memoryDeltaBytes !== undefined ? (r.memoryDeltaBytes / (1024 * 1024)).toFixed(2) : ""
    console.log(
      `"${r.name}",${String(r.iterations)},${r.totalMs.toFixed(2)},${r.avgMs.toFixed(3)},` +
        `${r.stdDev.toFixed(3)},${r.cv.toFixed(1)},${r.minMs.toFixed(3)},${r.maxMs.toFixed(3)},` +
        `${r.p50Ms.toFixed(3)},${r.p95Ms.toFixed(3)},${r.p99Ms.toFixed(3)},` +
        `${r.opsPerSec?.toFixed(0) ?? ""},${r.rowsPerSec?.toFixed(0) ?? ""},${r.bytesPerSec?.toFixed(0) ?? ""},` +
        `${memMb},${r.skipped === true ? "true" : "false"}`
    )
  }
}

runBenchmarks().catch((err: unknown) => {
  console.error("Benchmark failed:", err)
  process.exit(1)
})

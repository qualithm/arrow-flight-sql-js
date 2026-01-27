/**
 * Unit tests for metrics and observability module
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"

import {
  ConsoleMetricsHandler,
  InMemoryMetricsHandler,
  MetricNames,
  MetricsTimer,
  NoopMetricsHandler,
  startTimer,
  withMetrics,
  type CounterEvent,
  type GaugeEvent,
  type MetricEvent,
  type MetricsHandler,
  type OperationStatus,
  type OperationType
} from "../../metrics"

// ============================================================================
// NoopMetricsHandler Tests
// ============================================================================

describe("NoopMetricsHandler", () => {
  test("should implement MetricsHandler interface", () => {
    const handler = new NoopMetricsHandler()

    expect(handler.recordOperation).toBeDefined()
    expect(handler.recordGauge).toBeDefined()
    expect(handler.recordCounter).toBeDefined()
  })

  test("should accept all event types without error", () => {
    const handler = new NoopMetricsHandler()

    // Should not throw
    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 100,
      startTime: Date.now() - 100,
      endTime: Date.now()
    })

    handler.recordGauge({
      name: "test_gauge",
      value: 42
    })

    handler.recordCounter({
      name: "test_counter",
      increment: 1
    })
  })
})

// ============================================================================
// ConsoleMetricsHandler Tests
// ============================================================================

describe("ConsoleMetricsHandler", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>
  let consoleErrorSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => undefined)
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  test("should use default prefix", () => {
    const handler = new ConsoleMetricsHandler()
    handler.recordGauge({ name: "test", value: 1 })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[FlightSQL Metrics]"))
  })

  test("should use custom prefix", () => {
    const handler = new ConsoleMetricsHandler("[Custom]")
    handler.recordGauge({ name: "test", value: 1 })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[Custom]"))
  })

  test("should log successful operations to console.log", () => {
    const handler = new ConsoleMetricsHandler()
    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 150,
      startTime: Date.now() - 150,
      endTime: Date.now()
    })

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("query"))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("success"))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("150ms"))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✓"))
  })

  test("should log failed operations to console.error", () => {
    const handler = new ConsoleMetricsHandler()
    const error = new Error("Connection failed")
    handler.recordOperation({
      operation: "connect",
      status: "error",
      durationMs: 50,
      startTime: Date.now() - 50,
      endTime: Date.now(),
      error
    })

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("connect"),
      expect.stringContaining("Connection failed")
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("✗"), expect.anything())
  })

  test("should log gauge values", () => {
    const handler = new ConsoleMetricsHandler()
    handler.recordGauge({
      name: "pool_size",
      value: 5,
      labels: { host: "localhost" }
    })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[gauge]"))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("pool_size=5"))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("localhost"))
  })

  test("should log counter increments", () => {
    const handler = new ConsoleMetricsHandler()
    handler.recordCounter({
      name: "queries_total",
      increment: 1
    })

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("[counter]"))
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("queries_total+=1"))
  })
})

// ============================================================================
// InMemoryMetricsHandler Tests
// ============================================================================

describe("InMemoryMetricsHandler", () => {
  test("should store operations", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 100,
      startTime: 1000,
      endTime: 1100
    })

    const ops = handler.getOperations()
    expect(ops.length).toBe(1)
    expect(ops[0].operation).toBe("query")
    expect(ops[0].status).toBe("success")
    expect(ops[0].durationMs).toBe(100)
  })

  test("should limit stored operations", () => {
    const handler = new InMemoryMetricsHandler({ maxOperations: 3 })

    for (let i = 0; i < 5; i++) {
      handler.recordOperation({
        operation: "query",
        status: "success",
        durationMs: i * 10,
        startTime: i * 100,
        endTime: i * 100 + i * 10
      })
    }

    const ops = handler.getOperations()
    expect(ops.length).toBe(3)
    // Should have the last 3 operations
    expect(ops[0].durationMs).toBe(20)
    expect(ops[1].durationMs).toBe(30)
    expect(ops[2].durationMs).toBe(40)
  })

  test("should filter operations by type", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 100,
      startTime: 0,
      endTime: 100
    })
    handler.recordOperation({
      operation: "execute",
      status: "success",
      durationMs: 200,
      startTime: 100,
      endTime: 300
    })
    handler.recordOperation({
      operation: "query",
      status: "error",
      durationMs: 50,
      startTime: 300,
      endTime: 350
    })

    const queryOps = handler.getOperationsByType("query")
    expect(queryOps.length).toBe(2)
    expect(queryOps.every((op) => op.operation === "query")).toBe(true)
  })

  test("should calculate average duration", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 100,
      startTime: 0,
      endTime: 100
    })
    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 200,
      startTime: 100,
      endTime: 300
    })
    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 300,
      startTime: 300,
      endTime: 600
    })

    expect(handler.getAverageDuration("query")).toBe(200)
  })

  test("should return 0 for average of non-existent operation", () => {
    const handler = new InMemoryMetricsHandler()

    expect(handler.getAverageDuration("query")).toBe(0)
  })

  test("should calculate error rate", () => {
    const handler = new InMemoryMetricsHandler()

    // 2 successes, 2 errors = 50% error rate
    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 100,
      startTime: 0,
      endTime: 100
    })
    handler.recordOperation({
      operation: "query",
      status: "error",
      durationMs: 50,
      startTime: 100,
      endTime: 150
    })
    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 100,
      startTime: 150,
      endTime: 250
    })
    handler.recordOperation({
      operation: "query",
      status: "timeout",
      durationMs: 5000,
      startTime: 250,
      endTime: 5250
    })

    expect(handler.getErrorRate("query")).toBe(0.5)
  })

  test("should store and retrieve gauge values", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordGauge({
      name: "pool_size",
      value: 5
    })

    expect(handler.getGauge("pool_size")).toBe(5)

    // Update gauge
    handler.recordGauge({
      name: "pool_size",
      value: 10
    })

    expect(handler.getGauge("pool_size")).toBe(10)
  })

  test("should store gauge with labels", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordGauge({
      name: "pool_size",
      value: 5,
      labels: { host: "server1" }
    })
    handler.recordGauge({
      name: "pool_size",
      value: 10,
      labels: { host: "server2" }
    })

    expect(handler.getGauge("pool_size", { host: "server1" })).toBe(5)
    expect(handler.getGauge("pool_size", { host: "server2" })).toBe(10)
  })

  test("should accumulate counter values", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordCounter({ name: "requests", increment: 1 })
    handler.recordCounter({ name: "requests", increment: 1 })
    handler.recordCounter({ name: "requests", increment: 5 })

    expect(handler.getCounter("requests")).toBe(7)
  })

  test("should separate counters by labels", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordCounter({
      name: "requests",
      increment: 1,
      labels: { status: "200" }
    })
    handler.recordCounter({
      name: "requests",
      increment: 2,
      labels: { status: "500" }
    })

    expect(handler.getCounter("requests", { status: "200" })).toBe(1)
    expect(handler.getCounter("requests", { status: "500" })).toBe(2)
    expect(handler.getCounter("requests")).toBe(0) // No labels
  })

  test("should generate summary statistics", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 100,
      startTime: 0,
      endTime: 100
    })
    handler.recordOperation({
      operation: "query",
      status: "error",
      durationMs: 50,
      startTime: 100,
      endTime: 150
    })
    handler.recordOperation({
      operation: "execute",
      status: "success",
      durationMs: 200,
      startTime: 150,
      endTime: 350
    })

    const summary = handler.getSummary()

    expect(summary.totalOperations).toBe(3)
    expect(summary.successCount).toBe(2)
    expect(summary.errorCount).toBe(1)
    expect(summary.operationCounts["query"]).toBe(2)
    expect(summary.operationCounts["execute"]).toBe(1)
    expect(summary.averageDurations["query"]).toBe(75) // (100 + 50) / 2
    expect(summary.averageDurations["execute"]).toBe(200)
  })

  test("should clear all metrics", () => {
    const handler = new InMemoryMetricsHandler()

    handler.recordOperation({
      operation: "query",
      status: "success",
      durationMs: 100,
      startTime: 0,
      endTime: 100
    })
    handler.recordGauge({ name: "gauge1", value: 5 })
    handler.recordCounter({ name: "counter1", increment: 1 })

    handler.clear()

    expect(handler.getOperations().length).toBe(0)
    expect(handler.getGauge("gauge1")).toBeUndefined()
    expect(handler.getCounter("counter1")).toBe(0)
  })
})

// ============================================================================
// MetricsTimer Tests
// ============================================================================

describe("MetricsTimer", () => {
  test("should record success", () => {
    const handler = new InMemoryMetricsHandler()
    const timer = new MetricsTimer(handler, "query")

    const duration = timer.success()

    const ops = handler.getOperations()
    expect(ops.length).toBe(1)
    expect(ops[0].status).toBe("success")
    expect(ops[0].operation).toBe("query")
    expect(duration).toBeGreaterThanOrEqual(0)
  })

  test("should record error", () => {
    const handler = new InMemoryMetricsHandler()
    const timer = new MetricsTimer(handler, "query")
    const error = new Error("Query failed")

    timer.error(error)

    const ops = handler.getOperations()
    expect(ops.length).toBe(1)
    expect(ops[0].status).toBe("error")
    expect(ops[0].error).toBe(error)
  })

  test("should record timeout", () => {
    const handler = new InMemoryMetricsHandler()
    const timer = new MetricsTimer(handler, "query")

    timer.timeout(new Error("Timeout"))

    const ops = handler.getOperations()
    expect(ops[0].status).toBe("timeout")
  })

  test("should record cancelled", () => {
    const handler = new InMemoryMetricsHandler()
    const timer = new MetricsTimer(handler, "query")

    timer.cancelled()

    const ops = handler.getOperations()
    expect(ops[0].status).toBe("cancelled")
  })

  test("should include initial metadata", () => {
    const handler = new InMemoryMetricsHandler()
    const timer = new MetricsTimer(handler, "query", { table: "users" })

    timer.success()

    const ops = handler.getOperations()
    expect(ops[0].metadata?.table).toBe("users")
  })

  test("should merge additional metadata", () => {
    const handler = new InMemoryMetricsHandler()
    const timer = new MetricsTimer(handler, "query", { table: "users" })

    timer.success({ rowCount: 100 })

    const ops = handler.getOperations()
    expect(ops[0].metadata?.table).toBe("users")
    expect(ops[0].metadata?.rowCount).toBe(100)
  })

  test("should calculate correct duration", async () => {
    const handler = new InMemoryMetricsHandler()
    const timer = new MetricsTimer(handler, "query")

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 50))

    const duration = timer.success()

    expect(duration).toBeGreaterThanOrEqual(40) // Allow some variance
    expect(handler.getOperations()[0].durationMs).toBeGreaterThanOrEqual(40)
  })
})

// ============================================================================
// startTimer Helper Tests
// ============================================================================

describe("startTimer", () => {
  test("should create MetricsTimer", () => {
    const handler = new InMemoryMetricsHandler()
    const timer = startTimer(handler, "query")

    expect(timer).toBeInstanceOf(MetricsTimer)

    timer.success()
    expect(handler.getOperations().length).toBe(1)
  })

  test("should pass metadata to timer", () => {
    const handler = new InMemoryMetricsHandler()
    const timer = startTimer(handler, "query", { sql: "SELECT 1" })

    timer.success()

    expect(handler.getOperations()[0].metadata?.sql).toBe("SELECT 1")
  })
})

// ============================================================================
// withMetrics Helper Tests
// ============================================================================

describe("withMetrics", () => {
  test("should record success for resolved promise", async () => {
    const handler = new InMemoryMetricsHandler()

    const result = await withMetrics(handler, "query", async () => {
      return 42
    })

    expect(result).toBe(42)

    const ops = handler.getOperations()
    expect(ops.length).toBe(1)
    expect(ops[0].status).toBe("success")
    expect(ops[0].operation).toBe("query")
  })

  test("should record error for rejected promise", async () => {
    const handler = new InMemoryMetricsHandler()
    const error = new Error("Query failed")

    await expect(
      withMetrics(handler, "query", async () => {
        throw error
      })
    ).rejects.toThrow("Query failed")

    const ops = handler.getOperations()
    expect(ops.length).toBe(1)
    expect(ops[0].status).toBe("error")
    expect(ops[0].error).toBe(error)
  })

  test("should record timeout for TimeoutError", async () => {
    const handler = new InMemoryMetricsHandler()
    const timeoutError = new Error("Timeout exceeded")
    timeoutError.name = "TimeoutError"

    await expect(
      withMetrics(handler, "query", async () => {
        throw timeoutError
      })
    ).rejects.toThrow()

    const ops = handler.getOperations()
    expect(ops[0].status).toBe("timeout")
  })

  test("should record cancelled for CancelledError", async () => {
    const handler = new InMemoryMetricsHandler()
    const cancelledError = new Error("Operation cancelled")
    cancelledError.name = "CancelledError"

    await expect(
      withMetrics(handler, "query", async () => {
        throw cancelledError
      })
    ).rejects.toThrow()

    const ops = handler.getOperations()
    expect(ops[0].status).toBe("cancelled")
  })

  test("should handle non-Error thrown values", async () => {
    const handler = new InMemoryMetricsHandler()

    await expect(
      withMetrics(handler, "query", async () => {
        throw "string error" // eslint-disable-line @typescript-eslint/only-throw-error
      })
    ).rejects.toThrow()

    const ops = handler.getOperations()
    expect(ops[0].status).toBe("error")
    expect(ops[0].error?.message).toBe("string error")
  })

  test("should include metadata in recorded event", async () => {
    const handler = new InMemoryMetricsHandler()

    await withMetrics(
      handler,
      "query",
      async () => {
        return "result"
      },
      { table: "users", limit: 100 }
    )

    const ops = handler.getOperations()
    expect(ops[0].metadata?.table).toBe("users")
    expect(ops[0].metadata?.limit).toBe(100)
  })
})

// ============================================================================
// MetricNames Tests
// ============================================================================

describe("MetricNames", () => {
  test("should have pool gauge names", () => {
    expect(MetricNames.poolTotalConnections).toBe("flight_sql.pool.total_connections")
    expect(MetricNames.poolActiveConnections).toBe("flight_sql.pool.active_connections")
    expect(MetricNames.poolIdleConnections).toBe("flight_sql.pool.idle_connections")
    expect(MetricNames.poolPendingRequests).toBe("flight_sql.pool.pending_requests")
  })

  test("should have counter names", () => {
    expect(MetricNames.queriesExecuted).toBe("flight_sql.queries.executed")
    expect(MetricNames.queriesSucceeded).toBe("flight_sql.queries.succeeded")
    expect(MetricNames.queriesFailed).toBe("flight_sql.queries.failed")
    expect(MetricNames.bytesReceived).toBe("flight_sql.bytes.received")
    expect(MetricNames.bytesSent).toBe("flight_sql.bytes.sent")
    expect(MetricNames.retriesAttempted).toBe("flight_sql.retries.attempted")
    expect(MetricNames.connectionsCreated).toBe("flight_sql.connections.created")
    expect(MetricNames.connectionsClosed).toBe("flight_sql.connections.closed")
  })

  test("should follow naming convention", () => {
    for (const name of Object.values(MetricNames)) {
      // All metric names should start with 'flight_sql.'
      expect(name).toMatch(/^flight_sql\./)
      // All names should use snake_case and dots
      expect(name).toMatch(/^[a-z_]+(\.[a-z_]+)+$/)
    }
  })
})

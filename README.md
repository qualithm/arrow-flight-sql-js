# Arrow Flight SQL JS

A standards-compliant [Apache Arrow Flight SQL](https://arrow.apache.org/docs/format/FlightSql.html)
client for JavaScript and TypeScript.

> ⚠️ **Status: In Development** – Not yet ready for production use.

## Overview

This library provides a native JavaScript implementation for communicating with Arrow Flight SQL
servers. It handles the complete protocol stack:

- **gRPC/HTTP2 Transport** – Standards-based communication layer
- **Protocol Buffers** – Full Flight SQL message serialization
- **Connection Pooling** – Efficient connection reuse for high throughput
- **Arrow IPC Streaming** – Native Arrow record batch handling
- **Authentication** – Bearer tokens, basic auth, and custom handlers

## Design Goals

Arrow Flight SQL JS is modeled on the canonical implementations:

| Reference                 | What We Adopt                                        |
| ------------------------- | ---------------------------------------------------- |
| **Java** (reference impl) | Comprehensive API surface, error handling patterns   |
| **C++**                   | Streaming-first patterns, performance considerations |
| **Go**                    | Connection pooling, context/cancellation model       |

We aim for **API parity** with the official clients where JavaScript idioms allow.

## Installation

```bash
# npm
npm install arrow-flight-sql-js

# bun
bun add arrow-flight-sql-js

# pnpm
pnpm add arrow-flight-sql-js
```

## Quick Start

```typescript
import { FlightSqlClient } from "arrow-flight-sql-js"

// Create a client
const client = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  tls: true,
  token: "your-bearer-token"
})

// Execute a query
const stream = await client.execute("SELECT * FROM my_table LIMIT 100")

// Process Arrow record batches
for await (const batch of stream) {
  console.log(`Received ${batch.numRows} rows`)
  // batch is an Arrow RecordBatch
}

// Clean up
await client.close()
```

## Connection Pooling

```typescript
import { FlightSqlPool } from "arrow-flight-sql-js"

const pool = new FlightSqlPool({
  host: "localhost",
  port: 31337,
  // Pool configuration
  minConnections: 2,
  maxConnections: 10,
  idleTimeoutMs: 30000
})

// Acquire a client from the pool
const client = await pool.acquire()
try {
  const stream = await client.execute("SELECT 1")
  // ... process results
} finally {
  // Return to pool
  pool.release(client)
}

// Or use the convenience method
const results = await pool.withClient(async (client) => {
  return client.execute("SELECT * FROM users")
})

// Graceful shutdown
await pool.close()
```

## Observability & Metrics

Integrate with your observability stack using the metrics handler interface:

```typescript
import {
  FlightSqlClient,
  ConsoleMetricsHandler,
  InMemoryMetricsHandler,
  MetricNames,
  type MetricsHandler
} from "arrow-flight-sql-js"

// Console handler for development
const client = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  metrics: new ConsoleMetricsHandler()
})
// Output: [FlightSQL Metrics] ✓ query success (42ms)

// In-memory handler for testing
const metricsHandler = new InMemoryMetricsHandler()
const testClient = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  metrics: metricsHandler
})

// Query metrics after operations
await testClient.execute("SELECT 1")
console.log(metricsHandler.getAverageDuration("query"))
console.log(metricsHandler.getErrorRate("query"))
console.log(metricsHandler.getSummary())

// Custom handler for OpenTelemetry, Prometheus, etc.
class OpenTelemetryHandler implements MetricsHandler {
  recordOperation(event) {
    // Record to your tracing/metrics backend
    tracer.startSpan(event.operation).end()
    histogram.record(event.durationMs, { operation: event.operation })
  }
  recordGauge(event) {
    /* ... */
  }
  recordCounter(event) {
    /* ... */
  }
}
```

### Standard Metric Names

Use `MetricNames` for consistent metric naming:

```typescript
MetricNames.poolTotalConnections // "flight_sql.pool.total_connections"
MetricNames.poolActiveConnections // "flight_sql.pool.active_connections"
MetricNames.queriesExecuted // "flight_sql.queries.executed"
MetricNames.bytesReceived // "flight_sql.bytes.received"
MetricNames.retriesAttempted // "flight_sql.retries.attempted"
```

## Error Handling

The library provides a comprehensive error hierarchy:

```typescript
import {
  FlightSqlError, // Base error class
  ConnectionError, // Network/connection issues
  AuthenticationError, // Auth failures (401, 403)
  QueryError, // SQL syntax or execution errors
  TimeoutError, // Operation timeouts
  ProtocolError, // Protocol/encoding issues
  NotFoundError, // Resource not found
  CancelledError // Operation cancelled
} from "arrow-flight-sql-js"

try {
  await client.execute("SELECT * FROM missing_table")
} catch (error) {
  if (error instanceof QueryError) {
    console.error("SQL Error:", error.message)
    console.error("SQL State:", error.sqlState)
  } else if (error instanceof ConnectionError) {
    console.error("Connection lost, will retry...")
  } else if (error instanceof TimeoutError) {
    console.error(`Operation timed out after ${error.timeoutMs}ms`)
  }
}
```

## Retry Configuration

Configure automatic retries for transient failures:

```typescript
import { FlightSqlClient, RetryPolicy, retryPolicies } from "arrow-flight-sql-js"

// Use pre-configured policies
const client = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  retry: retryPolicies.default // 3 retries, exponential backoff
})

// Available policies
retryPolicies.none // No retries
retryPolicies.fast // 3 retries, 50ms initial, 500ms max
retryPolicies.default // 3 retries, 100ms initial, 10s max
retryPolicies.aggressive // 5 retries, 200ms initial, 30s max
retryPolicies.reconnection // 10 retries, 1s initial, 60s max

// Custom retry configuration
const customPolicy = new RetryPolicy({
  maxRetries: 5,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true, // Adds ±25% variance to prevent thundering herd
  isRetryable: (error) => {
    // Custom logic for which errors to retry
    return error.code === 14 || error.message.includes("timeout")
  }
})

const clientWithCustomRetry = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  retry: customPolicy
})
```

## Catalog Introspection

Explore database metadata with the catalog API:

```typescript
// List all catalogs
const catalogs = await client.getCatalogs()
console.log("Catalogs:", catalogs)

// List schemas in a catalog
const schemas = await client.getSchemas("my_catalog", "public%")

// List tables with filtering
const tables = await client.getTables({
  catalog: "my_catalog",
  dbSchemaFilterPattern: "public",
  tableNameFilterPattern: "user%",
  tableTypes: ["TABLE", "VIEW"],
  includeSchema: true // Include Arrow schema for each table
})

// Get table types supported by the server
const tableTypes = await client.getTableTypes()
// ["TABLE", "VIEW", "SYSTEM TABLE", "TEMPORARY TABLE", ...]

// Get primary key information
const primaryKeys = await client.getPrimaryKeys("users", "my_catalog", "public")
for (const pk of primaryKeys) {
  console.log(`Column ${pk.columnName} at position ${pk.keySequence}`)
}

// Get foreign key relationships
const exportedKeys = await client.getExportedKeys("users") // Keys referencing this table
const importedKeys = await client.getImportedKeys("orders") // Keys this table references
```

## Prepared Statements

Use prepared statements for parameterized queries:

```typescript
// Create a prepared statement
const stmt = await client.prepare("SELECT * FROM users WHERE id = ? AND status = ?")

try {
  // Bind parameters and execute
  const stream = await stmt.execute([userId, "active"])

  for await (const batch of stream) {
    console.log(`Received ${batch.numRows} rows`)
  }

  // Execute again with different parameters
  const stream2 = await stmt.execute([otherUserId, "pending"])
  // ...
} finally {
  // Always close prepared statements
  await stmt.close()
}
```

## API Reference

### FlightSqlClient

The main client for interacting with Flight SQL servers.

#### Constructor Options

| Option     | Type                     | Default | Description             |
| ---------- | ------------------------ | ------- | ----------------------- |
| `host`     | `string`                 | —       | Server hostname         |
| `port`     | `number`                 | `443`   | Server port             |
| `tls`      | `boolean`                | `true`  | Enable TLS              |
| `token`    | `string`                 | —       | Bearer token for auth   |
| `username` | `string`                 | —       | Basic auth username     |
| `password` | `string`                 | —       | Basic auth password     |
| `headers`  | `Record<string, string>` | —       | Custom metadata headers |
| `timeout`  | `number`                 | `30000` | Request timeout in ms   |

#### Methods

##### Query Execution

- `execute(query: string, options?): AsyncIterable<RecordBatch>` – Execute SQL, stream results
- `executeUpdate(query: string): Promise<number>` – Execute DML, return affected rows
- `prepare(query: string): Promise<PreparedStatement>` – Create prepared statement

##### Catalog Introspection

- `getCatalogs(): Promise<string[]>` – List available catalogs
- `getSchemas(catalog?, schemaPattern?): Promise<Schema[]>` – List schemas
- `getTables(options?): Promise<Table[]>` – List tables with filters
- `getTableTypes(): Promise<string[]>` – List table type names
- `getPrimaryKeys(table, catalog?, schema?): Promise<PrimaryKey[]>` – Get primary keys
- `getExportedKeys(table, catalog?, schema?): Promise<ForeignKey[]>` – Get exported foreign keys
- `getImportedKeys(table, catalog?, schema?): Promise<ForeignKey[]>` – Get imported foreign keys

##### Low-Level Flight Operations

- `getFlightInfo(descriptor): Promise<FlightInfo>` – Get flight metadata
- `doGet(ticket): AsyncIterable<RecordBatch>` – Fetch data by ticket
- `doPut(descriptor, stream): Promise<void>` – Upload Arrow data
- `doAction(type, body?): AsyncIterable<Result>` – Execute custom action

##### Connection Management

- `close(): Promise<void>` – Close connection
- `isConnected(): boolean` – Check connection status

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FlightSqlClient                      │
├─────────────────────────────────────────────────────────┤
│  Query Builder  │  Prepared Statements  │  Catalog API  │
├─────────────────────────────────────────────────────────┤
│                   Flight SQL Protocol                   │
│         (GetFlightInfo, DoGet, DoPut, DoAction)         │
├─────────────────────────────────────────────────────────┤
│                  Protocol Buffers Layer                 │
│            (FlightDescriptor, FlightInfo, etc.)         │
├─────────────────────────────────────────────────────────┤
│                    gRPC Transport                       │
│              (HTTP/2 + TLS + Auth Headers)              │
├─────────────────────────────────────────────────────────┤
│                   Connection Pool                       │
│        (Health checks, reconnection, backoff)           │
└─────────────────────────────────────────────────────────┘
```

## Compatibility

### Runtime Support

| Runtime            | Status       | Notes                  |
| ------------------ | ------------ | ---------------------- |
| Node.js 20+        | ✅ Supported | Primary target         |
| Bun                | ✅ Supported | Development runtime    |
| Deno               | 🔄 Planned   | Via npm compatibility  |
| Cloudflare Workers | 🔄 Planned   | Requires custom HTTP/2 |
| Browser            | 🔄 Planned   | Via gRPC-web proxy     |

### Flight SQL Servers

Tested against:

- Apache Arrow Flight SQL reference server
- DuckDB Flight SQL extension
- DataFusion Ballista
- Custom lakehouse implementations

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run unit tests only
bun test:unit

# Run integration tests (requires Flight SQL server)
bun test:integration

# Lint and format
bun run eslint:fix
bun run prettier:format
```

## Flight SQL Protocol Reference

This client implements the
[Arrow Flight SQL specification](https://arrow.apache.org/docs/format/FlightSql.html):

- **Flight SQL 13.0** – Current target version
- Full protobuf message support
- All standard actions (CreatePreparedStatement, ClosePreparedStatement, etc.)
- Catalog introspection commands
- Transaction support (where server supports it)

## License

MIT

## Related Projects

- [Apache Arrow](https://arrow.apache.org/) – The Arrow columnar format
- [Arrow Flight](https://arrow.apache.org/docs/format/Flight.html) – High-performance data transport
- [Arrow Flight SQL](https://arrow.apache.org/docs/format/FlightSql.html) – SQL over Flight

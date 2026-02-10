# Arrow Flight SQL JS

Arrow Flight SQL client for JavaScript and TypeScript runtimes.

> 📦 **Package:** `@qualithm/arrow-flight-sql-js`
>
> 📚 **[API Documentation](https://qualithm.github.io/arrow-flight-sql-js/)**

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
npm install @qualithm/arrow-flight-sql-js

# bun
bun add @qualithm/arrow-flight-sql-js

# pnpm
pnpm add @qualithm/arrow-flight-sql-js
```

## Quick Start

```typescript
import { FlightSqlClient } from "@qualithm/arrow-flight-sql-js"

// Create a client
const client = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  tls: true,
  auth: { type: "bearer", token: "your-bearer-token" }
})

// Connect to the server
await client.connect()

// Execute a query
const result = await client.query("SELECT * FROM my_table LIMIT 100")

// Process Arrow record batches
for await (const batch of result.stream()) {
  console.log(`Received ${batch.numRows} rows`)
  // batch is an Arrow RecordBatch
}

// Or collect all results into a table
const table = await result.collect()
console.log(`Total rows: ${table.numRows}`)

// Clean up
client.close()
```

## Connection Pooling

```typescript
import { FlightSqlPool } from "@qualithm/arrow-flight-sql-js"

// Create a pool with client and pool configuration
const pool = new FlightSqlPool(
  // Client options
  {
    host: "localhost",
    port: 31337,
    tls: false,
    auth: { type: "basic", username: "admin", password: "secret" }
  },
  // Pool options
  {
    minConnections: 2,
    maxConnections: 10,
    idleTimeoutMs: 30_000
  }
)

// Initialize the pool (creates minConnections)
await pool.initialize()

// Acquire a client from the pool
const client = await pool.acquire()
try {
  const result = await client.query("SELECT 1")
  const table = await result.collect()
  // ... process results
} finally {
  // Return to pool
  pool.release(client)
}

// Or use the convenience method (handles acquire/release automatically)
await pool.withConnection(async (client) => {
  const result = await client.query("SELECT * FROM users")
  return result.collect()
})

// Graceful shutdown
await pool.close()
```

## Real-Time Subscriptions

Subscribe to live data updates using the `DoExchange` bidirectional streaming protocol:

```typescript
import { FlightSqlClient, SubscriptionMode } from "@qualithm/arrow-flight-sql-js"

const client = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  tls: true,
  auth: { type: "bearer", token: "your-bearer-token" }
})

await client.connect()

// Subscribe to real-time updates
const subscription = client.subscribe("SELECT * FROM events WHERE status = 'pending'", {
  mode: SubscriptionMode.ChangesOnly, // Full | ChangesOnly | Tail
  heartbeatMs: 30_000 // Server heartbeat interval
})

// Consume batches as they arrive
for await (const batch of subscription) {
  console.log(`Received ${batch.numRows} rows`)
}

// Or with cancellation
const controller = new AbortController()
const cancelableSubscription = client.subscribe(query, {
  signal: controller.signal,
  autoReconnect: true,
  maxReconnectAttempts: 10
})

// Later: cancel the subscription
controller.abort()

// Or manually unsubscribe
await cancelableSubscription.unsubscribe()
```

### Subscription Options

| Option                 | Default       | Description                                        |
| ---------------------- | ------------- | -------------------------------------------------- |
| `mode`                 | `ChangesOnly` | Subscription mode (Full, ChangesOnly, Tail)        |
| `heartbeatMs`          | `30000`       | Server heartbeat interval in milliseconds          |
| `signal`               | -             | AbortSignal for cancellation                       |
| `autoReconnect`        | `true`        | Auto-reconnect on connection loss                  |
| `maxReconnectAttempts` | `10`          | Maximum reconnection attempts                      |
| `reconnectDelayMs`     | `1000`        | Initial reconnect delay                            |
| `maxReconnectDelayMs`  | `30000`       | Maximum reconnect delay (with exponential backoff) |

### Low-Level DoExchange

For custom bidirectional protocols:

```typescript
const exchange = client.doExchange({
  type: DescriptorType.CMD,
  cmd: new TextEncoder().encode("CUSTOM_COMMAND")
})

// Send data to server
await exchange.send({
  dataHeader: new Uint8Array(),
  dataBody: new Uint8Array(),
  appMetadata: new TextEncoder().encode(JSON.stringify({ action: "subscribe" }))
})

// Receive data from server
for await (const data of exchange) {
  console.log("Received:", data)
}

// Half-close (signal end of client stream)
await exchange.end()
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
} from "@qualithm/arrow-flight-sql-js"

// Console handler for development
const client = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  tls: false,
  auth: { type: "none" },
  metrics: new ConsoleMetricsHandler()
})
// Output: [FlightSQL Metrics] ✓ query success (42ms)

// In-memory handler for testing
const metricsHandler = new InMemoryMetricsHandler()
const testClient = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  tls: false,
  auth: { type: "none" },
  metrics: metricsHandler
})

// Query metrics after operations
await testClient.connect()
const result = await testClient.query("SELECT 1")
await result.collect()
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
} from "@qualithm/arrow-flight-sql-js"

try {
  const result = await client.query("SELECT * FROM missing_table")
  await result.collect()
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
import { FlightSqlClient, RetryPolicy, retryPolicies } from "@qualithm/arrow-flight-sql-js"

// Use pre-configured policies
const client = new FlightSqlClient({
  host: "localhost",
  port: 31337,
  tls: false,
  auth: { type: "bearer", token: "my-token" },
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
  tls: false,
  auth: { type: "bearer", token: "my-token" },
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
  // Execute the query (returns a QueryResult)
  const result = await stmt.executeQuery()

  for await (const batch of result.stream()) {
    console.log(`Received ${batch.numRows} rows`)
  }

  // Or collect all results
  const table = await result.collect()
} finally {
  // Always close prepared statements
  await stmt.close()
}
```

## API Reference

### FlightSqlClient

The main client for interacting with Flight SQL servers.

#### Constructor Options

| Option             | Type                     | Default | Description                     |
| ------------------ | ------------------------ | ------- | ------------------------------- |
| `host`             | `string`                 | —       | Server hostname                 |
| `port`             | `number`                 | —       | Server port                     |
| `tls`              | `boolean`                | `true`  | Enable TLS                      |
| `auth`             | `AuthConfig`             | —       | Authentication configuration    |
| `credentials`      | `ChannelCredentials`     | —       | Custom gRPC channel credentials |
| `metadata`         | `Record<string, string>` | —       | Custom metadata headers         |
| `connectTimeoutMs` | `number`                 | `30000` | Connection timeout in ms        |
| `requestTimeoutMs` | `number`                 | `60000` | Request timeout in ms           |

##### AuthConfig

```typescript
type AuthConfig =
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "none" }
```

#### Methods

##### Query Execution

- `query(query: string, options?): Promise<QueryResult>` – Execute SQL, returns result with
  `stream()` and `collect()` methods
- `execute(query: string, options?): Promise<FlightInfo>` – _(deprecated)_ Execute SQL, return
  flight info
- `executeUpdate(query: string): Promise<bigint>` – Execute DML, return affected rows
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

- `connect(): Promise<void>` – Establish connection and authenticate
- `close(): void` – Close connection and release resources
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
bun run lint:fix
bun run format:fix

# Generate API documentation
bun run docs
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

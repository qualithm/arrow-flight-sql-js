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
- `getTables(catalog?, schema?, tablePattern?): Promise<Table[]>` – List tables
- `getTableTypes(): Promise<string[]>` – List table type names
- `getPrimaryKeys(catalog, schema, table): Promise<PrimaryKey[]>` – Get primary keys

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

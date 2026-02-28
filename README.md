# Arrow Flight SQL

[![CI](https://github.com/qualithm/arrow-flight-sql-js/actions/workflows/ci.yaml/badge.svg)](https://github.com/qualithm/arrow-flight-sql-js/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/qualithm/arrow-flight-sql-js/graph/badge.svg)](https://codecov.io/gh/qualithm/arrow-flight-sql-js)
[![npm](https://img.shields.io/npm/v/@qualithm/arrow-flight-sql)](https://www.npmjs.com/package/@qualithm/arrow-flight-sql)

Arrow Flight SQL client for JavaScript and TypeScript runtimes.

SQL-specific functionality on top of Arrow Flight for database interactions. Built on
[`@qualithm/arrow-flight`](https://github.com/qualithm/arrow-flight-js) as a peer dependency.

## Features

- Full Arrow Flight SQL protocol support
- Query execution with Apache Arrow result sets
- Prepared statements with parameter binding
- Transaction support (begin, commit, rollback)
- Database metadata queries (catalogs, schemas, tables, keys)
- Query cancellation
- TypeScript-first with comprehensive type definitions
- Cross-runtime: Bun, Node.js 20+, Deno
- Streaming results with async iterables
- Comprehensive error handling with typed error codes
- ESM-only, tree-shakeable

## Installation

```bash
npm install @qualithm/arrow-flight-sql @qualithm/arrow-flight apache-arrow
# or
bun add @qualithm/arrow-flight-sql @qualithm/arrow-flight apache-arrow
```

> **Note:** `@qualithm/arrow-flight` is a peer dependency and must be installed separately.

## Quick Start

```typescript
import { createFlightSqlClient, queryToTable } from "@qualithm/arrow-flight-sql"

const client = await createFlightSqlClient({
  host: "localhost",
  port: 8815,
  tls: false
})

const table = await queryToTable(client, "SELECT * FROM users WHERE active = true")
console.log("Rows:", table.numRows)

for (const row of table) {
  console.log(JSON.stringify(row))
}

client.close()
```

See the [examples](./examples) directory for complete, runnable demonstrations.

## Examples

| Example                                                     | Description                                    |
| ----------------------------------------------------------- | ---------------------------------------------- |
| [basic-query.ts](./examples/basic-query.ts)                 | Simple query execution with `queryToTable()`   |
| [authentication.ts](./examples/authentication.ts)           | Basic auth, bearer tokens, connection patterns |
| [updates.ts](./examples/updates.ts)                         | INSERT, UPDATE, DELETE operations              |
| [streaming-results.ts](./examples/streaming-results.ts)     | Process large datasets with `iterateResults()` |
| [prepared-statements.ts](./examples/prepared-statements.ts) | Parameterised queries and updates              |
| [transactions.ts](./examples/transactions.ts)               | Atomic operations with commit/rollback         |
| [metadata-queries.ts](./examples/metadata-queries.ts)       | Catalogs, schemas, tables, keys, SQL info      |
| [cancellation.ts](./examples/cancellation.ts)               | Cancel long-running queries                    |
| [error-handling.ts](./examples/error-handling.ts)           | `FlightSqlError` and `FlightError` handling    |

## API Reference

### Query Execution

| Method                    | Description                         |
| ------------------------- | ----------------------------------- |
| `query()`                 | Execute a SQL query, get FlightInfo |
| `executeUpdate()`         | Execute INSERT/UPDATE/DELETE        |
| `executePreparedQuery()`  | Execute a prepared statement query  |
| `executePreparedUpdate()` | Execute a prepared statement update |

### Prepared Statements

| Method                      | Description                            |
| --------------------------- | -------------------------------------- |
| `createPreparedStatement()` | Create a new prepared statement        |
| `closePreparedStatement()`  | Close and release a prepared statement |
| `bindParameters()`          | Bind parameter values                  |

### Transactions

| Method               | Description                 |
| -------------------- | --------------------------- |
| `beginTransaction()` | Start a new transaction     |
| `commit()`           | Commit a transaction        |
| `rollback()`         | Roll back a transaction     |
| `endTransaction()`   | End transaction (low-level) |

### Metadata

| Method                | Description                          |
| --------------------- | ------------------------------------ |
| `getCatalogs()`       | List available catalogs              |
| `getDbSchemas()`      | List database schemas                |
| `getTables()`         | List tables with optional filtering  |
| `getTableTypes()`     | List supported table types           |
| `getPrimaryKeys()`    | Get primary key info for a table     |
| `getExportedKeys()`   | Get foreign keys referencing a table |
| `getImportedKeys()`   | Get foreign keys from a table        |
| `getCrossReference()` | Get foreign keys between two tables  |
| `getSqlInfo()`        | Get SQL dialect/server capabilities  |
| `getXdbcTypeInfo()`   | Get supported data types             |

### Result Utilities

| Function              | Description                           |
| --------------------- | ------------------------------------- |
| `queryToTable()`      | Execute query, return Arrow Table     |
| `flightInfoToTable()` | Convert FlightInfo to Arrow Table     |
| `ticketToTable()`     | Get single ticket data as Arrow Table |
| `iterateResults()`    | Stream results as async iterable      |

### Cancellation

| Method               | Description            |
| -------------------- | ---------------------- |
| `cancelFlightInfo()` | Cancel a running query |

## Development

### Prerequisites

- [Bun](https://bun.sh/) (recommended), Node.js 20+, or [Deno](https://deno.land/)

### Setup

```bash
bun install
```

### Building

```bash
bun run build
```

### Testing

```bash
# Unit tests
bun test

# Integration tests (requires running Arrow Flight SQL server)
FLIGHT_HOST=localhost FLIGHT_PORT=50051 bun run test:integration
```

### Benchmarks

```bash
# Requires running Arrow Flight SQL server
FLIGHT_HOST=localhost FLIGHT_PORT=50051 bun run bench
```

### Linting & Formatting

```bash
bun run lint
bun run format
bun run typecheck
```

## License

Apache-2.0

# Examples

This directory contains example scripts demonstrating common use cases for the Arrow Flight SQL JS
client.

## Prerequisites

1. A running Flight SQL server (e.g., DataFusion, Dremio, Apache Arrow Flight SQL server)
2. Install dependencies: `bun install`

## Running Examples

```bash
# Basic query execution
bun run examples/basic-query.ts

# Authentication patterns
bun run examples/authentication.ts

# TLS/mTLS connections (production)
bun run examples/tls-connection.ts

# INSERT, UPDATE, DELETE operations
bun run examples/updates.ts

# Streaming large result sets
bun run examples/streaming-results.ts

# Prepared statements
bun run examples/prepared-statements.ts

# Transaction handling
bun run examples/transactions.ts

# Database metadata queries
bun run examples/metadata-queries.ts

# Query cancellation
bun run examples/cancellation.ts

# Error handling patterns
bun run examples/error-handling.ts
```

## Example Overview

### [basic-query.ts](basic-query.ts)

Simple query execution returning results as an Arrow Table. Demonstrates:

- Connecting to a Flight SQL server
- Executing a query with `queryToTable()`
- Iterating over results

### [authentication.ts](authentication.ts)

Different authentication methods for connecting. Demonstrates:

- No authentication (local development)
- Basic authentication (username/password)
- Bearer token authentication (JWT/OAuth)
- Two-step connection pattern

### [tls-connection.ts](tls-connection.ts)

TLS and mTLS connections for production environments. Demonstrates:

- TLS with system CA certificates
- Custom CA certificates for self-signed/private CAs
- Mutual TLS (mTLS) with client certificates
- Certificate verification options

### [updates.ts](updates.ts)

Executing data modification statements. Demonstrates:

- INSERT statements
- UPDATE statements
- DELETE statements
- Using call options with updates

### [streaming-results.ts](streaming-results.ts)

Processing large result sets without loading everything into memory. Demonstrates:

- Getting FlightInfo metadata before fetching data
- Streaming results with `iterateResults()`
- Processing batches incrementally
- Fetching individual endpoints with `ticketToTable()`
- Parallel endpoint fetching for distributed queries

### [prepared-statements.ts](prepared-statements.ts)

Creating and executing prepared statements with parameter binding. Demonstrates:

- Creating prepared statements with `createPreparedStatement()`
- Inspecting parameter and dataset schemas
- Building Arrow IPC parameter data
- Binding parameters with `bindParameters()`
- Re-executing with different parameter values
- Creating prepared statements within transactions
- Cleaning up with `closePreparedStatement()`

### [transactions.ts](transactions.ts)

Atomic operations with transactions. Demonstrates:

- Beginning transactions with `beginTransaction()`
- Executing updates within a transaction
- Querying uncommitted changes with `query()` and `transactionId`
- Committing with `commit()`
- Rolling back with `rollback()` on error

### [metadata-queries.ts](metadata-queries.ts)

Querying database metadata. Demonstrates:

- Listing catalogs, schemas, and tables
- Getting table types
- Querying primary and foreign keys
- Getting server SQL capabilities
- Getting supported data types

### [cancellation.ts](cancellation.ts)

Cancelling long-running queries. Demonstrates:

- Starting a query and getting FlightInfo
- Cancelling before fetching results with `cancelFlightInfo()`
- Handling different cancellation statuses

### [error-handling.ts](error-handling.ts)

Handling various error conditions. Demonstrates:

- Distinguishing `FlightSqlError` from `FlightError`
- Using type guard methods
- Appropriate error recovery strategies

## Configuration

Most examples connect to `localhost:8815` by default. Modify the connection options to match your
server:

```typescript
const client = await createFlightSqlClient({
  host: "your-server.example.com",
  port: 443,
  tls: true,
  auth: { type: "bearer", token: "your-token" }
})
```

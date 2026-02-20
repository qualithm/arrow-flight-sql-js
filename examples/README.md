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

# Authentication and TLS connections
bun run examples/authentication.ts

# INSERT, UPDATE, DELETE operations
bun run examples/updates.ts

# Streaming large result sets and cancellation
bun run examples/streaming-results.ts

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

Authentication methods and TLS configurations. Demonstrates:

- No authentication (local development)
- Basic authentication (username/password)
- Bearer token authentication (JWT/OAuth)
- TLS with system CA certificates
- Custom CA certificates for self-signed/private CAs
- Mutual TLS (mTLS) with client certificates

### [updates.ts](updates.ts)

Executing data modification statements. Demonstrates:

- INSERT statements
- UPDATE statements
- DELETE statements
- Using call options with updates

### [streaming-results.ts](streaming-results.ts)

Processing large result sets and managing queries. Demonstrates:

- Getting FlightInfo metadata before fetching data
- Streaming results with `iterateResults()`
- Processing batches incrementally
- Fetching individual endpoints with `ticketToTable()`
- Parallel endpoint fetching for distributed queries
- Cancelling queries with `cancelFlightInfo()`

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

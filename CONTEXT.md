# CONTEXT.md

> **This is the single source of truth for this repository.**
>
> When CONTEXT.md conflicts with any other document (README, code comments), CONTEXT.md is correct.
> Update other documents to match, not the reverse.

---

## System Intent

A standards-compliant Arrow Flight SQL client for JavaScript/TypeScript. This library provides a
native JavaScript implementation for communicating with Arrow Flight SQL servers, handling all
aspects of the protocol including:

- **gRPC/HTTP2 Transport** – Standards-based communication with Flight SQL servers
- **Protocol Buffers** – Full protobuf serialization/deserialization for Flight SQL messages
- **Connection Management** – Robust connection handling with automatic reconnection
- **Connection Pooling** – Efficient reuse of connections for high-throughput scenarios
- **Arrow IPC** – Streaming and batch Arrow data over the wire
- **Query Execution** – Execute SQL queries, prepared statements, and catalog introspection
- **Authentication** – Support for bearer tokens, basic auth, and custom auth handlers

### Design Philosophy

This client is modeled on the canonical Arrow Flight SQL implementations:

1. **Apache Arrow Flight SQL (Java)** – The reference implementation
2. **Apache Arrow Flight SQL (C++)** – High-performance native implementation
3. **Apache Arrow Flight SQL (Go)** – Clean, idiomatic patterns

We adopt the best patterns from each:

- Java's comprehensive API surface and error handling
- C++'s performance-oriented streaming patterns
- Go's connection pooling and context management

### Target Runtimes

- Node.js 20+ (primary)
- Bun (primary, used for development)
- Edge runtimes with HTTP/2 support (Cloudflare Workers with custom builds)
- Browser (where gRPC-web or HTTP/2 is available)

### Relationship to Qualithm Lakehouse

This library is developed as part of the Qualithm ecosystem (tracked in `lakehouse/CONTEXT.md` M4)
but is designed as a **standalone, general-purpose** Arrow Flight SQL client. The lakehouse is one
consumer; the library must work with any compliant Flight SQL server.

---

## Current Reality

**Status: Scaffolding Phase**

The project structure has been established with placeholder modules:

- `src/client.ts` – Main `FlightSqlClient` class (not yet implemented)
- `src/pool.ts` – Connection pool implementation (not yet implemented)
- `src/types.ts` – TypeScript type definitions for Flight SQL (not yet implemented)
- `src/query-builder.ts` – Query builder utilities (not yet implemented)
- `src/retry.ts` – Retry logic with backoff (not yet implemented)
- `src/errors.ts` – Custom error types (not yet implemented)
- `src/index.ts` – Public API exports (not yet implemented)

### Dependencies (To Be Added)

- `@grpc/grpc-js` or `@connectrpc/connect` – gRPC transport
- `apache-arrow` – Arrow IPC format handling
- Protobuf runtime (protobuf-es or similar)

---

## Locked Decisions

| ID  | Decision                                       | Rationale                                                     |
| --- | ---------------------------------------------- | ------------------------------------------------------------- |
| L1  | TypeScript-first with full type coverage       | Type safety is critical for a protocol library                |
| L2  | ESM-only package                               | Modern standards, tree-shaking support                        |
| L3  | Zero runtime dependencies where possible       | Minimize bundle size, reduce supply chain risk                |
| L4  | Model API on official Arrow Flight SQL clients | Consistency with ecosystem, proven patterns                   |
| L5  | Streaming-first design                         | Arrow Flight is inherently streaming; batch is a special case |
| L6  | Publish as `@qualithm/arrow-flight-sql`        | Scoped package under Qualithm organization                    |
| L7  | Server-agnostic implementation                 | Must work with any Flight SQL server, not just Qualithm       |

---

## Open Decisions & Risks

### Open Decisions

| ID  | Question                       | Context                                                         |
| --- | ------------------------------ | --------------------------------------------------------------- |
| O1  | gRPC library choice            | `@grpc/grpc-js` vs `@connectrpc/connect` vs custom HTTP/2       |
| O2  | Protobuf approach              | Generate from official .proto files vs hand-written types       |
| O3  | Arrow library integration      | Use `apache-arrow` npm package vs minimal custom IPC reader     |
| O4  | Browser support strategy       | gRPC-web proxy required, or HTTP/2 direct where supported       |
| O5  | Connection pool implementation | Generic pool vs custom implementation for Flight-specific needs |

### Risks

| ID  | Risk                                  | Impact                                        | Mitigation                                                 |
| --- | ------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| R1  | gRPC/HTTP2 browser support is limited | Reduced browser compatibility                 | Provide gRPC-web adapter option                            |
| R2  | Arrow IPC format complexity           | Implementation bugs, interop issues           | Extensive integration testing against multiple servers     |
| R3  | Protocol version drift                | Incompatibility with newer Flight SQL servers | Track upstream proto changes, version compatibility matrix |
| R4  | Large result set memory pressure      | OOM in constrained environments               | Streaming-first API, backpressure support                  |

---

## Work In Flight

> Claim work before starting. Include start timestamp. Remove within 24 hours of completion.

| ID  | Agent | Started | Task                 | Files |
| --- | ----- | ------- | -------------------- | ----- |
| —   | —     | —       | No work in progress. | —     |

---

## Next Milestones

### M1: Core Protocol Foundation

- [ ] Define TypeScript types for Flight SQL messages
- [ ] Implement protobuf serialization/deserialization
- [ ] Basic gRPC transport layer
- [ ] Handshake and authentication flow

### M2: Query Execution

- [ ] `execute()` – Execute SQL statements returning Arrow streams
- [ ] `getFlightInfo()` – Query metadata retrieval
- [ ] `doGet()` – Fetch Arrow record batches
- [ ] `doPut()` – Upload Arrow data
- [ ] Prepared statement support

### M3: Connection Management

- [ ] Connection pooling with configurable limits
- [ ] Automatic reconnection with exponential backoff
- [ ] Health checking and connection validation
- [ ] Graceful shutdown

### M4: Catalog Introspection

- [ ] `getCatalogs()` – List available catalogs
- [ ] `getSchemas()` – List schemas in catalog
- [ ] `getTables()` – List tables with filtering
- [ ] `getTableTypes()` – List table type names
- [ ] `getPrimaryKeys()` / `getExportedKeys()` / `getImportedKeys()`

### M5: Production Readiness

- [ ] Comprehensive error types and handling
- [ ] Metrics and observability hooks
- [ ] Full test coverage (unit + integration)
- [ ] Documentation and examples
- [ ] Performance benchmarks

### M6: npm Publication

- [ ] Pass Flight SQL conformance tests
- [ ] Verify interop with multiple Flight SQL servers (lakehouse, DuckDB, Dremio)
- [ ] Publish `@qualithm/arrow-flight-sql` to npm
- [ ] Full API documentation

---

## Learnings

> Append-only. Never edit or delete existing entries.

| Date       | Learning                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| 2026-01-26 | Project initialized. Modeling on Java/C++/Go reference implementations for API consistency. |

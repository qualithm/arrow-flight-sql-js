# CONTEXT.md

> **Single source of truth.** When CONTEXT.md conflicts with other docs, CONTEXT.md is correct.

---

## System Intent

Standards-compliant Arrow Flight SQL client for JavaScript/TypeScript. Native implementation for
gRPC/HTTP2 transport, protobuf serialization, connection pooling, Arrow IPC streaming, query
execution, prepared statements, catalog introspection, and authentication.

**Design:** Modeled on Java (API surface), C++ (streaming patterns), Go (pooling) implementations.

**Runtimes:** Node.js 20+, Bun, Edge (Cloudflare Workers), Browser (gRPC-web).

**Scope:** Standalone library; works with any Flight SQL server (Qualithm Lakehouse is one
consumer).

---

## Current Reality

**Status: Complete** — Production-ready client with full cross-runtime support.

### Core Modules

| Module                  | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `client.ts`             | FlightSqlClient, QueryResult, Subscription  |
| `pool.ts`               | Connection pooling with health checks       |
| `retry.ts`              | Exponential backoff with jitter             |
| `metrics.ts`            | Pluggable observability handlers            |
| `proto.ts`              | Manual protobuf encoding/decoding           |
| `arrow.ts`              | Arrow IPC parsing utilities                 |
| `errors.ts`             | Custom errors with gRPC status mapping      |
| `query-builder.ts`      | Fluent SQL query builder                    |
| `runtime.ts`            | Runtime detection (Node/Bun/Deno/Browser)   |
| `transport.ts`          | Transport abstraction interface             |
| `transport-grpc-js.ts`  | gRPC-JS transport for Node.js/Bun           |
| `transport-grpc-web.ts` | gRPC-Web transport for Browser/Deno/Workers |

### Tests

Unit: 292 (errors: 27, retry: 31, proto: 43, metrics: 38, subscription: 26, query-builder: 80,
runtime: 20, transport: 15, transport-grpc-web: 12). Integration: 29.

### Completed Milestones

| M#  | Name            | Summary                                                       |
| --- | --------------- | ------------------------------------------------------------- |
| M1  | Core Protocol   | Types, protobuf, gRPC transport, auth                         |
| M2  | Query Execution | query/execute, FlightInfo, DoGet/DoPut, prepared statements   |
| M3  | Connection Mgmt | Pooling, retry with backoff, health checks, graceful shutdown |
| M4  | Catalog         | getCatalogs/Schemas/Tables/TableTypes, key introspection      |
| M5  | Production      | Error types, metrics hooks, 234 tests, benchmarks             |
| M6  | npm Publish     | Integration tests, npm config, TypeDoc, GitHub Pages          |
| M7  | Subscriptions   | DoExchange, subscribe() API, heartbeats, reconnection         |
| M8  | Cross-Runtime   | Transport abstraction, runtime detection, Bun/Node CI matrix  |
| M9  | Browser & Deno  | gRPC-web transport, Playwright tests, Deno CI, documentation  |

---

## Locked Decisions

1. **TypeScript-first** — Type safety critical for protocol library
2. **ESM-only** — Modern standards, tree-shaking
3. **Minimal runtime deps** — Bundle size, supply chain risk
4. **Model on official clients** — Ecosystem consistency (Java/C++/Go patterns)
5. **Streaming-first** — Arrow Flight is inherently streaming
6. **Publish as @qualithm/arrow-flight-sql-js** — Scoped package
7. **Server-agnostic** — Works with any Flight SQL server
8. **@grpc/grpc-js transport** — Mature Node.js gRPC implementation
9. **Types from .proto files** — Protocol compliance
10. **apache-arrow npm package** — Official Arrow IPC implementation
11. **gRPC-web for Browser/Deno** — Native HTTP/2 lacks browser support
12. **Custom connection pool** — Flight-specific health checks, no deps

---

## Open Decisions & Risks

### Risks

| ID  | Risk                             | Impact                                        | Mitigation                                                 |
| --- | -------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| R1  | Arrow IPC format complexity      | Implementation bugs, interop issues           | Extensive integration testing against multiple servers     |
| R2  | Protocol version drift           | Incompatibility with newer Flight SQL servers | Track upstream proto changes, version compatibility matrix |
| R3  | Large result set memory pressure | OOM in constrained environments               | Streaming-first API, backpressure support                  |

---

## Work In Flight

> Claim work before starting. Include start timestamp. Remove within 24 hours of completion.

| ID  | Agent | Started | Task                 | Files |
| --- | ----- | ------- | -------------------- | ----- |
| —   | —     | —       | No work in progress. | —     |

---

## Learnings

> Append-only. Never edit or delete existing entries.

- **2026-01-26**: Project initialized. Modeling on Java/C++/Go reference implementations for API
  consistency.
- **2026-01-26**: Manual protobuf encoding in proto.ts avoids full runtime dependency. Wire format
  is varint + length-delimited.
- **2026-01-26**: ESLint `erasableSyntaxOnly` requires const objects instead of enums (`as const`
  pattern).
- **2026-01-26**: gRPC streams in @grpc/grpc-js are async iterable—no manual stream-to-iterator
  conversion needed.
- **2026-01-26**: Arrow IPC messages use custom framing (continuation byte + metadata length) vs
  standard file format.
- **2026-01-27**: Connection pool uses object wrapper pattern for error state tracking (TypeScript
  event handler mutation).
- **2026-01-27**: RetryPolicy class provides pre-built policies (none, fast, default, aggressive,
  reconnection).
- **2026-01-27**: Catalog methods use generic fetchCatalogResults helper with field mappers for
  typed results.
- **2026-01-27**: MetricsHandler interface enables pluggable observability with standard metric
  names.
- **2026-01-27**: Bun test runner with describe/test/expect pattern.
- **2026-01-27**: Integration tests revealed lakehouse gaps: catalog commands as raw SQL, no
  prepared statements.
- **2026-01-27**: npm publish requires main, module, types, exports, files in package.json.
- **2026-02-04**: Schema parsing: `RecordBatchReader.from()` expects IPC stream, but
  FlightInfo.schema is single message. Use `MessageReader`.
- **2026-02-05**: Fixed schema with `MessageReader.readSchema()`. FlightData.dataHeader needs
  continuation token + length prefix.
- **2026-02-09**: Server wiring correct: arrow-flight v57 blanket impl dispatches FlightService to
  FlightSqlService trait.
- **2026-02-09**: DoExchange uses ClientDuplexStream. Subscription handles heartbeats, reconnection,
  AbortSignal.
- **2026-02-09**: QueryBuilder: fluent API, SQL injection protection, JOINs, WHERE, ORDER BY, LIMIT,
  GROUP BY, parameterized queries.
- **2026-02-11**: runtime.ts detects Bun/Deno/Node/Browser/Worker. Bun detected before Node despite
  compatibility layer.
- **2026-02-11**: client.ts refactored to FlightTransport abstraction—no direct @grpc/grpc-js
  imports.
- **2026-02-11**: Fixed prepared statements: ActionCreatePreparedStatementResult wrapped in protobuf
  Any. Added unwrapAny().
- **2026-02-12**: gRPC-web transport: manual 5-byte framing, trailer parsing, fetch-based. No client
  streaming per spec.
- **2026-02-13**: Added getSqlInfo(), getXdbcTypeInfo(), getCrossReference() catalog commands.
- **2026-02-13**: Proto files synced with upstream Apache Arrow. Changes are documentation-only
  (grammar fixes, enhanced Location message docs for HTTP URIs). Wire format unchanged.

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

**Status: M1–M8 In Progress** — Production-ready client, cross-runtime compatibility in progress.

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

Unit: 281 tests (errors: 27, retry: 31, proto: 32, metrics: 38, subscription: 26, query-builder: 80,
runtime: 20, transport: 15, transport-grpc-web: 12) Integration: 24 pass

### Dependencies

`@grpc/grpc-js` 1.14.3 · `@grpc/proto-loader` 0.8.0 · `apache-arrow` 21.1.0

---

## Locked Decisions

| ID  | Decision                                       | Rationale                                                      |
| --- | ---------------------------------------------- | -------------------------------------------------------------- |
| L1  | TypeScript-first with full type coverage       | Type safety is critical for a protocol library                 |
| L2  | ESM-only package                               | Modern standards, tree-shaking support                         |
| L3  | Zero runtime dependencies where possible       | Minimize bundle size, reduce supply chain risk                 |
| L4  | Model API on official Arrow Flight SQL clients | Consistency with ecosystem, proven patterns                    |
| L5  | Streaming-first design                         | Arrow Flight is inherently streaming; batch is a special case  |
| L6  | Publish as `@qualithm/arrow-flight-sql-js`     | Scoped package under Qualithm organization                     |
| L7  | Server-agnostic implementation                 | Must work with any Flight SQL server, not just Qualithm        |
| L8  | Use `@grpc/grpc-js` for gRPC transport         | Mature, well-maintained, Node.js native gRPC implementation    |
| L9  | Generate types from official .proto files      | Ensures protocol compliance, tracks upstream changes           |
| L10 | Use `apache-arrow` npm package                 | Official Arrow implementation, battle-tested, full IPC support |

---

## Open Decisions & Risks

### Open Decisions

| ID  | Question                       | Context                                                         |
| --- | ------------------------------ | --------------------------------------------------------------- |
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

## Milestones

### Completed ✅

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

## Learnings

> Append-only. Never edit or delete existing entries.

| Date       | Learning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-01-26 | Project initialized. Modeling on Java/C++/Go reference implementations for API consistency.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-01-26 | Used manual protobuf encoding in proto.ts to avoid full protobuf runtime dependency. Wire format is simple for Flight SQL commands (varint + length-delimited).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-01-26 | ESLint with `erasableSyntaxOnly` requires const objects instead of enums (e.g., DescriptorType uses `as const` pattern).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-01-26 | gRPC streams in @grpc/grpc-js are async iterable, avoiding need for manual stream-to-iterator conversion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-01-26 | Arrow IPC messages use custom framing (continuation byte + metadata length) that differs from standard Arrow file format.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-01-27 | Connection pool uses object wrapper pattern for error state tracking (allows TypeScript to understand mutation from event handlers).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-01-27 | RetryPolicy class provides reusable retry configuration with pre-built policies (none, fast, default, aggressive, reconnection).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-01-27 | Catalog introspection methods use a generic fetchCatalogResults helper that parses Arrow IPC data and maps rows to typed objects using field mappers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-01-27 | MetricsHandler interface enables pluggable observability (NoopMetricsHandler, ConsoleMetricsHandler, InMemoryMetricsHandler) with standard metric names.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-01-27 | Unit tests using Bun test runner with describe/test/expect pattern. Tests for errors, retry, proto, and metrics achieve 129 total unit test coverage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-01-27 | Integration tests against lakehouse revealed Flight SQL feature gaps: catalog introspection commands treated as raw SQL, prepared statements not implemented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-01-27 | npm publish config requires: main, module, types, exports, files fields in package.json. tsconfig.build.json uses bundler resolution for ESM compatibility.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-02-04 | Integration test re-run confirmed lakehouse server issues. Schema parsing fails because `tryParseSchema()` uses `RecordBatchReader.from()` which expects a full IPC stream, but FlightInfo.schema is a single IPC message containing only schema. Need to use `MessageReader` to parse schema-only messages. Server-side issues: `FlightServiceServer` used instead of `FlightSqlServiceServer`, so catalog commands and prepared statements aren't dispatched to `FlightSqlService` trait methods.                                                                                                                                                                                                                                                                                                                                   |
| 2026-02-05 | Fixed schema parsing: `parseSchema()` now uses `MessageReader.readSchema()` for schema-only IPC messages. Fixed `stream()`: FlightData.dataHeader is raw flatbuffer without IPC framing; added continuation token (0xFFFFFFFF) + length prefix before parsing with `RecordBatchReader`. Integration tests now 12 pass, 7 skip (server-blocked). npm publish workflow added to release.yaml. Removed debug scripts.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-02-09 | Investigated lakehouse server wiring. **Conclusion: Server is correct.** arrow-flight v57 has blanket `impl FlightService for T where T: FlightSqlService + Send` (server.rs lines 578-580 in arrow-flight source), so `FlightServiceServer::new(LakehouseFlightSqlService)` correctly dispatches Flight SQL commands to trait methods. `FlightSqlServiceServer` does NOT exist — earlier analysis was based on incorrect assumptions. The 7 skipped integration tests are likely client-side issues (protobuf encoding, handle format) not server-side. Next: add wire-level debug logging.                                                                                                                                                                                                                                          |
| 2026-02-09 | Implemented M7 (Push Subscriptions via DoExchange). DoExchange uses `ClientDuplexStream` for bidirectional streaming. Subscription class handles: (1) JSON-encoded subscribe/unsubscribe commands in `appMetadata`, (2) heartbeat processing, (3) automatic reconnection with exponential backoff + jitter, (4) AbortSignal cancellation. ExchangeStream interface provides low-level send/receive/cancel. Added 26 unit tests for subscription types and 5 integration tests. Total unit tests now 154.                                                                                                                                                                                                                                                                                                                              |
| 2026-02-09 | Implemented `QueryBuilder` class in `src/query-builder.ts` with fluent API for SELECT, INSERT, UPDATE, DELETE queries. Includes SQL injection protection via identifier/string escaping, support for JOINs, WHERE conditions, ORDER BY, LIMIT/OFFSET, GROUP BY/HAVING, and parameterized queries for prepared statements. Added 80 unit tests. Also added performance benchmarks in `benchmarks/` directory covering proto encoding, query builder, and retry logic throughput (e.g., 5M+ ops/s for simple escaping, 200K+ ops/s for proto encoding).                                                                                                                                                                                                                                                                                 |
| 2026-02-11 | Started M8 (Cross-Runtime Compatibility). Created `runtime.ts` with detectRuntime() that identifies Bun/Deno/Node/Browser/Worker environments using global checks (`Bun` in globalThis, `Deno` in globalThis, etc.). Bun is detected before Node.js despite Bun having Node.js compatibility layer. Created `transport.ts` with FlightTransport type defining runtime-agnostic gRPC operations. Created `transport-grpc-js.ts` with GrpcJsTransport class implementing FlightTransport for Node.js/Bun using @grpc/grpc-js. Added conditional exports in package.json for runtime-specific paths. CI matrix now tests Bun 1.0/1.1/latest and Node 20/22. Bundle analysis script verifies no Node-specific imports leak into universal modules. Deno and browser transports deferred—require grpc-web or native HTTP/2 implementation. |
| 2026-02-11 | Refactored `client.ts` to use FlightTransport abstraction. Removed direct `@grpc/grpc-js` imports—client now uses transport interface for all gRPC operations. Transport is auto-created via `getTransportForRuntime()` or can be injected via `options.transport`. Error handling unified via `wrapTransportError()` that handles gRPC status codes without importing grpc module. This enables future browser/Deno support by swapping transport implementations.                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-02-11 | Fixed prepared statements. Server was storing raw SQL in handle, but client was misinterpreting the ActionCreatePreparedStatementResult body which is wrapped in protobuf Any. Added `unwrapAny()` helper in proto.ts to extract inner message. Also implemented `get_flight_info_prepared_statement` and `do_get_prepared_statement` methods in lakehouse server (sql.rs). All 24 integration tests now pass.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-02-12 | Completed M9 (Browser & Deno Support). Created `transport-grpc-web.ts` with manual protobuf encoding/decoding for gRPC-web protocol (no additional dependencies). Implemented 5-byte message framing, trailer parsing, and fetch-based unary/server-streaming calls. Registered for Browser and Deno runtimes (both use fetch API). Bidirectional streaming (DoPut, DoExchange, Handshake) throws clear errors—gRPC-web spec doesn't support client streaming. Added 12 unit tests and Playwright-based browser integration tests. CI now includes Deno test job. README updated with gRPC-web proxy documentation (Envoy example).                                                                                                                                                                                                   |

# CONTEXT.md

> **This is the single source of truth for this repository.**
>
> When CONTEXT.md conflicts with any other document (README, code comments), CONTEXT.md is correct.
> Update other documents to match, not the reverse.

---

## System Intent

Arrow Flight SQL client for JavaScript and TypeScript runtimes.

Extends Arrow Flight with SQL-specific functionality for database interactions. Built on top of
`@qualithm/arrow-flight-js` as a peer dependency.

**Key capabilities:**

- SQL query execution with Arrow result sets
- Prepared statement lifecycle management
- Transaction support (begin, commit, rollback)
- Database metadata queries (catalogs, schemas, tables, types)
- Parameter binding for prepared statements

---

## Current Reality

### Architecture

| Component | Technology             |
| --------- | ---------------------- |
| Language  | TypeScript (ESM-only)  |
| Runtime   | Bun, Node.js 20+, Deno |
| Build     | TypeScript compiler    |
| Test      | Vitest                 |
| Lint      | ESLint, Prettier       |
| Docs      | TypeDoc                |

### Modules

| Module       | Purpose                              |
| ------------ | ------------------------------------ |
| `client.ts`  | FlightSqlClient implementation       |
| `errors.ts`  | Error types and validation functions |
| `index.ts`   | Main entry point                     |
| `results.ts` | Result set iteration utilities       |

### Flight SQL Commands (via DoGet/DoPut/DoAction)

| Command                          | Purpose                             |
| -------------------------------- | ----------------------------------- |
| `CommandStatementQuery`          | Execute a SQL query, return results |
| `CommandStatementUpdate`         | Execute INSERT/UPDATE/DELETE        |
| `CommandPreparedStatementQuery`  | Execute prepared statement query    |
| `CommandPreparedStatementUpdate` | Execute prepared statement update   |
| `CommandGetCatalogs`             | List available catalogs             |
| `CommandGetDbSchemas`            | List database schemas               |
| `CommandGetTables`               | List tables with optional filtering |
| `CommandGetTableTypes`           | List supported table types          |
| `CommandGetPrimaryKeys`          | Get primary key info for a table    |
| `CommandGetExportedKeys`         | Get foreign key info (exported)     |
| `CommandGetImportedKeys`         | Get foreign key info (imported)     |
| `CommandGetCrossReference`       | Get cross-reference between tables  |
| `CommandGetSqlInfo`              | Get SQL dialect/server capabilities |
| `CommandGetXdbcTypeInfo`         | Get supported data types            |

### Flight SQL Actions

| Action                    | Purpose                          |
| ------------------------- | -------------------------------- |
| `CreatePreparedStatement` | Create a new prepared statement  |
| `ClosePreparedStatement`  | Close a prepared statement       |
| `BeginTransaction`        | Start a transaction              |
| `EndTransaction`          | Commit or rollback a transaction |

### Base Flight Actions

| Action             | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `CancelFlightInfo` | Cancel a running query (replaces deprecated actions) |

---

## Scope

### In Scope

- Flight SQL client implementation
- All SQL commands and actions listed above
- Prepared statement lifecycle management
- Transaction support
- Database metadata queries
- SQL query execution with Arrow result sets
- Parameter binding for prepared statements

### Out of Scope

- Base Flight operations (provided by `arrow-flight-js`)
- Server implementation (client-only library)
- SQL parsing or query building
- ORM functionality

---

## Locked Decisions

1. **Peer dependency on arrow-flight-js** — Reuse base Flight client
2. **Client-only** — No server implementation
3. **TypeScript-first** — Type safety for all code
4. **ESM-only** — Modern standards, tree-shaking
5. **Minimal runtime deps** — Bundle size, supply chain risk
6. **Apache Arrow JS integration** — Use official `apache-arrow` package
7. **Extension pattern** — `FlightSqlClient` extends `FlightClient` class
8. **Optional prepared statement caching** — Opt-in via client option, user controls lifecycle by
   default
9. **Explicit transactions** — User explicitly calls `beginTransaction`/`commit`/`rollback`

---

## Open Decisions & Risks

### Open Decisions

| ID  | Question | Context |
| --- | -------- | ------- |

### Risks

| ID  | Risk                            | Impact | Mitigation                               |
| --- | ------------------------------- | ------ | ---------------------------------------- |
| R-1 | arrow-flight-js API instability | High   | Develop both libraries in tandem         |
| R-2 | Server compatibility variations | Medium | Test against multiple Flight SQL servers |

---

## Work In Flight

> Claim work before starting. Include start timestamp. Remove within 24 hours of completion.

| ID  | Agent | Started | Task | Files |
| --- | ----- | ------- | ---- | ----- |
| —   | —     | —       | None | —     |

---

## Work Queue

> No items currently queued.

---

## Learnings

> Append-only. Never edit or delete existing entries.

| Date       | Learning                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02-20 | `CancelFlightInfo` is a base Flight action implemented in `FlightClient`, not Flight SQL-specific. Since `FlightSqlClient` extends `FlightClient`, the method is inherited automatically - no additional implementation needed. |
| 2026-02-24 | Integration tests must import from "vitest" not "bun:test" for coverage to work correctly.                                                                                                                                      |
| 2026-02-24 | vi.spyOn mocking of doPut/doAction enables testing error paths and protobuf edge cases (empty results, non-length-delimited fields, handle presence) without a real server.                                                     |
| 2026-02-24 | getCrossReference() implemented: returns foreign keys between two tables (pk_table -> fk_table), follows same pattern as getExportedKeys/getImportedKeys.                                                                       |

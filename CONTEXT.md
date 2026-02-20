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

---

## Current Reality

### Architecture

| Component | Technology            |
| --------- | --------------------- |
| Language  | TypeScript (ESM-only) |
| Runtime   | Bun, Node.js 20+      |
| Build     | TypeScript compiler   |
| Test      | Bun test runner       |
| Lint      | ESLint, Prettier      |
| Docs      | TypeDoc               |

### Modules

| Module     | Purpose          |
| ---------- | ---------------- |
| `index.ts` | Main entry point |

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
| `CancelQuery`             | Cancel a running query           |

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
| —   | None     | —       |

### Risks

| ID  | Risk                            | Impact | Mitigation                               |
| --- | ------------------------------- | ------ | ---------------------------------------- |
| R1  | arrow-flight-js API instability | High   | Develop both libraries in tandem         |
| R2  | Server compatibility variations | Medium | Test against multiple Flight SQL servers |

---

## Work In Flight

> Claim work before starting. Include start timestamp. Remove within 24 hours of completion.

| ID  | Agent | Started | Task | Files |
| --- | ----- | ------- | ---- | ----- |
|     |       |         |      |       |

---

## Next Milestones

### M1: Project Setup

- [x] Update package.json with correct name/description
- [x] Add peer dependency on `@qualithm/arrow-flight-js`
- [x] Define proto file handling for Flight SQL messages
- [x] Set up proto compilation pipeline

### M2: Core SQL Execution

- [x] `FlightSqlClient` wrapping base `FlightClient`
- [x] Implement `CommandStatementQuery` (simple queries)
- [x] Implement `CommandStatementUpdate` (INSERT/UPDATE/DELETE)
- [x] Result set iteration with Arrow Tables

### M3: Prepared Statements

- [x] Implement `CreatePreparedStatement` action
- [x] Implement `ClosePreparedStatement` action
- [x] Implement `CommandPreparedStatementQuery`
- [x] Implement `CommandPreparedStatementUpdate`
- [ ] Parameter binding API

### M4: Metadata Queries

- [ ] Implement `CommandGetCatalogs`
- [ ] Implement `CommandGetDbSchemas`
- [ ] Implement `CommandGetTables`
- [ ] Implement `CommandGetTableTypes`
- [ ] Implement `CommandGetPrimaryKeys`
- [ ] Implement `CommandGetExportedKeys` / `CommandGetImportedKeys`
- [ ] Implement `CommandGetSqlInfo`
- [ ] Implement `CommandGetXdbcTypeInfo`

### M5: Transactions & Polish

- [ ] Implement `BeginTransaction` / `EndTransaction`
- [ ] Implement `CancelQuery`
- [ ] Add comprehensive error handling
- [ ] Documentation and examples

### M6: Testing Infrastructure

- [ ] Add Docker Compose with Arrow Flight SQL test server
- [ ] Create integration test suite (query, update, prepared statements, metadata)
- [ ] Run tests on Bun (unit + integration)
- [ ] Run tests on Node.js (unit + integration)
- [ ] Run tests on Deno (unit + integration)
- [ ] Enable coverage reporting with threshold enforcement
- [ ] Add test fixtures for Arrow schemas/data

---

## Learnings

> Append-only. Never edit or delete existing entries.

| Date | Learning |
| ---- | -------- |

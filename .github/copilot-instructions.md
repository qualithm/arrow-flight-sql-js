# Code Guidelines

## General

- Use TypeScript with strict mode
- British spelling in user-facing strings (e.g. "unauthorised", "colour")
- Lowercase error messages with no trailing punctuation

## Imports

**Order:** email → constants → core libs → utils → middleware → types

```ts
import { Invite } from "../email/Invite"
import { isMemberRole, rateLimits } from "../lib/constants"
import http from "../lib/http"
import pg from "../lib/pg"
import tc from "../lib/tc"
import { badRequest, forbidden, ok, parseUUID, type Rows } from "../lib/utils"
import { withRateLimit, withSession, withWorkspaceRoles } from "../middleware"
import type { Role } from "../type/app"
import type { HttpResponse } from "../type/http"
```

**Rules:**

- No duplicate imports
- Use `import { x, type Y }` for mixed imports
- Use `import type { Y }` for types-only

## Naming Conventions

| Type         | Pattern        | Example                        |
| ------------ | -------------- | ------------------------------ |
| Context      | `ctx{Name}`    | `ctxSession`, `ctxWorkspace`   |
| Path param   | `param{Name}`  | `paramTeamId`, `paramDeviceId` |
| Query param  | `query{Name}`  | `queryPage`, `queryLimit`      |
| Body field   | `input{Name}`  | `inputName`, `inputRole`       |
| Parsed value | `parsed{Name}` | `parsedTeamId`, `parsedName`   |
| Table alias  | first letter   | `device AS d`                  |
| Column       | camelCase      | `created_at AS "createdAt"`    |

## Endpoint Files

File naming: `src/v1/{verb}{Resource}.ts` — e.g. `getDevices.ts`, `postDevice.ts`

## Middleware

```ts
http.get(
  "/v1/resource",
  withRateLimit(rateLimits.standard), // or rateLimits.sensitive for emails/forms
  withSession(),
  withWorkspaceRoles(["owner"]), // if needed
  async (c) => {
    /* ... */
  }
)
```

**Never hardcode rate limits.** Use `rateLimits.standard` or `rateLimits.sensitive`.

## Validation Order

1. Path params → 2. Auth context → 3. Body (`tc`) → 4. Business rules → 5. Database

## Database

| Connection    | Use              |
| ------------- | ---------------- |
| `pg.reader()` | reads (replica)  |
| `pg.writer()` | writes (primary) |

**Rules:**

- Always include `deleted_at IS NULL` on all tables including joins
- Use `pg.wait()` after writes
- Use `FOR UPDATE` for atomic operations (role changes, ownership)
- Use transactions for multi-table writes

## Logging

Logs are structured `key=value` format. Use object syntax:

```ts
log.info({ event: "server_started", port: 3000 })
log.error({ event: "db_connection_failed", host: "localhost", error: e })
```

**Never use human-readable log strings.**

## Error Handling

Thrown errors should be human-readable sentences: sentence case, no trailing punctuation, specific
context.

```ts
throw new Error("Token secret is missing or too short")
throw new Error("Failed to fetch user info from GitHub")
```

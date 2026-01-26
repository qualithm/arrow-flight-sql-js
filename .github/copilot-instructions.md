# TypeScript Code Guidelines

## General

- Use TypeScript with strict mode
- British spelling in user-facing strings (e.g. "unauthorised", "colour")
- Lowercase error messages with no trailing punctuation
- Run linting and type checking before committing

## When Code Changes

Any code change should include review of:

- **Tests** - update existing tests, add new tests for new behaviour
- **Types** - update type definitions if data shapes change
- **Documentation** - update comments if public API changes
- **Error messages** - ensure they remain accurate and helpful
- **Configuration** - update env vars or config files if affected
- **Dependencies** - check for unused deps after removing code

Run before committing:

```bash
bun run lint
bun run typecheck
bun test
```

## Imports

**Order:** framework → external libs → workspace packages → local modules → types

```ts
import { useState, useCallback } from "react"

import { z } from "zod"

import { httpClient } from "@workspace/shared"

import { parseId, formatDate } from "../lib/utils"
import type { User, Session } from "../types"
```

**Rules:**

- Group imports by origin with blank lines between groups
- Use `import type { Y }` for type-only imports
- Use `import { x, type Y }` for mixed imports
- No duplicate imports
- Prefer explicit imports over `* as`

## File Structure

| Path     | Purpose                       |
| -------- | ----------------------------- |
| `lib/`   | Utilities, constants, helpers |
| `types/` | TypeScript type definitions   |
| `test/`  | Test files                    |

## Naming Conventions

| Type             | Pattern                          | Example                               |
| ---------------- | -------------------------------- | ------------------------------------- |
| Types/Interfaces | `PascalCase`                     | `UserSession`, `ApiResponse`          |
| Functions        | `camelCase`                      | `getUser`, `parseToken`               |
| Constants        | `SCREAMING_SNAKE` or `camelCase` | `MAX_RETRIES`, `defaultConfig`        |
| Files            | `camelCase`                      | `userService.ts`, `authMiddleware.ts` |
| Env vars         | `SCREAMING_SNAKE`                | `DATABASE_URL`, `API_SECRET`          |

## Comments and Documentation

**Avoid comments that age poorly.** Stale documentation is worse than none.

**Do not include:**

- Overview/summary docs describing architecture
- Diagrams showing component relationships
- Feature lists or "this module provides" enumerations
- "How to use" guides

**Do include:**

- Brief JSDoc on exported functions describing parameters and return values
- Implementation comments explaining non-obvious logic
- `@throws` annotations where applicable

## Error Handling

Thrown errors should be human-readable sentences: sentence case, no trailing punctuation.

```ts
throw new Error("User not found")
throw new Error("Failed to parse response")
throw new Error("Token has expired")
```

**Rules:**

- Use specific error messages with context
- Prefer throwing `Error` over returning error objects
- Handle errors at appropriate boundaries

## Logging

Logs are structured `key=value` format. Use object syntax:

```ts
log.info({ event: "server_started", port: 3000 })
log.error({ event: "request_failed", path, error: e })
```

**Never use human-readable log strings.**

## Testing

Place tests alongside source or in a `test/` directory:

```ts
import { describe, it, expect } from "bun:test"

describe("parseToken", () => {
  it("returns null for invalid input", () => {
    expect(parseToken("invalid")).toBeNull()
  })

  it("extracts user id from valid token", () => {
    const result = parseToken(validToken)
    expect(result?.userId).toBe("123")
  })
})
```

**Rules:**

- Use descriptive test names
- Test edge cases and error conditions
- Prefer unit tests over integration tests where possible

## Type Definitions

```ts
type UserRole = "owner" | "admin" | "member"

type User = {
  id: string
  email: string
  role: UserRole
  createdAt: Date
}
```

**Rules:**

- Prefer `type` over `interface` for object shapes
- Use union types for constrained values
- Export types from dedicated type files

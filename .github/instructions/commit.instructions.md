---
applyTo: "**/COMMIT_EDITMSG"
description: "Guidelines for writing commit messages"
---

# Commit Guidelines

## Format

```
type(scope)!: subject
```

- **type**: one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
  `chore`, `revert`
- **scope**: _(optional)_ area affected, e.g. `parser`, `ui`
- **!**: _(optional)_ indicates a breaking change
- **subject**: imperative, lowercase, no trailing period

**Example**

```
feat(parser): add async function support
```

---

## Body (Optional)

- Leave one blank line after the header.
- Explain **what** and **why**, not **how**.

**Example**

```
feat(api): support user sessions

Add session middleware for persistent login.
Improves UX for returning users.
```

---

## Footer (Optional)

- Use for metadata, breaking changes, or issue references.
  - `BREAKING CHANGE:` short description of the change
  - `Closes/Fixes/Refs:` issue references (e.g. `Closes #123`)

**Example**

```
refactor(auth)!: replace session tokens with JWTs

BREAKING CHANGE: session cookies are no longer valid
Closes #456
```

---

## Type Reference

| Type       | Description                     |
| ---------- | ------------------------------- |
| `feat`     | New feature                     |
| `fix`      | Bug fix                         |
| `docs`     | Documentation only              |
| `style`    | Formatting, no code change      |
| `refactor` | Code change without feature/fix |
| `perf`     | Performance improvement         |
| `test`     | Adding or updating tests        |
| `build`    | Build system or dependencies    |
| `ci`       | CI/CD configuration             |
| `chore`    | Other maintenance               |
| `revert`   | Revert a previous commit        |

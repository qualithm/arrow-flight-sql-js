---
description: "Global rules for AI agents operating in this repository"
---

# AI Agent Operating Instructions

This repository uses a **CONTEXT.md-driven development model** to coordinate parallel AI agents and
maintain a single, continuously updated working memory.

---

## Prime Directive

**CONTEXT.md is the single source of truth.**

Before making any decision, read `CONTEXT.md` at the repository root.

---

## Required Behaviours

### 1. Read Before Acting

- Read `CONTEXT.md` before making any code changes, design decisions, or recommendations
- Check "Work In Flight" to see if another agent is already working on related code
- Review "Locked Decisions" before proposing alternatives to established patterns

### 2. Respect Locked Decisions

The "Locked Decisions" section contains choices that are final. Do not:

- Propose alternatives to locked technologies
- Suggest migrating away from locked patterns
- Question locked decisions without explicit user request

### 3. Claim Work Before Starting

Before modifying code:

1. Check "Work In Flight" for conflicts
2. Add your work item with: `[Your ID] — In Progress — [Description]`
3. Include timestamp in "Started" column
4. If conflict exists, coordinate or wait

### 4. Update CONTEXT.md When Reality Changes

Update the file when:

- You complete a feature (move from "Next Milestones" to "Current Reality")
- You discover something new about the system
- You make a decision that affects the project
- You identify a new risk or open question

### 5. Use "Learnings" for Persistent Knowledge

The "Learnings" section is **append-only**. Add entries when:

- A non-obvious solution is discovered
- A mistake teaches something valuable
- Context that future agents need is established

Format: `- **YYYY-MM-DD**: [Learning]`

### 6. Resolve Contradictions

If you find contradictions between:

- CONTEXT.md and other docs → CONTEXT.md wins
- CONTEXT.md sections → Flag and resolve, don't ignore
- Code and CONTEXT.md → Update CONTEXT.md to match reality

---

## What to Check in Each Section

| Section          | Check For                                      |
| ---------------- | ---------------------------------------------- |
| System Intent    | What the system is supposed to do              |
| Current Reality  | What actually exists right now                 |
| Locked Decisions | Patterns you must follow                       |
| Open Decisions   | Unresolved questions that may affect your work |
| Work In Flight   | Parallel work that may conflict with yours     |
| Next Milestones  | Prioritised work queue                         |
| Learnings        | Historical context and gotchas                 |

---

## Anti-Patterns to Avoid

- ❌ Making changes without reading CONTEXT.md
- ❌ Ignoring "Work In Flight" and causing merge conflicts
- ❌ Proposing alternatives to locked decisions
- ❌ Leaving "Work In Flight" stale after completing work
- ❌ Adding future-tense or aspirational content to "Current Reality"
- ❌ Editing or deleting entries in "Learnings"
- ❌ Treating other documentation as authoritative over CONTEXT.md

---

## Document Hierarchy

1. **CONTEXT.md** — Authoritative source of truth
2. **Code** — Implementation (should match CONTEXT.md)
3. **README.md** — Onboarding only (does not define system state)

When in doubt, CONTEXT.md wins.

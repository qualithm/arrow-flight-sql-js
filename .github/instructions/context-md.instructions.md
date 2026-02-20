---
applyTo: "**/CONTEXT.md"
description: "Rules for maintaining the project's working memory"
---

# CONTEXT.md Maintenance Rules

This file defines how CONTEXT.md must be maintained. These rules are non-negotiable.

---

## Core Invariants

### 1. CONTEXT.md Is Authoritative

When CONTEXT.md conflicts with any other document (README, code comments), CONTEXT.md is correct.
Update other documents to match, not the reverse.

### 2. Learnings Are Append-Only

The "Learnings" section must never be:

- Edited (except typo fixes that don't change meaning)
- Deleted
- Reordered

Only append new rows at the bottom of the table.

Format: Table with Date, Learning columns

### 3. Current Reality Contains Only Present Facts

"Current Reality" must describe **what exists right now**, not:

- What used to exist
- What will exist
- What should exist
- What might exist

❌ Forbidden:

- "Will be implemented..."
- "Planned for..."
- "Should support..."
- "Eventually..."

✅ Required:

- "Exists and works"
- "Implemented but untested"
- "Partially complete: X works, Y does not"

### 4. No Future Tense in Reality Sections

These sections must use present or past tense only:

- System Intent
- Current Reality
- Locked Decisions

Future work belongs in:

- Next Milestones
- Open Decisions & Risks

### 5. Contradictions Must Be Resolved

If you notice a contradiction between sections:

1. Stop
2. Determine which represents reality
3. Fix the incorrect section
4. Add a Learning entry explaining the correction

Never leave contradictions unaddressed.

---

## Section-Specific Rules

### System Intent

- One paragraph describing what the system does
- Present tense
- No implementation details

### Current Reality

#### Architecture Table

- Only include technologies actually in use
- Update when adding/removing dependencies

#### Modules Table

- List all top-level modules with one-line descriptions
- Keep alphabetically sorted

### Locked Decisions

- Numbered list
- Each entry: **Bold title** — Brief explanation
- Only add when a decision is truly final

### Open Decisions & Risks

#### Open Decisions Table

| Column   | Content                     |
| -------- | --------------------------- |
| ID       | Sequential number           |
| Question | The decision to be made     |
| Context  | Why it matters, constraints |

#### Risks Table

| Column     | Content                   |
| ---------- | ------------------------- |
| ID         | Sequential number         |
| Risk       | What could go wrong       |
| Impact     | Consequence if it happens |
| Mitigation | How we're addressing it   |

### Work In Flight

| Column  | Content                         |
| ------- | ------------------------------- |
| ID      | Sequential number               |
| Agent   | Who is working (human or AI ID) |
| Started | ISO 8601 timestamp              |
| Task    | Brief description               |
| Files   | Affected files/directories      |

Rules:

- Claim before starting
- Remove within 24 hours of completion
- Check for conflicts before claiming

### Next Milestones

- Ordered list of upcoming work
- Each item: brief title + optional description
- Move to "Current Reality" when complete

### Learnings

| Column   | Content          |
| -------- | ---------------- |
| Date     | YYYY-MM-DD       |
| Learning | What was learned |

Rules:

- **Append-only** — never edit or delete
- Add when discovering non-obvious solutions
- Add when mistakes teach something valuable

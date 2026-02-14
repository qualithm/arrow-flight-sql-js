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

- Describes the purpose and scope of the system
- Written in present tense
- Should rarely change
- Changes require explicit approval
- Format: 1-2 paragraph summary followed by "Key capabilities" bullet list
- Optional "Scope" line for boundary statements

### Current Reality

- Must match the actual codebase
- Update immediately when code changes
- Remove items when features are deleted
- Use tables for structured inventories
- Describe only what EXISTS, never what is missing or planned
- Each item must be verifiable by inspecting the codebase
- Use descriptive subsection titles (e.g., `### Architecture`, `### Features`, `### API Endpoints`)
- Never reference milestone numbers in subsection titles
- Status column values (text only, no emoji):
  - `Complete` — fully implemented and working
  - `Partial` — some functionality works, some does not
  - `Operational` — deployed and running in production
  - `Stub` — placeholder exists but no real implementation
  - `Not started` — planned but no code exists
- Use tables, not bullet lists, for inventories
- No commentary paragraphs in Current Reality (warnings, notes go in Risks or Learnings)
- Security Configuration subsection required for frontend/backend projects (table format)
- Do not track External Dependencies or Environment Variables sections

Standard subsection order (include only those applicable):

1. **Architecture** — Stack table (Component | Technology)
2. **File Structure** — Directory overview (Directory | Purpose)
3. **Components/Modules/Crates** — Code structure table (Name | Purpose)
4. **Features** — Feature status table (Feature | Status | Notes)
5. **API Endpoints** — If API service (Category | Endpoints)
6. **Security Configuration** — Always include for frontend/backend (Feature | Status | Notes)

### Locked Decisions

- Numbered list for easy reference (1, 2, 3...)
- Include brief rationale if non-obvious
- Removing items requires explicit team approval
- New locks require justification
- No introductory paragraph before the list
- Format: `N. **Topic** — Rationale`

### Open Decisions & Risks

- Use unique IDs (OD-N, R-N)
- Include context for each decision/risk
- Move to "Locked Decisions" when resolved
- Remove risks when mitigated
- Question column must contain actual questions, not statements
- Always include both subsections (Open Decisions and Risks), even if empty
- Use placeholder row when section is empty: `| — | None | — |`
- Open Decisions table format:

```markdown
| ID  | Question | Context |
| --- | -------- | ------- |
```

- Risks table format:

```markdown
| ID  | Risk | Impact | Mitigation |
| --- | ---- | ------ | ---------- |
```

### Work In Flight

- Claim before starting
- Include start date
- Remove within 24 hours of completion
- First timestamp wins for conflicts
- Use standard table format:

```markdown
| ID  | Agent | Started | Task | Files |
| --- | ----- | ------- | ---- | ----- |
```

### Next Milestones

- Ordered by priority
- Actionable task checklists
- Move to "Current Reality" when done
- Keep in sync with actual work
- Use standard heading format: `### MN: Title`
- Milestones must be numbered sequentially (M1, M2, M3...) with no gaps
- Each milestone has:
  - Checklist of tasks using `- [ ]` format
  - Optional `Acceptance:` line with measurable criteria
- Code TODOs must be tracked as milestone tasks, not in other sections
- Mark tasks complete with `- [x]` as work progresses

### Learnings

- Append-only (critical rule)
- Use table format with Date and Learning columns
- Capture decisions, mistakes, discoveries
- Include context for future readers
- Section header must be `## Learnings` (not `## Learnings (append-only)`)
- Include intro line: `> Append-only. Never edit or delete existing entries.`
- Table format:

```markdown
| Date       | Learning |
| ---------- | -------- |
| YYYY-MM-DD | ...      |
```

---

## Required Sections

Every CONTEXT.md must include these sections in order:

1. **Header block** — Title, authority statement, conflict resolution rule
2. **System Intent** — Purpose and scope (present tense)
3. **Current Reality** — What exists now (tables, subsections)
4. **Locked Decisions** — Numbered list of final choices
5. **Open Decisions & Risks** — Tables with IDs (OD-N, R-N)
6. **Work In Flight** — Active work tracking table
7. **Next Milestones** — Prioritised future work (MN: Title format)
8. **Learnings** — Append-only dated entries

---

## Forbidden Content

Never include in CONTEXT.md:

- External Dependencies sections (track in package.json/Cargo.toml)
- Environment Variables sections (track in env-example files)
- References to deleted files (SPEC.md, MILESTONES.md, SUMMARY.md)
- Future tense in Current Reality ("will be", "planned", "should")
- Emoji in status values
- Likelihood columns in Risks tables
- Commentary paragraphs in Current Reality
- Milestone numbers in Current Reality subsection titles

---

## CONTEXT.md Template

Use this structure when creating a new CONTEXT.md:

```markdown
# CONTEXT.md

> **This is the single source of truth for this repository.**
>
> When CONTEXT.md conflicts with any other document (README, code comments), CONTEXT.md is correct.
> Update other documents to match, not the reverse.

---

## System Intent

[1-2 paragraph summary describing what this project does and its role in the ecosystem.]

**Key capabilities:**

- [Capability 1]
- [Capability 2]
- [Capability 3]

**Scope:** [Optional boundary statement]

---

## Current Reality

### Architecture

| Component | Technology |
| --------- | ---------- |
| Runtime   | ...        |
| Framework | ...        |

### [Components/Modules/Crates]

| Name | Purpose |
| ---- | ------- |
| ...  | ...     |

### Features

| Feature | Status | Notes |
| ------- | ------ | ----- |
| ...     | ...    | ...   |

### Security Configuration

| Feature | Status | Notes |
| ------- | ------ | ----- |
| CSP     | ...    | ...   |
| CORS    | ...    | ...   |

---

## Locked Decisions

1. **[Topic]** — [Rationale]
2. **[Topic]** — [Rationale]

---

## Open Decisions & Risks

### Open Decisions

| ID   | Question | Context |
| ---- | -------- | ------- |
| OD-1 | ...?     | ...     |

### Risks

| ID  | Risk | Impact | Mitigation |
| --- | ---- | ------ | ---------- |
| R-1 | ...  | High   | ...        |

---

## Work In Flight

> Claim work before starting. Include start timestamp. Remove within 24 hours of completion.

| ID  | Agent | Started | Task                 | Files |
| --- | ----- | ------- | -------------------- | ----- |
| —   | —     | —       | No work in progress. | —     |

---

## Next Milestones

### M1: [Title]

- [ ] [Task 1]
- [ ] [Task 2]

Acceptance: [Measurable criteria]

---

## Learnings

> Append-only. Never edit or delete existing entries.

| Date       | Learning                                             |
| ---------- | ---------------------------------------------------- |
| YYYY-MM-DD | Project initialised with [key architectural choice]. |
```

---

## Review Checklist

When auditing an existing CONTEXT.md against the codebase:

### Structure

- [ ] All required sections present in correct order
- [ ] Header block includes authority statement
- [ ] No forbidden content present

### Current Reality

- [ ] Every item verifiable by inspecting the codebase
- [ ] No items for features that don't exist
- [ ] No items for features that were removed
- [ ] Status values match actual state (Complete, Partial, Operational, Stub, Not started)
- [ ] Security Configuration subsection present (frontend/backend projects)
- [ ] All tables, no bullet lists for inventories
- [ ] No commentary paragraphs

### Locked Decisions

- [ ] Numbered sequentially (1, 2, 3...)
- [ ] Format: `N. **Topic** — Rationale`
- [ ] No introductory paragraph

### Open Decisions & Risks

- [ ] IDs are unique and sequential (OD-1, OD-2..., R-1, R-2...)
- [ ] Questions are actual questions (end with ?)
- [ ] Risks table has Impact and Mitigation columns (no Likelihood)
- [ ] Resolved decisions moved to Locked Decisions

### Work In Flight

- [ ] No stale entries (older than 24 hours after completion)
- [ ] Table format with ID, Agent, Started, Task, Files columns

### Next Milestones

- [ ] Numbered sequentially (M1, M2, M3...) with no gaps
- [ ] Format: `### MN: Title`
- [ ] Tasks use checklist format (`- [ ]` / `- [x]`)
- [ ] Completed milestones moved to Current Reality

### Learnings

- [ ] Append-only (no edits to existing entries)
- [ ] Table format with Date and Learning columns
- [ ] Intro line present: `> Append-only. Never edit or delete existing entries.`

---

## Editing Checklist

Before saving changes to CONTEXT.md:

- [ ] "Current Reality" contains only present-tense facts about what EXISTS
- [ ] No "missing", "to be created", or "not implemented" items in Current Reality
- [ ] No aspirational language in reality sections
- [ ] All TODOs are tracked as milestone tasks
- [ ] "Learnings" only has additions, no edits or deletions
- [ ] No contradictions between sections
- [ ] "Work In Flight" reflects actual current work
- [ ] All IDs are unique (OD-N, R-N)
- [ ] Changes are consistent with locked decisions
- [ ] Milestones have measurable acceptance criteria where applicable

---

## Compaction Guidelines

When CONTEXT.md exceeds 400 lines, apply these compaction rules.

### Compaction Triggers

| Trigger | Threshold |
| ------- | --------- |
| File length | > 400 lines |
| Learnings table | > 30 entries |
| Completed milestones | > 3 fully-completed milestone sections |
| Stale risks | Risks unreviewed for > 90 days |

### Archive File

Create `CONTEXT-ARCHIVE.md` for historical content:

```markdown
# CONTEXT-ARCHIVE.md

> Historical entries archived from CONTEXT.md. Reference only.

## Archived Learnings

| Date | Learning |
| ---- | -------- |

## Archived Decisions

| ID | Decision | Archived | Reason |
| -- | -------- | -------- | ------ |
```

### What to Archive

- Learnings older than 6 months (keep 10 most recent in CONTEXT.md)
- Open Decisions deferred > 6 months
- Risks that became non-issues

### What to Delete

- Completed milestone sections (after features verified in Current Reality)
- Mitigated risks
- Resolved open decisions (move to Locked Decisions first)
- Stale Work In Flight entries

### What to Consolidate

- Granular tables → summary rows with counts
- Related learnings → single summary entry before archiving
- Repetitive status columns → remove when all "Complete"

### Milestone Renumbering

After removing completed milestones, renumber remaining milestones to close gaps:

- M4, M5, M6 → M1, M2, M3

Optionally keep a summary table:

```markdown
### Completed Milestones

| Milestone | Completed |
| --------- | --------- |
| M1: Core Protocol | 2026-01-26 |
```

### Compaction Checklist

- [ ] File under 400 lines after compaction
- [ ] Learnings table has ≤ 30 entries
- [ ] No completed milestone sections remain
- [ ] All Current Reality items verifiable in codebase
- [ ] Archive file updated with moved content
- [ ] Compaction logged: `YYYY-MM-DD | Compacted CONTEXT.md; archived N learnings, removed M milestones`

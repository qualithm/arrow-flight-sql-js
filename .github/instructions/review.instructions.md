---
description: "Guidelines for reviewing code changes"
---

# Code Review Guidelines

## Security

- [ ] No secrets or credentials hardcoded
- [ ] Input validation on all user inputs
- [ ] Proper authentication and authorisation checks
- [ ] No sensitive information leaked in error messages

## Error Handling

- [ ] Errors are caught and handled appropriately
- [ ] User-facing errors are human-readable sentences
- [ ] Errors include sufficient context for debugging
- [ ] No sensitive information leaked in error messages

## Code Quality

- [ ] Imports ordered correctly (framework → external → local → types)
- [ ] No duplicate imports
- [ ] Naming conventions followed
- [ ] British spelling in user-facing strings
- [ ] Lowercase messages with no trailing punctuation

## Types

- [ ] Proper TypeScript types used (no unnecessary `any`)
- [ ] Type exports use `export type`
- [ ] Complex types documented with JSDoc

## Testing

- [ ] New code has corresponding tests
- [ ] Tests cover edge cases and error conditions
- [ ] Test names describe the expected behaviour

## Performance

- [ ] No unnecessary re-renders or recomputation
- [ ] Large data sets handled efficiently
- [ ] Async operations don't block the main thread

## Documentation

- [ ] Public API documented with JSDoc
- [ ] Complex logic explained with comments
- [ ] README updated if public API changes

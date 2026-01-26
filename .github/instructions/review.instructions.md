---
description: "Guidelines for reviewing code changes"
---

# Code Review Guidelines

## Security

- [ ] No secrets or credentials hardcoded
- [ ] Input validation on all user inputs
- [ ] Proper authentication and authorisation checks
- [ ] SQL injection prevention (parameterised queries)
- [ ] Rate limiting applied to sensitive endpoints

## Database

- [ ] Reads use `pg.reader()`, writes use `pg.writer()`
- [ ] `pg.wait()` called after writes
- [ ] `deleted_at IS NULL` included in all queries and joins
- [ ] `FOR UPDATE` used for atomic operations
- [ ] Transactions used for multi-table writes

## Error Handling

- [ ] Errors are caught and handled appropriately
- [ ] User-facing errors are human-readable sentences
- [ ] Errors include sufficient context for debugging
- [ ] No sensitive information leaked in error messages

## Logging

- [ ] Logs use structured `key=value` format
- [ ] No human-readable log strings
- [ ] Error logs include `error` field with error object
- [ ] Appropriate log levels used (debug, info, warn, error)

## Code Quality

- [ ] Imports ordered correctly (email → constants → libs → utils → middleware → types)
- [ ] No duplicate imports
- [ ] Naming conventions followed (ctxContext, paramPath, queryString, inputBody, parsedValue)
- [ ] British spelling in user-facing strings
- [ ] Lowercase messages with no trailing punctuation

## Validation

- [ ] Validation order: path → auth → body → rules → db
- [ ] Path parameters parsed and validated
- [ ] Request body parsed with `tc`
- [ ] UUID validation with `parseUUID`
- [ ] Pagination uses `parsePagination`

## Responses

- [ ] Correct HTTP status codes used
- [ ] Response typed as `HttpResponse<T>`
- [ ] Consistent response structure

## Middleware

- [ ] Rate limiting applied (`rateLimits.standard` or `rateLimits.sensitive`)
- [ ] Session middleware for authenticated endpoints
- [ ] Workspace role checks where required
- [ ] No hardcoded rate limit values

## External Services

- [ ] Called after database writes
- [ ] Failures return `failedDependency`
- [ ] Database not rolled back on external service failure

## Performance

- [ ] Efficient database queries
- [ ] Appropriate use of indexes
- [ ] No N+1 query problems
- [ ] Pagination for list endpoints

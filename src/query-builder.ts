/**
 * Fluent SQL query builder for constructing type-safe queries.
 *
 * This module provides a query builder API that generates SQL strings
 * compatible with the FlightSqlClient.query() and executeUpdate() methods.
 *
 * @example
 * ```typescript
 * import { QueryBuilder } from "@qualithm/arrow-flight-sql-js"
 *
 * const query = new QueryBuilder()
 *   .select("id", "name", "email")
 *   .from("users")
 *   .where("status", "=", "active")
 *   .orderBy("created_at", "DESC")
 *   .limit(10)
 *   .build()
 *
 * const result = await client.query(query)
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

/** SQL comparison operators */
export type ComparisonOperator =
  | "="
  | "!="
  | "<>"
  | "<"
  | "<="
  | ">"
  | ">="
  | "LIKE"
  | "NOT LIKE"
  | "ILIKE"
  | "IN"
  | "NOT IN"
  | "IS"
  | "IS NOT"
  | "BETWEEN"

/** Sort direction */
export type SortDirection = "ASC" | "DESC"

/** Join types */
export type JoinType = "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS"

/** Logical operators for combining conditions */
export type LogicalOperator = "AND" | "OR"

/** A single WHERE condition */
export interface WhereCondition {
  column: string
  operator: ComparisonOperator
  value: SqlValue
  logical: LogicalOperator
}

/** A raw SQL expression */
export interface RawExpression {
  __raw: true
  sql: string
}

/** SQL value types */
export type SqlValue = string | number | boolean | bigint | null | Date | RawExpression | SqlValue[]

/** Column with optional alias */
export type ColumnSpec = string | { column: string; alias: string }

/** Order by specification */
export interface OrderSpec {
  column: string
  direction: SortDirection
  nulls?: "FIRST" | "LAST"
}

/** Join specification */
export interface JoinSpec {
  type: JoinType
  table: string
  alias?: string
  on: string
}

/** Result of building a query */
export interface BuiltQuery {
  /** The SQL query string */
  sql: string
  /** Parameter values for prepared statements (if using parameterized mode) */
  params: SqlValue[]
}

// ============================================================================
// Value Escaping
// ============================================================================

/**
 * Creates a raw SQL expression that won't be escaped.
 *
 * WARNING: Only use with trusted input. Raw expressions bypass escaping
 * and can lead to SQL injection if used with untrusted data.
 *
 * @example
 * ```typescript
 * const query = new QueryBuilder()
 *   .select("*")
 *   .from("events")
 *   .where("created_at", ">", raw("NOW() - INTERVAL '1 day'"))
 *   .build()
 * ```
 */
export function raw(sql: string): RawExpression {
  return { __raw: true, sql }
}

/**
 * Checks if a value is a raw SQL expression.
 */
function isRaw(value: unknown): value is RawExpression {
  return typeof value === "object" && value !== null && "__raw" in value
}

/**
 * Escape a SQL identifier (table name, column name).
 * Uses double quotes for standard SQL compliance.
 */
export function escapeIdentifier(identifier: string): string {
  // Handle qualified names (schema.table, table.column)
  if (identifier.includes(".")) {
    return identifier
      .split(".")
      .map((part) => escapeIdentifier(part))
      .join(".")
  }

  // Handle wildcards
  if (identifier === "*") {
    return "*"
  }

  // Handle expressions with parentheses (function calls like COUNT(*))
  if (identifier.includes("(") || identifier.includes(")")) {
    return identifier
  }

  // Escape by doubling quotes and wrapping
  return `"${identifier.replace(/"/g, '""')}"`
}

/**
 * Escape a SQL string value.
 * Uses single quotes with proper escaping.
 */
export function escapeString(value: string): string {
  // Escape single quotes by doubling them
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Format a SQL value for inclusion in a query.
 */
export function formatValue(value: SqlValue): string {
  if (value === null) {
    return "NULL"
  }

  if (isRaw(value)) {
    return value.sql
  }

  if (typeof value === "string") {
    return escapeString(value)
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value: ${String(value)}`)
    }
    return String(value)
  }

  if (typeof value === "bigint") {
    return String(value)
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE"
  }

  if (value instanceof Date) {
    return `TIMESTAMP '${value.toISOString()}'`
  }

  if (Array.isArray(value)) {
    const formatted = value.map(formatValue)
    return `(${formatted.join(", ")})`
  }

  throw new Error(`Unsupported value type: ${typeof value}`)
}

// ============================================================================
// QueryBuilder Class
// ============================================================================

/**
 * Fluent SQL query builder.
 *
 * Supports SELECT, INSERT, UPDATE, and DELETE operations with a chainable API.
 *
 * @example SELECT query
 * ```typescript
 * const sql = new QueryBuilder()
 *   .select("id", "name")
 *   .from("users")
 *   .where("active", "=", true)
 *   .limit(10)
 *   .build()
 * ```
 *
 * @example INSERT query
 * ```typescript
 * const sql = new QueryBuilder()
 *   .insertInto("users")
 *   .columns("name", "email")
 *   .values("Alice", "alice@example.com")
 *   .build()
 * ```
 *
 * @example UPDATE query
 * ```typescript
 * const sql = new QueryBuilder()
 *   .update("users")
 *   .set("status", "inactive")
 *   .where("last_login", "<", new Date("2024-01-01"))
 *   .build()
 * ```
 *
 * @example DELETE query
 * ```typescript
 * const sql = new QueryBuilder()
 *   .deleteFrom("users")
 *   .where("status", "=", "deleted")
 *   .build()
 * ```
 */
export class QueryBuilder {
  private _operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" = "SELECT"
  private _distinct = false
  private _columns: ColumnSpec[] = []
  private _table = ""
  private _tableAlias?: string
  private _joins: JoinSpec[] = []
  private _conditions: WhereCondition[] = []
  private _groupBy: string[] = []
  private _having: WhereCondition[] = []
  private _orderBy: OrderSpec[] = []
  private _limit?: number
  private _offset?: number
  private _parameterized = false
  private _params: SqlValue[] = []

  // For INSERT
  private _insertColumns: string[] = []
  private _insertValues: SqlValue[][] = []

  // For UPDATE
  private _setValues: Map<string, SqlValue> = new Map()

  // ============================================================================
  // SELECT Operations
  // ============================================================================

  /**
   * Specify columns to select.
   *
   * @param columns - Column names or column specs with aliases
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * .select("id", "name")
   * .select({ column: "email", alias: "user_email" })
   * .select("*")
   * ```
   */
  select(...columns: ColumnSpec[]): this {
    this._operation = "SELECT"
    this._columns.push(...columns)
    return this
  }

  /**
   * Select distinct rows only.
   */
  distinct(): this {
    this._distinct = true
    return this
  }

  /**
   * Specify the table to query from.
   *
   * @param table - Table name
   * @param alias - Optional table alias
   */
  from(table: string, alias?: string): this {
    this._table = table
    this._tableAlias = alias
    return this
  }

  // ============================================================================
  // JOIN Operations
  // ============================================================================

  /**
   * Add a JOIN clause.
   *
   * @param type - Join type (INNER, LEFT, RIGHT, FULL, CROSS)
   * @param table - Table to join
   * @param on - Join condition
   * @param alias - Optional table alias
   */
  join(type: JoinType, table: string, on: string, alias?: string): this {
    this._joins.push({ type, table, alias, on })
    return this
  }

  /**
   * Add an INNER JOIN clause.
   */
  innerJoin(table: string, on: string, alias?: string): this {
    return this.join("INNER", table, on, alias)
  }

  /**
   * Add a LEFT JOIN clause.
   */
  leftJoin(table: string, on: string, alias?: string): this {
    return this.join("LEFT", table, on, alias)
  }

  /**
   * Add a RIGHT JOIN clause.
   */
  rightJoin(table: string, on: string, alias?: string): this {
    return this.join("RIGHT", table, on, alias)
  }

  // ============================================================================
  // WHERE Operations
  // ============================================================================

  /**
   * Add a WHERE condition.
   *
   * @param column - Column name
   * @param operator - Comparison operator
   * @param value - Value to compare against
   *
   * @example
   * ```typescript
   * .where("status", "=", "active")
   * .where("age", ">=", 18)
   * .where("role", "IN", ["admin", "moderator"])
   * .where("deleted_at", "IS", null)
   * ```
   */
  where(column: string, operator: ComparisonOperator, value: SqlValue): this {
    this._conditions.push({
      column,
      operator,
      value,
      logical: "AND"
    })
    return this
  }

  /**
   * Add an OR WHERE condition.
   */
  orWhere(column: string, operator: ComparisonOperator, value: SqlValue): this {
    this._conditions.push({
      column,
      operator,
      value,
      logical: "OR"
    })
    return this
  }

  /**
   * Add a WHERE BETWEEN condition.
   */
  whereBetween(column: string, min: SqlValue, max: SqlValue): this {
    // Use raw expression for BETWEEN
    this._conditions.push({
      column,
      operator: "BETWEEN",
      value: raw(`${formatValue(min)} AND ${formatValue(max)}`),
      logical: "AND"
    })
    return this
  }

  /**
   * Add a WHERE IN condition.
   */
  whereIn(column: string, values: SqlValue[]): this {
    return this.where(column, "IN", values)
  }

  /**
   * Add a WHERE IS NULL condition.
   */
  whereNull(column: string): this {
    return this.where(column, "IS", null)
  }

  /**
   * Add a WHERE IS NOT NULL condition.
   */
  whereNotNull(column: string): this {
    return this.where(column, "IS NOT", null)
  }

  // ============================================================================
  // GROUP BY / HAVING
  // ============================================================================

  /**
   * Add GROUP BY columns.
   */
  groupBy(...columns: string[]): this {
    this._groupBy.push(...columns)
    return this
  }

  /**
   * Add a HAVING condition.
   */
  having(column: string, operator: ComparisonOperator, value: SqlValue): this {
    this._having.push({
      column,
      operator,
      value,
      logical: "AND"
    })
    return this
  }

  // ============================================================================
  // ORDER BY / LIMIT / OFFSET
  // ============================================================================

  /**
   * Add ORDER BY clause.
   *
   * @param column - Column to order by
   * @param direction - Sort direction (ASC or DESC)
   * @param nulls - NULLS FIRST or NULLS LAST
   */
  orderBy(column: string, direction: SortDirection = "ASC", nulls?: "FIRST" | "LAST"): this {
    this._orderBy.push({ column, direction, nulls })
    return this
  }

  /**
   * Set the maximum number of rows to return.
   */
  limit(count: number): this {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("LIMIT must be a non-negative integer")
    }
    this._limit = count
    return this
  }

  /**
   * Set the number of rows to skip.
   */
  offset(count: number): this {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("OFFSET must be a non-negative integer")
    }
    this._offset = count
    return this
  }

  // ============================================================================
  // INSERT Operations
  // ============================================================================

  /**
   * Start an INSERT statement.
   *
   * @param table - Table to insert into
   */
  insertInto(table: string): this {
    this._operation = "INSERT"
    this._table = table
    return this
  }

  /**
   * Specify columns for INSERT.
   */
  columns(...columns: string[]): this {
    this._insertColumns = columns
    return this
  }

  /**
   * Add values to INSERT.
   * Can be called multiple times for multi-row inserts.
   *
   * @param values - Values corresponding to columns
   */
  values(...values: SqlValue[]): this {
    this._insertValues.push(values)
    return this
  }

  // ============================================================================
  // UPDATE Operations
  // ============================================================================

  /**
   * Start an UPDATE statement.
   *
   * @param table - Table to update
   */
  update(table: string): this {
    this._operation = "UPDATE"
    this._table = table
    return this
  }

  /**
   * Set a column value for UPDATE.
   *
   * @param column - Column to update
   * @param value - New value
   */
  set(column: string, value: SqlValue): this {
    this._setValues.set(column, value)
    return this
  }

  /**
   * Set multiple column values for UPDATE.
   *
   * @param values - Object mapping column names to values
   */
  setMany(values: Record<string, SqlValue>): this {
    for (const [column, value] of Object.entries(values)) {
      this._setValues.set(column, value)
    }
    return this
  }

  // ============================================================================
  // DELETE Operations
  // ============================================================================

  /**
   * Start a DELETE statement.
   *
   * @param table - Table to delete from
   */
  deleteFrom(table: string): this {
    this._operation = "DELETE"
    this._table = table
    return this
  }

  // ============================================================================
  // Build Methods
  // ============================================================================

  /**
   * Build the SQL query string.
   *
   * @returns The complete SQL query string
   */
  build(): string {
    switch (this._operation) {
      case "SELECT":
        return this.buildSelect()
      case "INSERT":
        return this.buildInsert()
      case "UPDATE":
        return this.buildUpdate()
      case "DELETE":
        return this.buildDelete()
    }
  }

  /**
   * Build query with parameter placeholders for prepared statements.
   *
   * @returns Object containing SQL with placeholders and parameter values
   */
  buildParameterized(): BuiltQuery {
    this._parameterized = true
    this._params = []

    const sql = this.build()

    return {
      sql,
      params: this._params
    }
  }

  /**
   * Create a copy of this query builder.
   */
  clone(): QueryBuilder {
    const cloned = new QueryBuilder()
    cloned._operation = this._operation
    cloned._distinct = this._distinct
    cloned._columns = [...this._columns]
    cloned._table = this._table
    cloned._tableAlias = this._tableAlias
    cloned._joins = [...this._joins]
    cloned._conditions = [...this._conditions]
    cloned._groupBy = [...this._groupBy]
    cloned._having = [...this._having]
    cloned._orderBy = [...this._orderBy]
    cloned._limit = this._limit
    cloned._offset = this._offset
    cloned._insertColumns = [...this._insertColumns]
    cloned._insertValues = this._insertValues.map((v) => [...v])
    cloned._setValues = new Map(this._setValues)
    return cloned
  }

  /**
   * Reset the builder to initial state.
   */
  reset(): this {
    this._operation = "SELECT"
    this._distinct = false
    this._columns = []
    this._table = ""
    this._tableAlias = undefined
    this._joins = []
    this._conditions = []
    this._groupBy = []
    this._having = []
    this._orderBy = []
    this._limit = undefined
    this._offset = undefined
    this._parameterized = false
    this._params = []
    this._insertColumns = []
    this._insertValues = []
    this._setValues.clear()
    return this
  }

  // ============================================================================
  // Private Build Methods
  // ============================================================================

  private buildSelect(): string {
    const parts: string[] = []

    // SELECT
    parts.push("SELECT")
    if (this._distinct) {
      parts.push("DISTINCT")
    }

    // Columns
    const columns =
      this._columns.length === 0
        ? "*"
        : this._columns
            .map((col) => {
              if (typeof col === "string") {
                return escapeIdentifier(col)
              }
              return `${escapeIdentifier(col.column)} AS ${escapeIdentifier(col.alias)}`
            })
            .join(", ")
    parts.push(columns)

    // FROM
    if (this._table) {
      parts.push("FROM")
      let tableRef = escapeIdentifier(this._table)
      if (this._tableAlias) {
        tableRef += ` AS ${escapeIdentifier(this._tableAlias)}`
      }
      parts.push(tableRef)
    }

    // JOINs
    for (const join of this._joins) {
      let joinClause = `${join.type} JOIN ${escapeIdentifier(join.table)}`
      if (join.alias) {
        joinClause += ` AS ${escapeIdentifier(join.alias)}`
      }
      if (join.type !== "CROSS") {
        joinClause += ` ON ${join.on}`
      }
      parts.push(joinClause)
    }

    // WHERE
    if (this._conditions.length > 0) {
      parts.push("WHERE")
      parts.push(this.buildConditions(this._conditions))
    }

    // GROUP BY
    if (this._groupBy.length > 0) {
      parts.push("GROUP BY")
      parts.push(this._groupBy.map(escapeIdentifier).join(", "))
    }

    // HAVING
    if (this._having.length > 0) {
      parts.push("HAVING")
      parts.push(this.buildConditions(this._having))
    }

    // ORDER BY
    if (this._orderBy.length > 0) {
      parts.push("ORDER BY")
      parts.push(
        this._orderBy
          .map((spec) => {
            let clause = `${escapeIdentifier(spec.column)} ${spec.direction}`
            if (spec.nulls) {
              clause += ` NULLS ${spec.nulls}`
            }
            return clause
          })
          .join(", ")
      )
    }

    // LIMIT
    if (this._limit !== undefined) {
      parts.push(`LIMIT ${String(this._limit)}`)
    }

    // OFFSET
    if (this._offset !== undefined) {
      parts.push(`OFFSET ${String(this._offset)}`)
    }

    return parts.join(" ")
  }

  private buildInsert(): string {
    if (!this._table) {
      throw new Error("INSERT requires a table name")
    }
    if (this._insertColumns.length === 0) {
      throw new Error("INSERT requires columns")
    }
    if (this._insertValues.length === 0) {
      throw new Error("INSERT requires values")
    }

    const parts: string[] = []

    // INSERT INTO
    parts.push(`INSERT INTO ${escapeIdentifier(this._table)}`)

    // Columns
    parts.push(`(${this._insertColumns.map(escapeIdentifier).join(", ")})`)

    // VALUES
    parts.push("VALUES")
    const valueRows = this._insertValues.map((row) => {
      const formattedValues = row.map((v) => this.formatOrParam(v))
      return `(${formattedValues.join(", ")})`
    })
    parts.push(valueRows.join(", "))

    return parts.join(" ")
  }

  private buildUpdate(): string {
    if (!this._table) {
      throw new Error("UPDATE requires a table name")
    }
    if (this._setValues.size === 0) {
      throw new Error("UPDATE requires SET values")
    }

    const parts: string[] = []

    // UPDATE
    parts.push(`UPDATE ${escapeIdentifier(this._table)}`)

    // SET
    parts.push("SET")
    const setClauses: string[] = []
    for (const [column, value] of this._setValues) {
      setClauses.push(`${escapeIdentifier(column)} = ${this.formatOrParam(value)}`)
    }
    parts.push(setClauses.join(", "))

    // WHERE
    if (this._conditions.length > 0) {
      parts.push("WHERE")
      parts.push(this.buildConditions(this._conditions))
    }

    return parts.join(" ")
  }

  private buildDelete(): string {
    if (!this._table) {
      throw new Error("DELETE requires a table name")
    }

    const parts: string[] = []

    // DELETE FROM
    parts.push(`DELETE FROM ${escapeIdentifier(this._table)}`)

    // WHERE
    if (this._conditions.length > 0) {
      parts.push("WHERE")
      parts.push(this.buildConditions(this._conditions))
    }

    return parts.join(" ")
  }

  private buildConditions(conditions: WhereCondition[]): string {
    return conditions
      .map((cond, index) => {
        const prefix = index === 0 ? "" : `${cond.logical} `
        const column = escapeIdentifier(cond.column)
        const value = this.formatOrParam(cond.value)
        return `${prefix}${column} ${cond.operator} ${value}`
      })
      .join(" ")
  }

  private formatOrParam(value: SqlValue): string {
    if (this._parameterized && !isRaw(value)) {
      this._params.push(value)
      return `$${String(this._params.length)}`
    }
    return formatValue(value)
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a new QueryBuilder for a SELECT query.
 *
 * @param columns - Columns to select
 * @returns A new QueryBuilder with SELECT initialized
 */
export function select(...columns: ColumnSpec[]): QueryBuilder {
  return new QueryBuilder().select(...columns)
}

/**
 * Create a new QueryBuilder for an INSERT query.
 *
 * @param table - Table to insert into
 * @returns A new QueryBuilder with INSERT initialized
 */
export function insertInto(table: string): QueryBuilder {
  return new QueryBuilder().insertInto(table)
}

/**
 * Create a new QueryBuilder for an UPDATE query.
 *
 * @param table - Table to update
 * @returns A new QueryBuilder with UPDATE initialized
 */
export function update(table: string): QueryBuilder {
  return new QueryBuilder().update(table)
}

/**
 * Create a new QueryBuilder for a DELETE query.
 *
 * @param table - Table to delete from
 * @returns A new QueryBuilder with DELETE initialized
 */
export function deleteFrom(table: string): QueryBuilder {
  return new QueryBuilder().deleteFrom(table)
}

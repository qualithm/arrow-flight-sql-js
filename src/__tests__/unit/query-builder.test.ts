/**
 * Unit tests for SQL query builder
 */

import { describe, expect, test } from "bun:test"

import {
  deleteFrom,
  escapeIdentifier,
  escapeString,
  formatValue,
  insertInto,
  QueryBuilder,
  raw,
  select,
  update
} from "../../query-builder"

// ============================================================================
// Escaping Functions
// ============================================================================

describe("escapeIdentifier", () => {
  test("should wrap simple identifier in double quotes", () => {
    expect(escapeIdentifier("users")).toBe('"users"')
  })

  test("should escape double quotes inside identifier", () => {
    expect(escapeIdentifier('table"name')).toBe('"table""name"')
  })

  test("should handle qualified names (schema.table)", () => {
    expect(escapeIdentifier("public.users")).toBe('"public"."users"')
  })

  test("should handle three-part names (catalog.schema.table)", () => {
    expect(escapeIdentifier("catalog.public.users")).toBe('"catalog"."public"."users"')
  })

  test("should preserve wildcard *", () => {
    expect(escapeIdentifier("*")).toBe("*")
  })

  test("should preserve function calls with parentheses", () => {
    expect(escapeIdentifier("COUNT(*)")).toBe("COUNT(*)")
    expect(escapeIdentifier("UPPER(name)")).toBe("UPPER(name)")
  })
})

describe("escapeString", () => {
  test("should wrap string in single quotes", () => {
    expect(escapeString("hello")).toBe("'hello'")
  })

  test("should escape single quotes by doubling", () => {
    expect(escapeString("it's")).toBe("'it''s'")
  })

  test("should handle multiple single quotes", () => {
    expect(escapeString("it's Bob's")).toBe("'it''s Bob''s'")
  })

  test("should handle empty string", () => {
    expect(escapeString("")).toBe("''")
  })
})

describe("formatValue", () => {
  test("should format null as NULL", () => {
    expect(formatValue(null)).toBe("NULL")
  })

  test("should format strings with escaping", () => {
    expect(formatValue("hello")).toBe("'hello'")
    expect(formatValue("it's")).toBe("'it''s'")
  })

  test("should format numbers", () => {
    expect(formatValue(42)).toBe("42")
    expect(formatValue(3.14)).toBe("3.14")
    expect(formatValue(-10)).toBe("-10")
  })

  test("should throw on non-finite numbers", () => {
    expect(() => formatValue(Infinity)).toThrow("Invalid numeric value")
    expect(() => formatValue(NaN)).toThrow("Invalid numeric value")
  })

  test("should format bigint", () => {
    expect(formatValue(9007199254740993n)).toBe("9007199254740993")
  })

  test("should format booleans", () => {
    expect(formatValue(true)).toBe("TRUE")
    expect(formatValue(false)).toBe("FALSE")
  })

  test("should format Date as TIMESTAMP", () => {
    const date = new Date("2024-01-15T10:30:00.000Z")
    expect(formatValue(date)).toBe("TIMESTAMP '2024-01-15T10:30:00.000Z'")
  })

  test("should format arrays as parenthesized lists", () => {
    expect(formatValue([1, 2, 3])).toBe("(1, 2, 3)")
    expect(formatValue(["a", "b"])).toBe("('a', 'b')")
  })

  test("should format nested arrays", () => {
    expect(
      formatValue([
        [1, 2],
        [3, 4]
      ])
    ).toBe("((1, 2), (3, 4))")
  })

  test("should pass through raw expressions", () => {
    expect(formatValue(raw("NOW()"))).toBe("NOW()")
    expect(formatValue(raw("CURRENT_TIMESTAMP"))).toBe("CURRENT_TIMESTAMP")
  })
})

describe("raw", () => {
  test("should create raw expression", () => {
    const expr = raw("NOW()")
    expect(expr.__raw).toBe(true)
    expect(expr.sql).toBe("NOW()")
  })
})

// ============================================================================
// SELECT Queries
// ============================================================================

describe("QueryBuilder SELECT", () => {
  test("should build simple SELECT *", () => {
    const sql = new QueryBuilder().from("users").build()
    expect(sql).toBe('SELECT * FROM "users"')
  })

  test("should build SELECT with columns", () => {
    const sql = new QueryBuilder().select("id", "name").from("users").build()
    expect(sql).toBe('SELECT "id", "name" FROM "users"')
  })

  test("should build SELECT with column aliases", () => {
    const sql = new QueryBuilder()
      .select("id", { column: "email", alias: "user_email" })
      .from("users")
      .build()
    expect(sql).toBe('SELECT "id", "email" AS "user_email" FROM "users"')
  })

  test("should build SELECT DISTINCT", () => {
    const sql = new QueryBuilder().select("category").distinct().from("products").build()
    expect(sql).toBe('SELECT DISTINCT "category" FROM "products"')
  })

  test("should build SELECT with table alias", () => {
    const sql = new QueryBuilder().select("u.id").from("users", "u").build()
    expect(sql).toBe('SELECT "u"."id" FROM "users" AS "u"')
  })

  test("should build SELECT with WHERE clause", () => {
    const sql = new QueryBuilder().select("*").from("users").where("status", "=", "active").build()
    expect(sql).toBe('SELECT * FROM "users" WHERE "status" = \'active\'')
  })

  test("should build SELECT with multiple WHERE conditions (AND)", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users")
      .where("status", "=", "active")
      .where("age", ">=", 18)
      .build()
    expect(sql).toBe('SELECT * FROM "users" WHERE "status" = \'active\' AND "age" >= 18')
  })

  test("should build SELECT with OR WHERE", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users")
      .where("role", "=", "admin")
      .orWhere("role", "=", "moderator")
      .build()
    expect(sql).toBe('SELECT * FROM "users" WHERE "role" = \'admin\' OR "role" = \'moderator\'')
  })

  test("should build SELECT with WHERE IN", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users")
      .whereIn("status", ["active", "pending"])
      .build()
    expect(sql).toBe("SELECT * FROM \"users\" WHERE \"status\" IN ('active', 'pending')")
  })

  test("should build SELECT with WHERE NULL", () => {
    const sql = new QueryBuilder().select("*").from("users").whereNull("deleted_at").build()
    expect(sql).toBe('SELECT * FROM "users" WHERE "deleted_at" IS NULL')
  })

  test("should build SELECT with WHERE NOT NULL", () => {
    const sql = new QueryBuilder().select("*").from("users").whereNotNull("email").build()
    expect(sql).toBe('SELECT * FROM "users" WHERE "email" IS NOT NULL')
  })

  test("should build SELECT with WHERE BETWEEN", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("orders")
      .whereBetween("amount", 100, 500)
      .build()
    expect(sql).toBe('SELECT * FROM "orders" WHERE "amount" BETWEEN 100 AND 500')
  })

  test("should build SELECT with ORDER BY", () => {
    const sql = new QueryBuilder().select("*").from("users").orderBy("created_at", "DESC").build()
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "created_at" DESC')
  })

  test("should build SELECT with multiple ORDER BY", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users")
      .orderBy("status", "ASC")
      .orderBy("created_at", "DESC")
      .build()
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "status" ASC, "created_at" DESC')
  })

  test("should build SELECT with ORDER BY NULLS FIRST/LAST", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users")
      .orderBy("deleted_at", "DESC", "LAST")
      .build()
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "deleted_at" DESC NULLS LAST')
  })

  test("should build SELECT with LIMIT", () => {
    const sql = new QueryBuilder().select("*").from("users").limit(10).build()
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10')
  })

  test("should build SELECT with OFFSET", () => {
    const sql = new QueryBuilder().select("*").from("users").limit(10).offset(20).build()
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10 OFFSET 20')
  })

  test("should throw on invalid LIMIT", () => {
    expect(() => new QueryBuilder().limit(-1)).toThrow("non-negative integer")
    expect(() => new QueryBuilder().limit(3.5)).toThrow("non-negative integer")
  })

  test("should throw on invalid OFFSET", () => {
    expect(() => new QueryBuilder().offset(-1)).toThrow("non-negative integer")
  })

  test("should build SELECT with GROUP BY", () => {
    const sql = new QueryBuilder()
      .select("status", "COUNT(*)")
      .from("users")
      .groupBy("status")
      .build()
    expect(sql).toBe('SELECT "status", COUNT(*) FROM "users" GROUP BY "status"')
  })

  test("should build SELECT with HAVING", () => {
    const sql = new QueryBuilder()
      .select("status", "COUNT(*)")
      .from("users")
      .groupBy("status")
      .having("COUNT(*)", ">", 5)
      .build()
    expect(sql).toBe('SELECT "status", COUNT(*) FROM "users" GROUP BY "status" HAVING COUNT(*) > 5')
  })

  test("should build SELECT with raw expression in WHERE", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("events")
      .where("created_at", ">", raw("NOW() - INTERVAL '1 day'"))
      .build()
    expect(sql).toBe('SELECT * FROM "events" WHERE "created_at" > NOW() - INTERVAL \'1 day\'')
  })
})

// ============================================================================
// JOIN Queries
// ============================================================================

describe("QueryBuilder JOIN", () => {
  test("should build INNER JOIN", () => {
    const sql = new QueryBuilder()
      .select("u.name", "o.total")
      .from("users", "u")
      .innerJoin("orders", "o.user_id = u.id", "o")
      .build()
    expect(sql).toBe(
      'SELECT "u"."name", "o"."total" FROM "users" AS "u" INNER JOIN "orders" AS "o" ON o.user_id = u.id'
    )
  })

  test("should build LEFT JOIN", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users", "u")
      .leftJoin("profiles", "p.user_id = u.id", "p")
      .build()
    expect(sql).toBe('SELECT * FROM "users" AS "u" LEFT JOIN "profiles" AS "p" ON p.user_id = u.id')
  })

  test("should build RIGHT JOIN", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("orders")
      .rightJoin("users", "users.id = orders.user_id")
      .build()
    expect(sql).toBe('SELECT * FROM "orders" RIGHT JOIN "users" ON users.id = orders.user_id')
  })

  test("should build multiple JOINs", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("orders", "o")
      .innerJoin("users", "u.id = o.user_id", "u")
      .leftJoin("products", "p.id = o.product_id", "p")
      .build()
    expect(sql).toBe(
      'SELECT * FROM "orders" AS "o" INNER JOIN "users" AS "u" ON u.id = o.user_id LEFT JOIN "products" AS "p" ON p.id = o.product_id'
    )
  })

  test("should build CROSS JOIN", () => {
    const sql = new QueryBuilder().select("*").from("colors").join("CROSS", "sizes", "").build()
    expect(sql).toBe('SELECT * FROM "colors" CROSS JOIN "sizes"')
  })
})

// ============================================================================
// INSERT Queries
// ============================================================================

describe("QueryBuilder INSERT", () => {
  test("should build simple INSERT", () => {
    const sql = new QueryBuilder()
      .insertInto("users")
      .columns("name", "email")
      .values("Alice", "alice@example.com")
      .build()
    expect(sql).toBe(
      'INSERT INTO "users" ("name", "email") VALUES (\'Alice\', \'alice@example.com\')'
    )
  })

  test("should build INSERT with multiple rows", () => {
    const sql = new QueryBuilder()
      .insertInto("users")
      .columns("name", "email")
      .values("Alice", "alice@example.com")
      .values("Bob", "bob@example.com")
      .build()
    expect(sql).toBe(
      "INSERT INTO \"users\" (\"name\", \"email\") VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com')"
    )
  })

  test("should build INSERT with various value types", () => {
    const sql = new QueryBuilder()
      .insertInto("products")
      .columns("name", "price", "active")
      .values("Widget", 29.99, true)
      .build()
    expect(sql).toBe(
      'INSERT INTO "products" ("name", "price", "active") VALUES (\'Widget\', 29.99, TRUE)'
    )
  })

  test("should build INSERT with NULL", () => {
    const sql = new QueryBuilder()
      .insertInto("users")
      .columns("name", "deleted_at")
      .values("Alice", null)
      .build()
    expect(sql).toBe('INSERT INTO "users" ("name", "deleted_at") VALUES (\'Alice\', NULL)')
  })

  test("should throw on INSERT without table", () => {
    expect(() => new QueryBuilder().insertInto("").columns("a").values(1).build()).toThrow(
      "INSERT requires a table name"
    )
  })

  test("should throw on INSERT without columns", () => {
    expect(() => new QueryBuilder().insertInto("users").values(1).build()).toThrow(
      "INSERT requires columns"
    )
  })

  test("should throw on INSERT without values", () => {
    expect(() => new QueryBuilder().insertInto("users").columns("a").build()).toThrow(
      "INSERT requires values"
    )
  })
})

// ============================================================================
// UPDATE Queries
// ============================================================================

describe("QueryBuilder UPDATE", () => {
  test("should build simple UPDATE", () => {
    const sql = new QueryBuilder().update("users").set("status", "inactive").build()
    expect(sql).toBe('UPDATE "users" SET "status" = \'inactive\'')
  })

  test("should build UPDATE with multiple SET", () => {
    const sql = new QueryBuilder()
      .update("users")
      .set("status", "inactive")
      .set("updated_at", raw("NOW()"))
      .build()
    expect(sql).toBe('UPDATE "users" SET "status" = \'inactive\', "updated_at" = NOW()')
  })

  test("should build UPDATE with setMany", () => {
    const sql = new QueryBuilder()
      .update("users")
      .setMany({ status: "inactive", role: "guest" })
      .build()
    expect(sql).toBe('UPDATE "users" SET "status" = \'inactive\', "role" = \'guest\'')
  })

  test("should build UPDATE with WHERE", () => {
    const sql = new QueryBuilder()
      .update("users")
      .set("status", "inactive")
      .where("id", "=", 123)
      .build()
    expect(sql).toBe('UPDATE "users" SET "status" = \'inactive\' WHERE "id" = 123')
  })

  test("should build UPDATE with Date", () => {
    const date = new Date("2024-01-15T10:30:00.000Z")
    const sql = new QueryBuilder().update("users").set("last_login", date).build()
    expect(sql).toBe('UPDATE "users" SET "last_login" = TIMESTAMP \'2024-01-15T10:30:00.000Z\'')
  })

  test("should throw on UPDATE without table", () => {
    expect(() => new QueryBuilder().update("").set("a", 1).build()).toThrow(
      "UPDATE requires a table name"
    )
  })

  test("should throw on UPDATE without SET", () => {
    expect(() => new QueryBuilder().update("users").build()).toThrow("UPDATE requires SET values")
  })
})

// ============================================================================
// DELETE Queries
// ============================================================================

describe("QueryBuilder DELETE", () => {
  test("should build simple DELETE", () => {
    const sql = new QueryBuilder().deleteFrom("users").build()
    expect(sql).toBe('DELETE FROM "users"')
  })

  test("should build DELETE with WHERE", () => {
    const sql = new QueryBuilder().deleteFrom("users").where("status", "=", "deleted").build()
    expect(sql).toBe('DELETE FROM "users" WHERE "status" = \'deleted\'')
  })

  test("should build DELETE with multiple WHERE", () => {
    const sql = new QueryBuilder()
      .deleteFrom("sessions")
      .where("expired_at", "<", raw("NOW()"))
      .where("user_id", "=", 42)
      .build()
    expect(sql).toBe('DELETE FROM "sessions" WHERE "expired_at" < NOW() AND "user_id" = 42')
  })

  test("should throw on DELETE without table", () => {
    expect(() => new QueryBuilder().deleteFrom("").build()).toThrow("DELETE requires a table name")
  })
})

// ============================================================================
// Parameterized Queries
// ============================================================================

describe("QueryBuilder parameterized", () => {
  test("should build parameterized SELECT", () => {
    const result = new QueryBuilder()
      .select("*")
      .from("users")
      .where("status", "=", "active")
      .where("age", ">=", 18)
      .buildParameterized()

    expect(result.sql).toBe('SELECT * FROM "users" WHERE "status" = $1 AND "age" >= $2')
    expect(result.params).toEqual(["active", 18])
  })

  test("should build parameterized INSERT", () => {
    const result = new QueryBuilder()
      .insertInto("users")
      .columns("name", "email")
      .values("Alice", "alice@example.com")
      .buildParameterized()

    expect(result.sql).toBe('INSERT INTO "users" ("name", "email") VALUES ($1, $2)')
    expect(result.params).toEqual(["Alice", "alice@example.com"])
  })

  test("should preserve raw expressions in parameterized mode", () => {
    const result = new QueryBuilder()
      .update("users")
      .set("updated_at", raw("NOW()"))
      .set("status", "active")
      .where("id", "=", 42)
      .buildParameterized()

    expect(result.sql).toBe(
      'UPDATE "users" SET "updated_at" = NOW(), "status" = $1 WHERE "id" = $2'
    )
    expect(result.params).toEqual(["active", 42])
  })
})

// ============================================================================
// Utility Methods
// ============================================================================

describe("QueryBuilder utilities", () => {
  test("should clone builder", () => {
    const original = new QueryBuilder().select("*").from("users").where("status", "=", "active")

    const cloned = original.clone()
    cloned.where("role", "=", "admin")

    expect(original.build()).toBe('SELECT * FROM "users" WHERE "status" = \'active\'')
    expect(cloned.build()).toBe(
      'SELECT * FROM "users" WHERE "status" = \'active\' AND "role" = \'admin\''
    )
  })

  test("should reset builder", () => {
    const builder = new QueryBuilder()
      .select("*")
      .from("users")
      .where("status", "=", "active")
      .limit(10)

    builder.reset()

    expect(builder.build()).toBe("SELECT *")
  })
})

// ============================================================================
// Convenience Functions
// ============================================================================

describe("Convenience functions", () => {
  test("select() creates SELECT builder", () => {
    const sql = select("id", "name").from("users").build()
    expect(sql).toBe('SELECT "id", "name" FROM "users"')
  })

  test("insertInto() creates INSERT builder", () => {
    const sql = insertInto("users").columns("name").values("Alice").build()
    expect(sql).toBe('INSERT INTO "users" ("name") VALUES (\'Alice\')')
  })

  test("update() creates UPDATE builder", () => {
    const sql = update("users").set("status", "active").build()
    expect(sql).toBe('UPDATE "users" SET "status" = \'active\'')
  })

  test("deleteFrom() creates DELETE builder", () => {
    const sql = deleteFrom("users").where("id", "=", 1).build()
    expect(sql).toBe('DELETE FROM "users" WHERE "id" = 1')
  })
})

// ============================================================================
// Edge Cases and Security
// ============================================================================

describe("Security and edge cases", () => {
  test("should escape SQL injection in string values", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users")
      .where("name", "=", "Robert'; DROP TABLE users; --")
      .build()
    expect(sql).toBe("SELECT * FROM \"users\" WHERE \"name\" = 'Robert''; DROP TABLE users; --'")
  })

  test("should escape SQL injection in identifiers", () => {
    const sql = new QueryBuilder().select("id").from('users"; DROP TABLE users; --').build()
    expect(sql).toBe('SELECT "id" FROM "users""; DROP TABLE users; --"')
  })

  test("should handle empty string values", () => {
    const sql = new QueryBuilder().select("*").from("users").where("name", "=", "").build()
    expect(sql).toBe('SELECT * FROM "users" WHERE "name" = \'\'')
  })

  test("should handle unicode in values", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users")
      .where("name", "=", "日本語名前")
      .build()
    expect(sql).toBe('SELECT * FROM "users" WHERE "name" = \'日本語名前\'')
  })

  test("should handle special characters", () => {
    const sql = new QueryBuilder()
      .select("*")
      .from("users")
      .where("bio", "LIKE", "%special\\char%")
      .build()
    expect(sql).toBe('SELECT * FROM "users" WHERE "bio" LIKE \'%special\\char%\'')
  })
})

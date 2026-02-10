/**
 * Query builder benchmarks
 */

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
} from "../src/query-builder"
import type { Benchmark } from "./runner"

export const queryBuilderBenchmarks: Benchmark[] = [
  // Value formatting
  {
    name: "escapeIdentifier (simple)",
    fn: (): void => {
      escapeIdentifier("users")
    },
    iterations: 500_000
  },
  {
    name: "escapeIdentifier (qualified)",
    fn: (): void => {
      escapeIdentifier("catalog.schema.table")
    },
    iterations: 500_000
  },
  {
    name: "escapeString (simple)",
    fn: (): void => {
      escapeString("hello world")
    },
    iterations: 500_000
  },
  {
    name: "escapeString (with quotes)",
    fn: (): void => {
      escapeString("it's a test's value")
    },
    iterations: 500_000
  },
  {
    name: "formatValue (string)",
    fn: (): void => {
      formatValue("hello world")
    },
    iterations: 500_000
  },
  {
    name: "formatValue (number)",
    fn: (): void => {
      formatValue(3.14159)
    },
    iterations: 500_000
  },
  {
    name: "formatValue (Date)",
    fn: (): void => {
      formatValue(new Date("2024-01-15T10:30:00.000Z"))
    },
    iterations: 100_000
  },
  {
    name: "formatValue (array)",
    fn: (): void => {
      formatValue([1, 2, 3, 4, 5])
    },
    iterations: 200_000
  },

  // Simple SELECT queries
  {
    name: "SELECT * FROM table",
    fn: (): void => {
      new QueryBuilder().from("users").build()
    },
    iterations: 100_000
  },
  {
    name: "SELECT with columns",
    fn: (): void => {
      select("id", "name", "email").from("users").build()
    },
    iterations: 100_000
  },
  {
    name: "SELECT with WHERE",
    fn: (): void => {
      select("*").from("users").where("status", "=", "active").build()
    },
    iterations: 100_000
  },

  // Complex SELECT queries
  {
    name: "SELECT complex (5 conditions)",
    fn: (): void => {
      select("id", "name", "email", "status", "role")
        .from("users")
        .where("status", "=", "active")
        .where("role", "IN", ["admin", "moderator", "editor"])
        .where("age", ">=", 18)
        .whereNotNull("email")
        .whereBetween("created_at", "2024-01-01", "2024-12-31")
        .orderBy("created_at", "DESC")
        .limit(50)
        .offset(100)
        .build()
    },
    iterations: 50_000
  },
  {
    name: "SELECT with JOIN",
    fn: (): void => {
      select("u.id", "u.name", "o.total")
        .from("users", "u")
        .innerJoin("orders", "o.user_id = u.id", "o")
        .where("o.status", "=", "completed")
        .orderBy("o.total", "DESC")
        .limit(10)
        .build()
    },
    iterations: 50_000
  },
  {
    name: "SELECT with multiple JOINs",
    fn: (): void => {
      select("u.name", "p.title", "c.name")
        .from("users", "u")
        .innerJoin("posts", "p.author_id = u.id", "p")
        .leftJoin("categories", "c.id = p.category_id", "c")
        .leftJoin("comments", "cm.post_id = p.id", "cm")
        .where("u.status", "=", "active")
        .groupBy("u.name", "p.title", "c.name")
        .having("COUNT(cm.id)", ">", 5)
        .orderBy("u.name", "ASC")
        .build()
    },
    iterations: 30_000
  },

  // INSERT queries
  {
    name: "INSERT single row",
    fn: (): void => {
      insertInto("users")
        .columns("name", "email", "status")
        .values("Alice", "alice@example.com", "active")
        .build()
    },
    iterations: 100_000
  },
  {
    name: "INSERT multiple rows (5)",
    fn: (): void => {
      insertInto("users")
        .columns("name", "email", "status")
        .values("Alice", "alice@example.com", "active")
        .values("Bob", "bob@example.com", "active")
        .values("Charlie", "charlie@example.com", "pending")
        .values("Diana", "diana@example.com", "active")
        .values("Eve", "eve@example.com", "inactive")
        .build()
    },
    iterations: 50_000
  },

  // UPDATE queries
  {
    name: "UPDATE simple",
    fn: (): void => {
      update("users").set("status", "inactive").where("id", "=", 123).build()
    },
    iterations: 100_000
  },
  {
    name: "UPDATE with setMany",
    fn: (): void => {
      update("users")
        .set("status", "inactive")
        .set("updated_at", raw("NOW()"))
        .set("last_login", null)
        .set("login_count", 0)
        .where("id", "=", 123)
        .build()
    },
    iterations: 50_000
  },

  // DELETE queries
  {
    name: "DELETE simple",
    fn: (): void => {
      deleteFrom("sessions").where("expired_at", "<", raw("NOW()")).build()
    },
    iterations: 100_000
  },

  // Parameterized queries
  {
    name: "SELECT parameterized",
    fn: (): void => {
      select("*")
        .from("users")
        .where("status", "=", "active")
        .where("role", "=", "admin")
        .buildParameterized()
    },
    iterations: 50_000
  },

  // Clone and reuse
  {
    name: "clone and extend",
    fn: (): void => {
      const base = select("*").from("users").where("status", "=", "active")
      const extended = base.clone().where("role", "=", "admin").limit(10)
      extended.build()
    },
    iterations: 50_000
  }
]

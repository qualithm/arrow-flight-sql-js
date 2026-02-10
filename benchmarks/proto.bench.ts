/**
 * Protocol buffer encoding benchmarks
 */

import {
  encodeCommandGetCatalogs,
  encodeCommandGetDbSchemas,
  encodeCommandGetTables,
  encodeCommandStatementQuery,
  encodeCommandStatementUpdate
} from "../src/proto"
import type { Benchmark } from "./runner"

// Simple query
const simpleQuery = "SELECT * FROM users"

// Complex query
const complexQuery = `
  SELECT u.id, u.name, u.email, COUNT(o.id) as order_count
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  WHERE u.status = 'active'
    AND u.created_at > '2024-01-01'
  GROUP BY u.id, u.name, u.email
  HAVING COUNT(o.id) > 5
  ORDER BY order_count DESC
  LIMIT 100
`

// Very long query (simulating complex analytics)
const longQuery = `
  WITH monthly_stats AS (
    SELECT 
      DATE_TRUNC('month', created_at) as month,
      user_id,
      COUNT(*) as events,
      SUM(amount) as total_amount,
      AVG(amount) as avg_amount,
      MIN(amount) as min_amount,
      MAX(amount) as max_amount
    FROM events
    WHERE created_at >= '2023-01-01'
      AND created_at < '2024-01-01'
      AND status IN ('completed', 'processed', 'verified')
    GROUP BY DATE_TRUNC('month', created_at), user_id
  ),
  user_ranks AS (
    SELECT 
      *,
      ROW_NUMBER() OVER (PARTITION BY month ORDER BY total_amount DESC) as rank
    FROM monthly_stats
  )
  SELECT 
    ur.month,
    ur.user_id,
    u.name,
    u.email,
    ur.events,
    ur.total_amount,
    ur.avg_amount,
    ur.rank
  FROM user_ranks ur
  JOIN users u ON u.id = ur.user_id
  WHERE ur.rank <= 10
  ORDER BY ur.month, ur.rank
`

export const protoBenchmarks: Benchmark[] = [
  {
    name: "encodeCommandStatementQuery (simple)",
    fn: (): void => {
      encodeCommandStatementQuery(simpleQuery)
    },
    iterations: 100_000
  },
  {
    name: "encodeCommandStatementQuery (complex)",
    fn: (): void => {
      encodeCommandStatementQuery(complexQuery)
    },
    iterations: 100_000
  },
  {
    name: "encodeCommandStatementQuery (long)",
    fn: (): void => {
      encodeCommandStatementQuery(longQuery)
    },
    iterations: 50_000
  },
  {
    name: "encodeCommandStatementQuery with txn",
    fn: (): void => {
      encodeCommandStatementQuery(simpleQuery, new Uint8Array([1, 2, 3, 4]))
    },
    iterations: 100_000
  },
  {
    name: "encodeCommandStatementUpdate",
    fn: (): void => {
      encodeCommandStatementUpdate("UPDATE users SET status = 'inactive' WHERE id = 123")
    },
    iterations: 100_000
  },
  {
    name: "encodeCommandGetCatalogs",
    fn: (): void => {
      encodeCommandGetCatalogs()
    },
    iterations: 100_000
  },
  {
    name: "encodeCommandGetDbSchemas",
    fn: (): void => {
      encodeCommandGetDbSchemas()
    },
    iterations: 100_000
  },
  {
    name: "encodeCommandGetDbSchemas (filtered)",
    fn: (): void => {
      encodeCommandGetDbSchemas("catalog", "public%")
    },
    iterations: 100_000
  },
  {
    name: "encodeCommandGetTables",
    fn: (): void => {
      encodeCommandGetTables({})
    },
    iterations: 100_000
  },
  {
    name: "encodeCommandGetTables (all filters)",
    fn: (): void => {
      encodeCommandGetTables({
        catalog: "catalog",
        dbSchemaFilterPattern: "public",
        tableNameFilterPattern: "users%",
        tableTypes: ["TABLE", "VIEW"],
        includeSchema: true
      })
    },
    iterations: 100_000
  }
]

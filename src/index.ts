/**
 * @qualithm/arrow-flight-sql
 *
 * A standards-compliant Arrow Flight SQL client for JavaScript/TypeScript.
 *
 * @example
 * ```typescript
 * import { FlightSqlClient } from "@qualithm/arrow-flight-sql"
 *
 * const client = new FlightSqlClient({
 *   host: "localhost",
 *   port: 50051,
 *   tls: false,
 *   auth: { type: "bearer", token: "my-token" }
 * })
 *
 * await client.connect()
 *
 * const result = await client.query("SELECT * FROM users")
 * for await (const batch of result.stream()) {
 *   console.log(batch.numRows)
 * }
 *
 * await client.close()
 * ```
 *
 * @packageDocumentation
 */

// Main client and result classes
export { FlightSqlClient, PreparedStatement, QueryResult } from "./client"

// Error types
export {
  AuthenticationError,
  CancelledError,
  ConnectionError,
  FlightSqlError,
  fromGrpcStatus,
  NotFoundError,
  ProtocolError,
  QueryError,
  TimeoutError
} from "./errors"

// Arrow utilities
export {
  collectToTable,
  getColumnNames,
  getRowCount,
  parseFlightData,
  parseFlightDataStream,
  parseSchema,
  tableToObjects,
  tryParseSchema
} from "./arrow"

// Protobuf utilities (for advanced users)
export {
  encodeCommandGetCatalogs,
  encodeCommandGetDbSchemas,
  encodeCommandGetPrimaryKeys,
  encodeCommandGetTables,
  encodeCommandGetTableTypes,
  encodeCommandStatementQuery,
  encodeCommandStatementUpdate,
  TypeUrls
} from "./proto"

// Connection pool
export { FlightSqlPool } from "./pool"

// Retry utilities
export type { RetryResult } from "./retry"
export {
  calculateBackoffDelay,
  defaultIsRetryable,
  isRetryableGrpcError,
  retryPolicies,
  RetryPolicy,
  withRetry
} from "./retry"

// Type exports
export type {
  Action,
  ActionResult,
  ActionType,
  AuthConfig,
  CatalogInfo,
  // Flight SQL types
  ExecuteOptions,
  FlightData,
  FlightDescriptor,
  FlightEndpoint,
  FlightInfo,
  // Client configuration
  FlightSqlClientOptions,
  ForeignKeyInfo,
  // Core Flight types
  HandshakeResult,
  Location,
  // Pool types
  PoolOptions,
  PoolStats,
  PreparedStatementOptions,
  PreparedStatementResult,
  PrimaryKeyInfo,
  PutResult,
  // Streaming types
  RecordBatchStream,
  // Retry types
  RetryOptions,
  SchemaInfo,
  SchemaResult,
  TableInfo,
  TableType,
  Ticket,
  UpdateResult
} from "./types"

// Re-export DescriptorType (needed for runtime)
export { DescriptorType } from "./types"

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
 * const result = await client.execute("SELECT * FROM users")
 * // Process result...
 *
 * await client.close()
 * ```
 *
 * @packageDocumentation
 */

// Main client export
export { FlightSqlClient } from "./client"

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
  QueryResult,
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

// Re-export DescriptorType enum (needed for runtime)
export { DescriptorType } from "./types"

/**
 * @qualithm/arrow-flight-sql-js
 *
 * Arrow Flight SQL client for JavaScript and TypeScript runtimes.
 *
 * @example
 * ```typescript
 * import { FlightSqlClient } from "@qualithm/arrow-flight-sql-js"
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
export type { ExchangeStream } from "./client"
export { FlightSqlClient, PreparedStatement, QueryResult, Subscription } from "./client"

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
  encodeCommandGetExportedKeys,
  encodeCommandGetImportedKeys,
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

// Metrics and observability
export type {
  CounterEvent,
  GaugeEvent,
  MetricEvent,
  MetricsHandler,
  OperationStatus,
  OperationType
} from "./metrics"
export {
  ConsoleMetricsHandler,
  InMemoryMetricsHandler,
  MetricNames,
  MetricsTimer,
  NoopMetricsHandler,
  startTimer,
  withMetrics
} from "./metrics"

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
  // Subscription types
  SubscribeOptions,
  SubscriptionHandle,
  SubscriptionMetadata,
  TableInfo,
  TableType,
  Ticket,
  UpdateResult
} from "./types"

// Re-export DescriptorType and subscription constants (needed for runtime)
export { DescriptorType, SubscriptionMessageType, SubscriptionMode } from "./types"

// Query builder
export type {
  BuiltQuery,
  ColumnSpec,
  ComparisonOperator,
  JoinSpec,
  JoinType,
  LogicalOperator,
  OrderSpec,
  RawExpression,
  SortDirection,
  SqlValue,
  WhereCondition
} from "./query-builder"
export {
  deleteFrom,
  escapeIdentifier,
  escapeString,
  formatValue,
  insertInto,
  QueryBuilder,
  raw,
  select,
  update
} from "./query-builder"

// Runtime detection
export type { RuntimeInfo, RuntimeType } from "./runtime"
export {
  assertRuntime,
  clearRuntimeCache,
  detectRuntime,
  requiresGrpcWeb,
  Runtime,
  supportsGrpcJs
} from "./runtime"

// Transport abstraction
export type {
  DuplexStream,
  FlightTransport,
  RawAction,
  RawActionResult,
  RawActionType,
  RawFlightData,
  RawFlightInfo,
  RawHandshakeMessage,
  RawPutResult,
  RawTicket,
  ReadableStream,
  TransportError,
  TransportFactory,
  TransportMetadata,
  TransportOptions,
  WritableStream
} from "./transport"
export { getRegisteredRuntimes, getTransportFactory, registerTransport } from "./transport"

// gRPC-JS transport (Node.js/Bun)
export { createGrpcJsTransport, getTransportForRuntime, GrpcJsTransport } from "./transport-grpc-js"

// gRPC-Web transport (Browser/Workers)
export { createGrpcWebTransport, getWebTransport, GrpcWebTransport } from "./transport-grpc-web"

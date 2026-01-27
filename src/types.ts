/**
 * Arrow Flight SQL TypeScript type definitions
 *
 * These types map to the Protocol Buffer messages defined in:
 * - Flight.proto (arrow.flight.protocol)
 * - FlightSql.proto (arrow.flight.protocol.sql)
 */

import type { ChannelCredentials } from "@grpc/grpc-js"
import type { RecordBatch, Schema, Table } from "apache-arrow"

// ============================================================================
// Client Configuration Types
// ============================================================================

/**
 * Configuration options for creating a FlightSqlClient
 */
export interface FlightSqlClientOptions {
  /** Host address of the Flight SQL server */
  host: string

  /** Port number (default: 443 for TLS, 80 for insecure) */
  port: number

  /** Use TLS for connection (default: true) */
  tls?: boolean

  /** Custom channel credentials (overrides tls option) */
  credentials?: ChannelCredentials

  /** Authentication configuration */
  auth?: AuthConfig

  /** Connection timeout in milliseconds (default: 30000) */
  connectTimeoutMs?: number

  /** Request timeout in milliseconds (default: 60000) */
  requestTimeoutMs?: number

  /** Custom metadata to include with every request */
  metadata?: Record<string, string>
}

/**
 * Authentication configuration
 */
export type AuthConfig =
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "none" }

// ============================================================================
// Core Flight Protocol Types (from Flight.proto)
// ============================================================================

/**
 * Result of a handshake operation
 */
export interface HandshakeResult {
  /** Protocol version negotiated with server */
  protocolVersion: bigint

  /** Authentication token or other payload from server */
  payload: Uint8Array
}

/**
 * Describes what type of FlightDescriptor is defined
 */
export const DescriptorType = {
  UNKNOWN: 0,
  /** A named path identifying a dataset */
  PATH: 1,
  /** An opaque command to generate a dataset */
  CMD: 2
} as const

export type DescriptorType = (typeof DescriptorType)[keyof typeof DescriptorType]

/**
 * The name or tag for a Flight. Used to retrieve or generate a flight.
 */
export interface FlightDescriptor {
  type: DescriptorType

  /** Opaque command value (when type = CMD) */
  cmd?: Uint8Array

  /** List of strings identifying a dataset (when type = PATH) */
  path?: string[]
}

/**
 * An opaque identifier for retrieving a portion of a stream
 */
export interface Ticket {
  ticket: Uint8Array
}

/**
 * A location where a Flight service accepts retrieval requests
 */
export interface Location {
  uri: string
}

/**
 * A particular stream or split associated with a flight
 */
export interface FlightEndpoint {
  /** Token used to retrieve this stream */
  ticket: Ticket

  /** URIs where this ticket can be redeemed */
  locations: Location[]

  /** Expiration time for this endpoint */
  expirationTime?: Date

  /** Application-defined metadata */
  appMetadata?: Uint8Array
}

/**
 * Access coordinates for retrieval of a dataset
 */
export interface FlightInfo {
  /** Arrow schema in IPC format */
  schema: Uint8Array

  /** The descriptor associated with this info */
  flightDescriptor?: FlightDescriptor

  /** Endpoints to consume the flight data */
  endpoints: FlightEndpoint[]

  /** Total number of records (-1 if unknown) */
  totalRecords: bigint

  /** Total size in bytes (-1 if unknown) */
  totalBytes: bigint

  /** Whether endpoints are ordered */
  ordered: boolean

  /** Application-defined metadata */
  appMetadata?: Uint8Array
}

/**
 * Schema result from GetSchema call
 */
export interface SchemaResult {
  /** Arrow schema in IPC format */
  schema: Uint8Array
}

/**
 * A batch of Arrow data as part of a stream
 */
export interface FlightData {
  /** Descriptor of the data (for DoPut streams) */
  flightDescriptor?: FlightDescriptor

  /** Message header as described in Message.fbs */
  dataHeader: Uint8Array

  /** Application-defined metadata */
  appMetadata?: Uint8Array

  /** The actual Arrow data batch */
  dataBody: Uint8Array
}

/**
 * Response from DoPut submission
 */
export interface PutResult {
  appMetadata?: Uint8Array
}

/**
 * An action to execute on the Flight service
 */
export interface Action {
  type: string
  body?: Uint8Array
}

/**
 * Result from executing an action
 */
export interface ActionResult {
  body: Uint8Array
}

/**
 * Describes an available action type
 */
export interface ActionType {
  type: string
  description: string
}

// ============================================================================
// Flight SQL Specific Types (from FlightSql.proto)
// ============================================================================

/**
 * Options for executing SQL statements
 */
export interface ExecuteOptions {
  /** Query timeout in seconds */
  timeoutSeconds?: number

  /** Transaction ID for transactional queries */
  transactionId?: Uint8Array
}

/**
 * Options for prepared statements
 */
export interface PreparedStatementOptions {
  /** Transaction ID for transactional operations */
  transactionId?: Uint8Array
}

/**
 * Result from creating a prepared statement
 */
export interface PreparedStatementResult {
  /** Opaque handle for the prepared statement */
  handle: Uint8Array

  /** Schema of the result set (if query returns data) */
  datasetSchema?: Schema

  /** Schema of the parameters */
  parameterSchema?: Schema
}

/**
 * Update result from DML statements
 */
export interface UpdateResult {
  /** Number of rows affected */
  recordCount: bigint
}

/**
 * Catalog information
 */
export interface CatalogInfo {
  catalogName: string
}

/**
 * Schema information within a catalog
 */
export interface SchemaInfo {
  catalogName?: string
  schemaName: string
}

/**
 * Table information
 */
export interface TableInfo {
  catalogName?: string
  schemaName?: string
  tableName: string
  tableType: string
  schema?: Schema
}

/**
 * Table type names (e.g., "TABLE", "VIEW", "SYSTEM TABLE")
 */
export interface TableType {
  tableType: string
}

/**
 * Primary key information
 */
export interface PrimaryKeyInfo {
  catalogName?: string
  schemaName?: string
  tableName: string
  columnName: string
  keySequence: number
  keyName?: string
}

/**
 * Foreign key information
 */
export interface ForeignKeyInfo {
  pkCatalogName?: string
  pkSchemaName?: string
  pkTableName: string
  pkColumnName: string
  fkCatalogName?: string
  fkSchemaName?: string
  fkTableName: string
  fkColumnName: string
  keySequence: number
  fkKeyName?: string
  pkKeyName?: string
  updateRule: number
  deleteRule: number
}

// ============================================================================
// Streaming Types
// ============================================================================

/**
 * Async iterator for streaming Arrow record batches
 */
export type RecordBatchStream = AsyncIterable<RecordBatch>

/**
 * Result from a query execution
 */
export interface QueryResult {
  /** Flight info containing endpoints for data retrieval */
  flightInfo: FlightInfo

  /** Parsed Arrow schema */
  schema: Schema

  /**
   * Stream all record batches from all endpoints
   */
  stream(): RecordBatchStream

  /**
   * Collect all data into a single Table
   * Warning: Loads entire result set into memory
   */
  collect(): Promise<Table>
}

// ============================================================================
// Connection Pool Types
// ============================================================================

/**
 * Connection pool configuration
 */
export interface PoolOptions {
  /** Minimum number of connections to maintain */
  minConnections?: number

  /** Maximum number of connections allowed */
  maxConnections?: number

  /** Time in ms before an idle connection is closed */
  idleTimeoutMs?: number

  /** Time in ms to wait for a connection from the pool */
  acquireTimeoutMs?: number

  /** Enable connection health checking */
  healthCheck?: boolean

  /** Interval in ms between health checks */
  healthCheckIntervalMs?: number
}

/**
 * Pool statistics for monitoring
 */
export interface PoolStats {
  /** Total connections in pool */
  totalConnections: number

  /** Connections currently in use */
  activeConnections: number

  /** Connections available for use */
  idleConnections: number

  /** Requests waiting for a connection */
  pendingRequests: number
}

// ============================================================================
// Retry Types
// ============================================================================

/**
 * Retry configuration for transient failures
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number

  /** Initial delay in ms before first retry */
  initialDelayMs?: number

  /** Maximum delay in ms between retries */
  maxDelayMs?: number

  /** Multiplier for exponential backoff */
  backoffMultiplier?: number

  /** Add random jitter to delays */
  jitter?: boolean

  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean
}

/**
 * Custom error types for Arrow Flight SQL client
 *
 * Error hierarchy:
 * - FlightSqlError (base class)
 *   - ConnectionError (network/transport issues)
 *   - AuthenticationError (auth failures)
 *   - QueryError (SQL execution errors)
 *   - TimeoutError (operation timeouts)
 *   - ProtocolError (protocol violations)
 */

/**
 * Base error class for all Flight SQL errors.
 */
export class FlightSqlError extends Error {
  /** gRPC status code if available */
  readonly grpcCode?: number

  /** SQL state if available (for QueryError) */
  readonly sqlState?: string

  constructor(message: string, options?: ErrorOptions & { grpcCode?: number; sqlState?: string }) {
    super(message, options)
    this.name = "FlightSqlError"
    this.grpcCode = options?.grpcCode
    this.sqlState = options?.sqlState

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Error thrown when connection to the Flight SQL server fails.
 *
 * This includes:
 * - Network unreachable
 * - Connection refused
 * - TLS handshake failures
 * - Channel not ready
 */
export class ConnectionError extends FlightSqlError {
  constructor(message: string, options?: ErrorOptions & { grpcCode?: number }) {
    super(message, options)
    this.name = "ConnectionError"
  }
}

/**
 * Error thrown when authentication fails.
 *
 * This includes:
 * - Invalid credentials
 * - Expired tokens
 * - Missing authentication
 * - Insufficient permissions
 */
export class AuthenticationError extends FlightSqlError {
  constructor(message: string, options?: ErrorOptions & { grpcCode?: number }) {
    super(message, options)
    this.name = "AuthenticationError"
  }
}

/**
 * Error thrown when SQL query execution fails.
 *
 * This includes:
 * - Syntax errors
 * - Table/column not found
 * - Constraint violations
 * - Query planning failures
 */
export class QueryError extends FlightSqlError {
  constructor(message: string, options?: ErrorOptions & { grpcCode?: number; sqlState?: string }) {
    super(message, options)
    this.name = "QueryError"
  }
}

/**
 * Error thrown when an operation times out.
 *
 * This includes:
 * - Connection timeout
 * - Query timeout
 * - Pool acquisition timeout
 */
export class TimeoutError extends FlightSqlError {
  /** Timeout duration in milliseconds */
  readonly timeoutMs?: number

  constructor(message: string, options?: ErrorOptions & { grpcCode?: number; timeoutMs?: number }) {
    super(message, options)
    this.name = "TimeoutError"
    this.timeoutMs = options?.timeoutMs
  }
}

/**
 * Error thrown when protocol violations occur.
 *
 * This includes:
 * - Invalid protobuf messages
 * - Unexpected response types
 * - Schema mismatches
 * - IPC format errors
 */
export class ProtocolError extends FlightSqlError {
  constructor(message: string, options?: ErrorOptions & { grpcCode?: number }) {
    super(message, options)
    this.name = "ProtocolError"
  }
}

/**
 * Error thrown when a resource is not found.
 *
 * This includes:
 * - Table not found
 * - Prepared statement not found
 * - Transaction not found
 */
export class NotFoundError extends FlightSqlError {
  constructor(message: string, options?: ErrorOptions & { grpcCode?: number }) {
    super(message, options)
    this.name = "NotFoundError"
  }
}

/**
 * Error thrown when an operation is cancelled.
 *
 * This includes:
 * - Query cancellation
 * - Stream cancellation
 * - User-initiated abort
 */
export class CancelledError extends FlightSqlError {
  constructor(message: string, options?: ErrorOptions & { grpcCode?: number }) {
    super(message, options)
    this.name = "CancelledError"
  }
}

/**
 * Map gRPC status codes to appropriate error types.
 */
export function fromGrpcStatus(code: number, message: string, cause?: Error): FlightSqlError {
  // gRPC status codes from @grpc/grpc-js
  const grpcStatus = {
    ok: 0,
    cancelled: 1,
    unknown: 2,
    invalidArgument: 3,
    deadlineExceeded: 4,
    notFound: 5,
    alreadyExists: 6,
    permissionDenied: 7,
    resourceExhausted: 8,
    failedPrecondition: 9,
    aborted: 10,
    outOfRange: 11,
    unimplemented: 12,
    internal: 13,
    unavailable: 14,
    dataLoss: 15,
    unauthenticated: 16
  } as const

  const options = { cause, grpcCode: code }

  switch (code) {
    case grpcStatus.cancelled:
      return new CancelledError(message, options)

    case grpcStatus.deadlineExceeded:
      return new TimeoutError(message, options)

    case grpcStatus.notFound:
      return new NotFoundError(message, options)

    case grpcStatus.unauthenticated:
    case grpcStatus.permissionDenied:
      return new AuthenticationError(message, options)

    case grpcStatus.unavailable:
      return new ConnectionError(message, options)

    case grpcStatus.invalidArgument:
    case grpcStatus.failedPrecondition:
      return new QueryError(message, options)

    case grpcStatus.internal:
    case grpcStatus.dataLoss:
      return new ProtocolError(message, options)

    default:
      return new FlightSqlError(message, options)
  }
}

/**
 * Flight SQL error types and utilities.
 *
 * @packageDocumentation
 */
import { FlightError, type FlightErrorCode } from "@qualithm/arrow-flight"

/**
 * Flight SQL specific error codes.
 */
export type FlightSqlErrorCode =
  | "INVALID_QUERY"
  | "INVALID_HANDLE"
  | "INVALID_PARAMETER"
  | "TRANSACTION_ERROR"
  | "RESULT_ERROR"
  | "SCHEMA_ERROR"

/**
 * Options for creating a FlightSqlError.
 */
export type FlightSqlErrorOptions = {
  /** The underlying Flight error code */
  flightCode?: FlightErrorCode
  /** Additional error details */
  details?: string
  /** The original error that caused this error */
  cause?: Error
}

/**
 * Error class for Flight SQL specific errors.
 *
 * Extends FlightError to provide SQL-specific error information while
 * maintaining compatibility with the base error handling.
 *
 * @example
 * ```ts
 * try {
 *   await client.query("")
 * } catch (error) {
 *   if (FlightSqlError.isFlightSqlError(error)) {
 *     console.log("SQL error code:", error.sqlCode)
 *     console.log("Flight code:", error.code)
 *   }
 * }
 * ```
 */
export class FlightSqlError extends FlightError {
  /**
   * The SQL-specific error code.
   */
  readonly sqlCode: FlightSqlErrorCode

  constructor(message: string, sqlCode: FlightSqlErrorCode, options?: FlightSqlErrorOptions) {
    super(message, options?.flightCode ?? "INVALID_ARGUMENT", {
      details: options?.details,
      cause: options?.cause
    })
    this.sqlCode = sqlCode
    this.name = "FlightSqlError"
  }

  /**
   * Checks if an error is a FlightSqlError.
   */
  static isFlightSqlError(error: unknown): error is FlightSqlError {
    return error instanceof FlightSqlError
  }

  /**
   * Checks if an error indicates an invalid query.
   */
  static isInvalidQuery(error: unknown): boolean {
    return FlightSqlError.isFlightSqlError(error) && error.sqlCode === "INVALID_QUERY"
  }

  /**
   * Checks if an error indicates an invalid handle (prepared statement, transaction).
   */
  static isInvalidHandle(error: unknown): boolean {
    return FlightSqlError.isFlightSqlError(error) && error.sqlCode === "INVALID_HANDLE"
  }

  /**
   * Checks if an error indicates an invalid parameter.
   */
  static isInvalidParameter(error: unknown): boolean {
    return FlightSqlError.isFlightSqlError(error) && error.sqlCode === "INVALID_PARAMETER"
  }

  /**
   * Checks if an error indicates a transaction error.
   */
  static isTransactionError(error: unknown): boolean {
    return FlightSqlError.isFlightSqlError(error) && error.sqlCode === "TRANSACTION_ERROR"
  }

  /**
   * Checks if an error indicates a result error.
   */
  static isResultError(error: unknown): boolean {
    return FlightSqlError.isFlightSqlError(error) && error.sqlCode === "RESULT_ERROR"
  }
}

/**
 * Validates that a query string is not empty.
 *
 * @param query - The query string to validate
 * @throws {FlightSqlError} If the query is empty or whitespace-only
 */
export function validateQuery(query: string): void {
  if (!query || query.trim().length === 0) {
    throw new FlightSqlError("query cannot be empty", "INVALID_QUERY")
  }
}

/**
 * Validates that a prepared statement handle is valid.
 *
 * @param handle - The handle buffer to validate
 * @param name - The parameter name for error messages
 * @throws {FlightSqlError} If the handle is invalid
 */
export function validateHandle(handle: Buffer, name = "handle"): void {
  if (handle.length === 0) {
    throw new FlightSqlError(`${name} cannot be empty`, "INVALID_HANDLE")
  }
}

/**
 * Validates that a transaction ID is valid.
 *
 * @param transactionId - The transaction ID buffer to validate
 * @throws {FlightSqlError} If the transaction ID is invalid
 */
export function validateTransactionId(transactionId: Buffer): void {
  if (transactionId.length === 0) {
    throw new FlightSqlError("transaction ID cannot be empty", "TRANSACTION_ERROR", {
      flightCode: "FAILED_PRECONDITION"
    })
  }
}

/**
 * Validates that parameter data contains required schema.
 *
 * @param params - The parameter data to validate
 * @throws {FlightSqlError} If the parameter data is invalid
 */
export function validateParameterData(params: { schema: Uint8Array; data: Uint8Array }): void {
  if (params.schema.length === 0) {
    throw new FlightSqlError("parameter schema is required", "INVALID_PARAMETER")
  }
  if (params.data.length === 0) {
    throw new FlightSqlError("parameter data is required", "INVALID_PARAMETER")
  }
}

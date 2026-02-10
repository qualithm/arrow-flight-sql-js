/**
 * Retry logic with exponential backoff for transient failures.
 *
 * Implements configurable retry strategies with:
 * - Exponential backoff between attempts
 * - Optional jitter to prevent thundering herd
 * - Customizable retry conditions
 * - gRPC status code awareness
 */

import * as grpc from "@grpc/grpc-js"

import type { RetryOptions } from "./types"

// Default retry configuration
const defaultRetryOptions: Required<Omit<RetryOptions, "isRetryable">> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 10_000,
  backoffMultiplier: 2,
  jitter: true
}

/**
 * gRPC status codes that indicate transient failures worth retrying
 */
const retryableGrpcCodes = new Set([
  grpc.status.UNAVAILABLE, // Server temporarily unavailable
  grpc.status.RESOURCE_EXHAUSTED, // Rate limited or quota exceeded
  grpc.status.ABORTED, // Transaction aborted, can retry
  grpc.status.DEADLINE_EXCEEDED, // Timeout, might succeed on retry
  grpc.status.INTERNAL // Internal error, might be transient
])

/**
 * Check if a gRPC error is retryable based on its status code
 */
export function isRetryableGrpcError(error: unknown): boolean {
  if (error instanceof Error && "code" in error) {
    const { code } = error as { code: number }
    return retryableGrpcCodes.has(code)
  }
  return false
}

/**
 * Default function to determine if an error is retryable.
 * Handles gRPC errors and common network errors.
 */
export function defaultIsRetryable(error: unknown): boolean {
  // Check gRPC status codes
  if (isRetryableGrpcError(error)) {
    return true
  }

  // Check for common network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("socket hang up") ||
      message.includes("network error") ||
      message.includes("connection reset")
    )
  }

  return false
}

/**
 * Calculate delay for a retry attempt with optional jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, "isRetryable">>
): number {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt)

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs)

  // Add jitter (±25% of the delay) to prevent thundering herd
  if (options.jitter) {
    const jitterRange = cappedDelay * 0.25
    const jitter = Math.random() * jitterRange * 2 - jitterRange
    return Math.max(0, Math.round(cappedDelay + jitter))
  }

  return Math.round(cappedDelay)
}

/**
 * Sleep for a specified duration
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Result of a retry operation
 */
export type RetryResult<T> = {
  /** The successful result value */
  value: T
  /** Number of attempts made (1 = succeeded on first try) */
  attempts: number
  /** Total time spent including delays (ms) */
  totalTimeMs: number
}

/**
 * Execute a function with automatic retries on transient failures.
 *
 * @param operation - The async function to execute
 * @param options - Retry configuration
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await client.query("SELECT 1"),
 *   { maxRetries: 3, initialDelayMs: 100 }
 * )
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const config = {
    ...defaultRetryOptions,
    ...options
  }
  const isRetryable = options.isRetryable ?? defaultIsRetryable

  const startTime = Date.now()
  let lastError: Error | undefined
  let attempt = 0

  while (attempt <= config.maxRetries) {
    try {
      const value = await operation()
      return {
        value,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if we should retry
      if (attempt >= config.maxRetries || !isRetryable(error)) {
        break
      }

      // Calculate and wait for backoff delay
      const delay = calculateBackoffDelay(attempt, config)
      await sleep(delay)
      attempt++
    }
  }

  // All retries exhausted or non-retryable error
  // lastError is guaranteed to be set if we reach here (we only break after catching)
  throw lastError ?? new Error("Retry failed with unknown error")
}

/**
 * A retry policy that can be reused across multiple operations.
 * Useful for applying consistent retry behavior.
 */
export class RetryPolicy {
  private readonly config: Required<Omit<RetryOptions, "isRetryable">>
  private readonly isRetryable: (error: unknown) => boolean

  constructor(options: RetryOptions = {}) {
    this.config = {
      ...defaultRetryOptions,
      ...options
    }
    this.isRetryable = options.isRetryable ?? defaultIsRetryable
  }

  /**
   * Execute an operation with this policy's retry configuration
   */
  async execute<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    return withRetry(operation, {
      ...this.config,
      isRetryable: this.isRetryable
    })
  }

  /**
   * Create a wrapped version of an async function that automatically retries
   */
  wrap<T, TArgs extends unknown[]>(
    fn: (...args: TArgs) => Promise<T>
  ): (...args: TArgs) => Promise<T> {
    return async (...args: TArgs): Promise<T> => {
      const result = await this.execute(async () => fn(...args))
      return result.value
    }
  }

  /**
   * Check if an error would be retried by this policy
   */
  wouldRetry(error: unknown): boolean {
    return this.isRetryable(error)
  }

  /**
   * Get the delay that would be used for a specific attempt
   */
  getDelayForAttempt(attempt: number): number {
    return calculateBackoffDelay(attempt, this.config)
  }
}

/**
 * Pre-configured retry policies for common use cases
 */
export const retryPolicies = {
  /** No retries - fail immediately */
  none: new RetryPolicy({ maxRetries: 0 }),

  /** Fast retries for low-latency operations */
  fast: new RetryPolicy({
    maxRetries: 3,
    initialDelayMs: 50,
    maxDelayMs: 500,
    backoffMultiplier: 2
  }),

  /** Default retry policy with moderate settings */
  default: new RetryPolicy({
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 10_000,
    backoffMultiplier: 2
  }),

  /** Aggressive retries for critical operations */
  aggressive: new RetryPolicy({
    maxRetries: 5,
    initialDelayMs: 200,
    maxDelayMs: 30_000,
    backoffMultiplier: 2
  }),

  /** Very long retries for reconnection scenarios */
  reconnection: new RetryPolicy({
    maxRetries: 10,
    initialDelayMs: 1_000,
    maxDelayMs: 60_000,
    backoffMultiplier: 2
  })
} as const

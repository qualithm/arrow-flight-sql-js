/**
 * Retry logic benchmarks
 */

import {
  calculateBackoffDelay,
  defaultIsRetryable,
  isRetryableGrpcError,
  retryPolicies,
  RetryPolicy
} from "../src/retry"
import type { Benchmark } from "./runner"

// Create test errors
const retryableError = Object.assign(new Error("Unavailable"), { code: 14 })
const nonRetryableError = Object.assign(new Error("Not found"), { code: 5 })
const genericError = new Error("Something went wrong")

export const retryBenchmarks: Benchmark[] = [
  // Error classification
  {
    name: "isRetryableGrpcError (retryable)",
    fn: (): void => {
      isRetryableGrpcError(retryableError)
    },
    iterations: 500_000
  },
  {
    name: "isRetryableGrpcError (non-retryable)",
    fn: (): void => {
      isRetryableGrpcError(nonRetryableError)
    },
    iterations: 500_000
  },
  {
    name: "isRetryableGrpcError (generic)",
    fn: (): void => {
      isRetryableGrpcError(genericError)
    },
    iterations: 500_000
  },
  {
    name: "defaultIsRetryable (retryable)",
    fn: (): void => {
      defaultIsRetryable(retryableError)
    },
    iterations: 500_000
  },
  {
    name: "defaultIsRetryable (non-retryable)",
    fn: (): void => {
      defaultIsRetryable(nonRetryableError)
    },
    iterations: 500_000
  },

  // Backoff calculation
  {
    name: "calculateBackoffDelay (attempt 1)",
    fn: (): void => {
      calculateBackoffDelay(1, {
        maxRetries: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitter: true
      })
    },
    iterations: 500_000
  },
  {
    name: "calculateBackoffDelay (attempt 5)",
    fn: (): void => {
      calculateBackoffDelay(5, {
        maxRetries: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitter: true
      })
    },
    iterations: 500_000
  },
  {
    name: "calculateBackoffDelay (attempt 10)",
    fn: (): void => {
      calculateBackoffDelay(10, {
        maxRetries: 5,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitter: true
      })
    },
    iterations: 500_000
  },

  // RetryPolicy creation
  {
    name: "RetryPolicy.create (default)",
    fn: (): void => {
      new RetryPolicy({})
    },
    iterations: 100_000
  },
  {
    name: "RetryPolicy.create (custom)",
    fn: (): void => {
      new RetryPolicy({
        maxRetries: 5,
        initialDelayMs: 200,
        maxDelayMs: 30000,
        jitter: true
      })
    },
    iterations: 100_000
  },
  {
    name: "retryPolicies.default access",
    fn: (): void => {
      void retryPolicies.default
    },
    iterations: 500_000
  },
  {
    name: "retryPolicies.aggressive access",
    fn: (): void => {
      void retryPolicies.aggressive
    },
    iterations: 500_000
  },

  // RetryPolicy methods
  {
    name: "RetryPolicy.wouldRetry (yes)",
    fn: (): void => {
      retryPolicies.default.wouldRetry(retryableError)
    },
    iterations: 200_000
  },
  {
    name: "RetryPolicy.wouldRetry (no)",
    fn: (): void => {
      retryPolicies.default.wouldRetry(nonRetryableError)
    },
    iterations: 200_000
  },
  {
    name: "RetryPolicy.getDelayForAttempt (1)",
    fn: (): void => {
      retryPolicies.default.getDelayForAttempt(1)
    },
    iterations: 500_000
  },
  {
    name: "RetryPolicy.getDelayForAttempt (5)",
    fn: (): void => {
      retryPolicies.default.getDelayForAttempt(5)
    },
    iterations: 500_000
  }
]

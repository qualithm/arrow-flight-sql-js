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
    fn: () => {
      isRetryableGrpcError(retryableError)
    },
    iterations: 500_000
  },
  {
    name: "isRetryableGrpcError (non-retryable)",
    fn: () => {
      isRetryableGrpcError(nonRetryableError)
    },
    iterations: 500_000
  },
  {
    name: "isRetryableGrpcError (generic)",
    fn: () => {
      isRetryableGrpcError(genericError)
    },
    iterations: 500_000
  },
  {
    name: "defaultIsRetryable (retryable)",
    fn: () => {
      defaultIsRetryable(retryableError)
    },
    iterations: 500_000
  },
  {
    name: "defaultIsRetryable (non-retryable)",
    fn: () => {
      defaultIsRetryable(nonRetryableError)
    },
    iterations: 500_000
  },

  // Backoff calculation
  {
    name: "calculateBackoffDelay (attempt 1)",
    fn: () => {
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
    fn: () => {
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
    fn: () => {
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
    fn: () => {
      new RetryPolicy({})
    },
    iterations: 100_000
  },
  {
    name: "RetryPolicy.create (custom)",
    fn: () => {
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
    fn: () => {
      void retryPolicies.default
    },
    iterations: 500_000
  },
  {
    name: "retryPolicies.aggressive access",
    fn: () => {
      void retryPolicies.aggressive
    },
    iterations: 500_000
  },

  // RetryPolicy methods
  {
    name: "RetryPolicy.wouldRetry (yes)",
    fn: () => {
      retryPolicies.default.wouldRetry(retryableError)
    },
    iterations: 200_000
  },
  {
    name: "RetryPolicy.wouldRetry (no)",
    fn: () => {
      retryPolicies.default.wouldRetry(nonRetryableError)
    },
    iterations: 200_000
  },
  {
    name: "RetryPolicy.getDelayForAttempt (1)",
    fn: () => {
      retryPolicies.default.getDelayForAttempt(1)
    },
    iterations: 500_000
  },
  {
    name: "RetryPolicy.getDelayForAttempt (5)",
    fn: () => {
      retryPolicies.default.getDelayForAttempt(5)
    },
    iterations: 500_000
  }
]

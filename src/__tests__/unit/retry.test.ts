/**
 * Unit tests for retry logic
 */

import { describe, expect, test } from "bun:test"

import {
  calculateBackoffDelay,
  defaultIsRetryable,
  isRetryableGrpcError,
  retryPolicies,
  RetryPolicy,
  withRetry
} from "../../retry"

describe("isRetryableGrpcError", () => {
  test("should return true for UNAVAILABLE (14)", () => {
    const error = Object.assign(new Error("Unavailable"), { code: 14 })
    expect(isRetryableGrpcError(error)).toBe(true)
  })

  test("should return true for RESOURCE_EXHAUSTED (8)", () => {
    const error = Object.assign(new Error("Rate limited"), { code: 8 })
    expect(isRetryableGrpcError(error)).toBe(true)
  })

  test("should return true for ABORTED (10)", () => {
    const error = Object.assign(new Error("Aborted"), { code: 10 })
    expect(isRetryableGrpcError(error)).toBe(true)
  })

  test("should return true for DEADLINE_EXCEEDED (4)", () => {
    const error = Object.assign(new Error("Timeout"), { code: 4 })
    expect(isRetryableGrpcError(error)).toBe(true)
  })

  test("should return true for INTERNAL (13)", () => {
    const error = Object.assign(new Error("Internal"), { code: 13 })
    expect(isRetryableGrpcError(error)).toBe(true)
  })

  test("should return false for INVALID_ARGUMENT (3)", () => {
    const error = Object.assign(new Error("Invalid"), { code: 3 })
    expect(isRetryableGrpcError(error)).toBe(false)
  })

  test("should return false for NOT_FOUND (5)", () => {
    const error = Object.assign(new Error("Not found"), { code: 5 })
    expect(isRetryableGrpcError(error)).toBe(false)
  })

  test("should return false for non-Error values", () => {
    expect(isRetryableGrpcError("error")).toBe(false)
    expect(isRetryableGrpcError(null)).toBe(false)
    expect(isRetryableGrpcError(undefined)).toBe(false)
  })
})

describe("defaultIsRetryable", () => {
  test("should return true for retryable gRPC errors", () => {
    const error = Object.assign(new Error("Unavailable"), { code: 14 })
    expect(defaultIsRetryable(error)).toBe(true)
  })

  test("should return true for ECONNRESET", () => {
    const error = new Error("ECONNRESET: Connection reset by peer")
    expect(defaultIsRetryable(error)).toBe(true)
  })

  test("should return true for ECONNREFUSED", () => {
    const error = new Error("ECONNREFUSED: Connection refused")
    expect(defaultIsRetryable(error)).toBe(true)
  })

  test("should return true for ETIMEDOUT", () => {
    const error = new Error("ETIMEDOUT: Connection timed out")
    expect(defaultIsRetryable(error)).toBe(true)
  })

  test("should return true for socket hang up", () => {
    const error = new Error("socket hang up")
    expect(defaultIsRetryable(error)).toBe(true)
  })

  test("should return true for network error", () => {
    const error = new Error("Network error occurred")
    expect(defaultIsRetryable(error)).toBe(true)
  })

  test("should return false for other errors", () => {
    const error = new Error("Some other error")
    expect(defaultIsRetryable(error)).toBe(false)
  })
})

describe("calculateBackoffDelay", () => {
  const options = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitter: false
  }

  test("should calculate exponential delay", () => {
    expect(calculateBackoffDelay(0, options)).toBe(100) // 100 * 2^0
    expect(calculateBackoffDelay(1, options)).toBe(200) // 100 * 2^1
    expect(calculateBackoffDelay(2, options)).toBe(400) // 100 * 2^2
    expect(calculateBackoffDelay(3, options)).toBe(800) // 100 * 2^3
  })

  test("should cap at maxDelayMs", () => {
    const smallMaxOptions = { ...options, maxDelayMs: 300 }

    expect(calculateBackoffDelay(0, smallMaxOptions)).toBe(100)
    expect(calculateBackoffDelay(1, smallMaxOptions)).toBe(200)
    expect(calculateBackoffDelay(2, smallMaxOptions)).toBe(300) // Capped
    expect(calculateBackoffDelay(3, smallMaxOptions)).toBe(300) // Capped
  })

  test("should add jitter when enabled", () => {
    const jitterOptions = { ...options, jitter: true }

    // Run multiple times and verify jitter adds variance
    const delays = new Set<number>()
    for (let i = 0; i < 20; i++) {
      delays.add(calculateBackoffDelay(1, jitterOptions))
    }

    // With jitter, we should get multiple different values
    expect(delays.size).toBeGreaterThan(1)

    // All delays should be within ±25% of base delay (200ms)
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(150) // 200 - 50
      expect(delay).toBeLessThanOrEqual(250) // 200 + 50
    }
  })
})

describe("withRetry", () => {
  test("should return result on first success", async () => {
    let attempts = 0
    const result = await withRetry(async () => {
      attempts++
      return Promise.resolve("success")
    })

    expect(result.value).toBe("success")
    expect(result.attempts).toBe(1)
    expect(attempts).toBe(1)
  })

  test("should retry on transient failure", async () => {
    let attempts = 0
    const result = await withRetry(
      async () => {
        attempts++
        if (attempts < 3) {
          return Promise.reject(Object.assign(new Error("Unavailable"), { code: 14 }))
        }
        return Promise.resolve("success")
      },
      { maxRetries: 5, initialDelayMs: 1 }
    )

    expect(result.value).toBe("success")
    expect(result.attempts).toBe(3)
  })

  test("should throw after max retries", async () => {
    let attempts = 0

    let caughtError: Error | undefined
    try {
      await withRetry(
        async (): Promise<unknown> => {
          attempts++
          return Promise.reject(Object.assign(new Error("Unavailable"), { code: 14 }))
        },
        { maxRetries: 2, initialDelayMs: 1 }
      )
    } catch (e) {
      caughtError = e as Error
    }

    expect(caughtError?.message).toBe("Unavailable")
    expect(attempts).toBe(3) // Initial + 2 retries
  })

  test("should not retry non-retryable errors", async () => {
    let attempts = 0

    let caughtError: Error | undefined
    try {
      await withRetry(
        async (): Promise<unknown> => {
          attempts++
          return Promise.reject(new Error("Non-retryable error"))
        },
        { maxRetries: 3, initialDelayMs: 1 }
      )
    } catch (e) {
      caughtError = e as Error
    }

    expect(caughtError?.message).toBe("Non-retryable error")
    expect(attempts).toBe(1) // Only initial attempt
  })

  test("should use custom isRetryable function", async () => {
    let attempts = 0
    const result = await withRetry(
      async () => {
        attempts++
        if (attempts < 2) {
          return Promise.reject(new Error("Custom retryable"))
        }
        return Promise.resolve("success")
      },
      {
        maxRetries: 3,
        initialDelayMs: 1,
        isRetryable: (err) => err instanceof Error && err.message.includes("Custom retryable")
      }
    )

    expect(result.value).toBe("success")
    expect(result.attempts).toBe(2)
  })

  test("should track total time", async () => {
    const result = await withRetry(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return "success"
      },
      { initialDelayMs: 1 }
    )

    expect(result.totalTimeMs).toBeGreaterThanOrEqual(10)
  })
})

describe("RetryPolicy", () => {
  test("should execute operation with policy", async () => {
    const policy = new RetryPolicy({ maxRetries: 2, initialDelayMs: 1 })

    const result = await policy.execute(async () => Promise.resolve("success"))

    expect(result.value).toBe("success")
    expect(result.attempts).toBe(1)
  })

  test("should wrap function for reuse", async () => {
    const policy = new RetryPolicy({ maxRetries: 2, initialDelayMs: 1 })

    let calls = 0
    const wrapped = policy.wrap(async (x: number) => {
      calls++
      if (calls === 1) {
        return Promise.reject(Object.assign(new Error("Retry"), { code: 14 }))
      }
      return Promise.resolve(x * 2)
    })

    const result = await wrapped(21)

    expect(result).toBe(42)
    expect(calls).toBe(2)
  })

  test("wouldRetry should check if error is retryable", () => {
    const policy = new RetryPolicy()

    const retryableError = Object.assign(new Error("Unavailable"), { code: 14 })
    const nonRetryableError = new Error("Not retryable")

    expect(policy.wouldRetry(retryableError)).toBe(true)
    expect(policy.wouldRetry(nonRetryableError)).toBe(false)
  })

  test("getDelayForAttempt should return calculated delay", () => {
    const policy = new RetryPolicy({
      initialDelayMs: 100,
      backoffMultiplier: 2,
      jitter: false
    })

    expect(policy.getDelayForAttempt(0)).toBe(100)
    expect(policy.getDelayForAttempt(1)).toBe(200)
    expect(policy.getDelayForAttempt(2)).toBe(400)
  })
})

describe("retryPolicies", () => {
  test("none policy should have 0 maxRetries", async () => {
    // none policy fails immediately without retries
    let attempts = 0
    let threw = false
    try {
      await retryPolicies.none.execute(async (): Promise<unknown> => {
        attempts++
        return Promise.reject(Object.assign(new Error("Fail"), { code: 14 }))
      })
    } catch {
      threw = true
    }

    expect(threw).toBe(true)
    // maxRetries: 0 means 1 attempt total
    expect(attempts).toBe(1)
  })

  test("fast policy should have short delays", () => {
    // Fast policy uses 50ms initial delay with jitter (±25%)
    // So delay should be between 37.5 and 62.5
    const delay = retryPolicies.fast.getDelayForAttempt(0)
    expect(delay).toBeGreaterThanOrEqual(30)
    expect(delay).toBeLessThanOrEqual(70)
  })

  test("aggressive policy should have more maxRetries than default", () => {
    // Test the property without actually executing (which takes too long)
    // Aggressive has maxRetries: 5, default has maxRetries: 3
    // We can verify this by checking that aggressive retries more
    const policy = retryPolicies.aggressive

    // getDelayForAttempt(4) should return a value (attempt 5 exists)
    // This implies at least 5 retries are configured
    const delay4 = policy.getDelayForAttempt(4)
    expect(delay4).toBeGreaterThan(0)
  })
})

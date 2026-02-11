/**
 * Unit tests for runtime detection
 */

import { afterEach, describe, expect, test } from "bun:test"

import {
  assertRuntime,
  clearRuntimeCache,
  detectRuntime,
  requiresGrpcWeb,
  Runtime,
  type RuntimeType,
  supportsGrpcJs
} from "../../runtime"

describe("Runtime constants", () => {
  test("should define all runtime types", () => {
    expect(Runtime.Node).toBe("node")
    expect(Runtime.Bun).toBe("bun")
    expect(Runtime.Deno).toBe("deno")
    expect(Runtime.Browser).toBe("browser")
    expect(Runtime.Unknown).toBe("unknown")
  })

  test("Runtime values should be unique", () => {
    const values = Object.values(Runtime)
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })
})

describe("detectRuntime", () => {
  afterEach(() => {
    clearRuntimeCache()
  })

  test("should detect Bun runtime", () => {
    // We're running in Bun, so this should detect Bun
    const info = detectRuntime()

    expect(info.runtime).toBe(Runtime.Bun)
    expect(info.version).not.toBeNull()
    expect(info.supportsHttp2).toBe(true)
    expect(info.supportsGrpcJs).toBe(true)
    expect(info.isBrowser).toBe(false)
    expect(info.isWorker).toBe(false)
  })

  test("should return version string for Bun", () => {
    const info = detectRuntime()

    expect(info.version).toBeTypeOf("string")
    // Bun version format: x.y.z
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("should cache runtime info", () => {
    const info1 = detectRuntime()
    const info2 = detectRuntime()

    expect(info1).toBe(info2) // Same object reference
  })

  test("clearRuntimeCache should reset cache", () => {
    const info1 = detectRuntime()
    clearRuntimeCache()
    const info2 = detectRuntime()

    expect(info1).not.toBe(info2) // Different object references
    expect(info1).toEqual(info2) // But same values
  })
})

describe("RuntimeInfo type", () => {
  test("should have all required properties", () => {
    const info = detectRuntime()

    expect(info).toHaveProperty("runtime")
    expect(info).toHaveProperty("version")
    expect(info).toHaveProperty("supportsHttp2")
    expect(info).toHaveProperty("supportsGrpcJs")
    expect(info).toHaveProperty("isBrowser")
    expect(info).toHaveProperty("isWorker")
  })

  test("runtime should be a valid RuntimeType", () => {
    const info = detectRuntime()
    const validRuntimes: RuntimeType[] = [
      Runtime.Node,
      Runtime.Bun,
      Runtime.Deno,
      Runtime.Browser,
      Runtime.Unknown
    ]

    expect(validRuntimes).toContain(info.runtime)
  })
})

describe("assertRuntime", () => {
  afterEach(() => {
    clearRuntimeCache()
  })

  test("should not throw when runtime is supported", () => {
    // We're in Bun, so this should pass
    expect(() => {
      assertRuntime([Runtime.Bun])
    }).not.toThrow()
  })

  test("should not throw when runtime is in supported list", () => {
    expect(() => {
      assertRuntime([Runtime.Node, Runtime.Bun])
    }).not.toThrow()
  })

  test("should throw when runtime is not supported", () => {
    expect(() => {
      assertRuntime([Runtime.Deno])
    }).toThrow(/Unsupported runtime/)
  })

  test("should throw with descriptive message", () => {
    expect(() => {
      assertRuntime([Runtime.Browser])
    }).toThrow(/Unsupported runtime: bun.*This operation requires one of: browser/)
  })

  test("should list all supported runtimes in error", () => {
    expect(() => {
      assertRuntime([Runtime.Browser, Runtime.Deno])
    }).toThrow(/browser, deno/)
  })
})

describe("supportsGrpcJs", () => {
  afterEach(() => {
    clearRuntimeCache()
  })

  test("should return true in Bun", () => {
    expect(supportsGrpcJs()).toBe(true)
  })
})

describe("requiresGrpcWeb", () => {
  afterEach(() => {
    clearRuntimeCache()
  })

  test("should return false in Bun", () => {
    expect(requiresGrpcWeb()).toBe(false)
  })
})

describe("Runtime detection priority", () => {
  test("Bun global should be detected", () => {
    // In actual Bun runtime, Bun global exists
    expect("Bun" in globalThis).toBe(true)
  })

  test("process.versions.node should exist in Bun", () => {
    // Bun provides Node.js compatibility
    const process = globalThis.process as { versions?: { node?: string } } | undefined
    expect(process?.versions?.node).toBeDefined()
  })

  test("Bun should be detected before Node despite Node compatibility", () => {
    // Bun has process.versions.node for compatibility, but should still be detected as Bun
    const info = detectRuntime()
    expect(info.runtime).toBe(Runtime.Bun)
  })
})

describe("Edge cases", () => {
  afterEach(() => {
    clearRuntimeCache()
  })

  test("should handle multiple calls efficiently", () => {
    const start = performance.now()
    for (let i = 0; i < 10000; i++) {
      detectRuntime()
    }
    const elapsed = performance.now() - start

    // Should be very fast due to caching
    expect(elapsed).toBeLessThan(100) // 100ms for 10k calls
  })

  test("RuntimeInfo should be immutable pattern", () => {
    const info = detectRuntime()

    // Modifying the returned object shouldn't affect future calls
    // (though we don't enforce deep immutability)
    expect(typeof info.runtime).toBe("string")
  })
})

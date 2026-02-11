/**
 * Runtime Detection
 *
 * Provides utilities for detecting the current JavaScript runtime environment.
 * Supports Node.js, Bun, Deno, and browser environments.
 */

/**
 * Supported runtime environments
 */
export const Runtime = {
  Node: "node",
  Bun: "bun",
  Deno: "deno",
  Browser: "browser",
  Unknown: "unknown"
} as const

export type RuntimeType = (typeof Runtime)[keyof typeof Runtime]

/**
 * Runtime detection result with version information
 */
export type RuntimeInfo = {
  /** The detected runtime type */
  runtime: RuntimeType
  /** Runtime version string (e.g., "20.0.0" for Node, "1.0.0" for Bun) */
  version: string | null
  /** Whether the runtime supports native HTTP/2 */
  supportsHttp2: boolean
  /** Whether the runtime supports @grpc/grpc-js natively */
  supportsGrpcJs: boolean
  /** Whether running in a browser environment */
  isBrowser: boolean
  /** Whether running in a worker context (Web Worker, Service Worker, Cloudflare Worker) */
  isWorker: boolean
}

/**
 * Cached runtime info to avoid repeated detection
 */
let cachedRuntimeInfo: RuntimeInfo | null = null

/**
 * Detect the current runtime environment.
 *
 * Detection order (first match wins):
 * 1. Bun - checks for `Bun` global
 * 2. Deno - checks for `Deno` global
 * 3. Browser - checks for `window` and browser-specific APIs
 * 4. Node.js - checks for `process.versions.node`
 * 5. Unknown - fallback
 *
 * @returns RuntimeInfo with detected environment details
 *
 * @example
 * ```typescript
 * const info = detectRuntime()
 * if (info.runtime === Runtime.Bun) {
 *   console.log(`Running on Bun ${info.version}`)
 * }
 * ```
 */
export function detectRuntime(): RuntimeInfo {
  if (cachedRuntimeInfo) {
    return cachedRuntimeInfo
  }

  cachedRuntimeInfo = detectRuntimeUncached()
  return cachedRuntimeInfo
}

/**
 * Clear the cached runtime info (useful for testing)
 */
export function clearRuntimeCache(): void {
  cachedRuntimeInfo = null
}

/**
 * Check if running in Bun runtime
 */
function isBun(): boolean {
  return typeof globalThis !== "undefined" && "Bun" in globalThis
}

/**
 * Check if running in Deno runtime
 */
function isDeno(): boolean {
  return typeof globalThis !== "undefined" && "Deno" in globalThis
}

/**
 * Check if running in a browser environment
 */
function isBrowserEnv(): boolean {
  return typeof globalThis !== "undefined" && "window" in globalThis && "document" in globalThis
}

/**
 * Check if running in a worker context
 */
function isWorkerEnv(): boolean {
  // Web Worker or Service Worker
  if (typeof globalThis !== "undefined" && "self" in globalThis && !("window" in globalThis)) {
    // Check for WorkerGlobalScope
    if ("WorkerGlobalScope" in globalThis) {
      return true
    }
    // Check for ServiceWorkerGlobalScope
    if ("ServiceWorkerGlobalScope" in globalThis) {
      return true
    }
    // Cloudflare Workers have no window but have fetch
    if ("caches" in globalThis && "fetch" in globalThis) {
      return true
    }
  }
  return false
}

/**
 * Check if running in Node.js
 */
function isNode(): boolean {
  if (typeof globalThis === "undefined") {
    return false
  }
  const proc = globalThis.process
  if (typeof proc === "undefined") {
    return false
  }
  return typeof proc.versions.node === "string"
}

/**
 * Get Bun version
 */
function getBunVersion(): string | null {
  if (isBun()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    return String((globalThis as any).Bun.version)
  }
  return null
}

/**
 * Get Deno version
 */
function getDenoVersion(): string | null {
  if (isDeno()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const version = (globalThis as any).Deno?.version?.deno as string | undefined
    return version ?? null
  }
  return null
}

/**
 * Get Node.js version
 */
function getNodeVersion(): string | null {
  if (isNode()) {
    return globalThis.process.versions.node
  }
  return null
}

/**
 * Perform runtime detection without caching
 */
function detectRuntimeUncached(): RuntimeInfo {
  // Check Bun first (Bun also has process.versions.node for compatibility)
  if (isBun()) {
    return {
      runtime: Runtime.Bun,
      version: getBunVersion(),
      supportsHttp2: true,
      supportsGrpcJs: true, // Bun has Node.js compatibility
      isBrowser: false,
      isWorker: false
    }
  }

  // Check Deno
  if (isDeno()) {
    return {
      runtime: Runtime.Deno,
      version: getDenoVersion(),
      supportsHttp2: true,
      supportsGrpcJs: false, // Deno needs npm: specifiers or different transport
      isBrowser: false,
      isWorker: false
    }
  }

  // Check browser/worker environments
  if (isBrowserEnv() || isWorkerEnv()) {
    return {
      runtime: Runtime.Browser,
      version: null,
      supportsHttp2: false, // Browsers don't expose raw HTTP/2
      supportsGrpcJs: false, // Browser needs gRPC-web
      isBrowser: isBrowserEnv(),
      isWorker: isWorkerEnv()
    }
  }

  // Check Node.js
  if (isNode()) {
    return {
      runtime: Runtime.Node,
      version: getNodeVersion(),
      supportsHttp2: true,
      supportsGrpcJs: true,
      isBrowser: false,
      isWorker: false
    }
  }

  // Unknown runtime
  return {
    runtime: Runtime.Unknown,
    version: null,
    supportsHttp2: false,
    supportsGrpcJs: false,
    isBrowser: false,
    isWorker: false
  }
}

/**
 * Assert that the current runtime is one of the supported types.
 * Throws if the runtime is not supported.
 *
 * @param supported - Array of supported runtime types
 * @throws Error if current runtime is not in the supported list
 *
 * @example
 * ```typescript
 * // Ensure we're running in Node.js or Bun
 * assertRuntime([Runtime.Node, Runtime.Bun])
 * ```
 */
export function assertRuntime(supported: RuntimeType[]): void {
  const info = detectRuntime()
  if (!supported.includes(info.runtime)) {
    throw new Error(
      `Unsupported runtime: ${info.runtime}. ` +
        `This operation requires one of: ${supported.join(", ")}`
    )
  }
}

/**
 * Check if the current runtime supports @grpc/grpc-js
 */
export function supportsGrpcJs(): boolean {
  return detectRuntime().supportsGrpcJs
}

/**
 * Check if the current runtime requires gRPC-web transport
 */
export function requiresGrpcWeb(): boolean {
  const info = detectRuntime()
  return info.isBrowser || info.isWorker
}

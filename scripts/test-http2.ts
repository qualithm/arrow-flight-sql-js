/**
 * HTTP/2 support test for Bun, Node, and Deno
 *
 * Run with:
 *   node --experimental-strip-types scripts/test-http2.ts
 *   bun scripts/test-http2.ts
 *   deno run --allow-net scripts/test-http2.ts
 */

declare const Deno:
  | {
      version: { deno: string }
    }
  | undefined

function detectRuntime(): { name: string; version: string } {
  if (typeof Deno !== "undefined") {
    return { name: "Deno", version: Deno.version.deno }
  }
  if (typeof Bun !== "undefined") {
    return { name: "Bun", version: Bun.version }
  }
  return { name: "Node", version: process.version }
}

async function testHttp2Module(): Promise<boolean> {
  try {
    const http2 = await import("node:http2")
    return typeof http2.connect === "function"
  } catch {
    return false
  }
}

async function testHttp2Connection(): Promise<{ success: boolean; error?: string }> {
  try {
    const http2 = await import("node:http2")

    return await new Promise((resolve) => {
      const client = http2.connect("https://www.google.com")

      const timeout = setTimeout(() => {
        client.close()
        resolve({ success: false, error: "Connection timeout" })
      }, 5000)

      client.on("connect", () => {
        clearTimeout(timeout)
        client.close()
        resolve({ success: true })
      })

      client.on("error", (err: Error) => {
        clearTimeout(timeout)
        client.close()
        resolve({ success: false, error: err.message })
      })
    })
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function runTests(): Promise<void> {
  const { name, version } = detectRuntime()

  console.log("╔════════════════════════════════════════════╗")
  console.log("║         HTTP/2 Support Test                ║")
  console.log("╠════════════════════════════════════════════╣")
  console.log(`║ Runtime: ${name.padEnd(33)}║`)
  console.log(`║ Version: ${version.padEnd(33)}║`)
  console.log("╠════════════════════════════════════════════╣")

  // Test 1: http2 module availability
  const moduleAvailable = await testHttp2Module()
  const moduleStatus = moduleAvailable ? "✅ Available" : "❌ Not available"
  console.log(`║ http2 module: ${moduleStatus.padEnd(28)}║`)

  // Test 2: Actual HTTP/2 connection
  if (moduleAvailable) {
    console.log("║ Testing connection to google.com...        ║")
    const connResult = await testHttp2Connection()
    const connStatus = connResult.success ? "✅ Works" : `❌ ${connResult.error ?? "Unknown error"}`
    console.log(`║ http2 connect: ${connStatus.padEnd(27)}║`)
  } else {
    console.log("║ http2 connect: ⏭️  Skipped (no module)      ║")
  }

  console.log("╚════════════════════════════════════════════╝")

  // Summary for gRPC
  console.log("\n📋 gRPC Compatibility:")
  if (moduleAvailable) {
    console.log("   @grpc/grpc-js should work with this runtime.")
  } else {
    console.log("   @grpc/grpc-js will NOT work - http2 module missing.")
  }
}

runTests().catch(console.error)

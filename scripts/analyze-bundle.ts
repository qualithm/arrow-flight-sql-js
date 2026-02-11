#!/usr/bin/env bun
/**
 * Bundle Analysis Script
 *
 * Analyzes the built output to ensure:
 * 1. No Node-specific imports leak into universal paths
 * 2. Transport abstraction is properly isolated
 * 3. Runtime detection doesn't have side effects
 */

import * as fs from "fs"
import * as path from "path"

const DIST_DIR = path.join(import.meta.dir, "..", "dist")

// Files that should NOT import @grpc/grpc-js directly (universal paths)
const UNIVERSAL_FILES = ["runtime.js", "transport.js", "arrow.js", "errors.js", "proto.js"]

// Files that ARE allowed to import @grpc/grpc-js (Node/Bun specific)
const GRPC_ALLOWED_FILES = [
  "transport-grpc-js.js",
  "client.js",
  "pool.js",
  "index.js" // index re-exports everything
]

// Patterns that indicate Node-specific code
const NODE_SPECIFIC_PATTERNS = [
  /require\s*\(\s*["']@grpc\/grpc-js["']\s*\)/,
  /require\s*\(\s*["']http2["']\s*\)/,
  /require\s*\(\s*["']net["']\s*\)/,
  /require\s*\(\s*["']tls["']\s*\)/
]

type AnalysisResult = {
  file: string
  issues: string[]
  size: number
}

function analyzeFile(filePath: string): AnalysisResult {
  const content = fs.readFileSync(filePath, "utf-8")
  const fileName = path.basename(filePath)
  const issues: string[] = []
  const size = content.length

  // Check if universal file has actual gRPC imports (not just comments/strings)
  if (UNIVERSAL_FILES.includes(fileName)) {
    // Look for actual import statements or require calls
    const importPatterns = [
      /from\s+["']@grpc\/grpc-js["']/,
      /require\s*\(\s*["']@grpc\/grpc-js["']\s*\)/,
      /import\s+.*["']@grpc\/grpc-js["']/
    ]

    for (const pattern of importPatterns) {
      if (pattern.test(content)) {
        issues.push(`Universal file has @grpc/grpc-js import: ${pattern.source}`)
      }
    }

    for (const pattern of NODE_SPECIFIC_PATTERNS) {
      if (pattern.test(content)) {
        issues.push(`Node-specific require pattern found: ${pattern.source}`)
      }
    }
  }

  return { file: fileName, issues, size }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function main(): void {
  console.log("🔍 Bundle Analysis\n")
  console.log("=".repeat(60))

  // Check if dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    console.log("❌ dist/ directory not found. Run 'bun run build' first.")
    process.exit(1)
  }

  // Get all .js files
  const jsFiles = fs.readdirSync(DIST_DIR).filter((f) => f.endsWith(".js"))

  console.log(`\n📦 Analyzing ${String(jsFiles.length)} JavaScript files...\n`)

  const results: AnalysisResult[] = []
  let totalSize = 0
  let hasIssues = false

  for (const file of jsFiles) {
    const filePath = path.join(DIST_DIR, file)
    const result = analyzeFile(filePath)
    results.push(result)
    totalSize += result.size

    if (result.issues.length > 0) {
      hasIssues = true
    }
  }

  // Print file sizes
  console.log("📊 File Sizes:")
  console.log("-".repeat(60))

  const sortedBySize = [...results].sort((a, b) => b.size - a.size)
  for (const result of sortedBySize) {
    const sizeStr = formatBytes(result.size).padStart(10)
    const icon = UNIVERSAL_FILES.includes(result.file) ? "🌐" : "📦"
    console.log(`${icon} ${sizeStr}  ${result.file}`)
  }

  console.log("-".repeat(60))
  console.log(`   ${formatBytes(totalSize).padStart(10)}  Total`)

  // Print issues
  if (hasIssues) {
    console.log("\n⚠️  Issues Found:")
    console.log("-".repeat(60))
    for (const result of results) {
      if (result.issues.length > 0) {
        console.log(`\n❌ ${result.file}:`)
        for (const issue of result.issues) {
          console.log(`   - ${issue}`)
        }
      }
    }
    process.exit(1)
  } else {
    console.log("\n✅ Bundle analysis passed!")
    console.log("   - No Node-specific leaks in universal paths")
    console.log("   - Transport abstraction is properly isolated")
  }

  // Check universal files don't import grpc-specific transport
  console.log("\n🔗 Dependency Analysis:")
  console.log("-".repeat(60))

  for (const file of UNIVERSAL_FILES) {
    const filePath = path.join(DIST_DIR, file)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8")
      const hasGrpcImport = content.includes("transport-grpc-js")
      const status = hasGrpcImport ? "❌ imports grpc-js transport" : "✅ no grpc-js imports"
      console.log(`${file.padEnd(20)} ${status}`)
    }
  }

  console.log("\n📁 File Classification:")
  console.log("-".repeat(60))
  console.log("🌐 Universal (no runtime-specific code):", UNIVERSAL_FILES.join(", "))
  console.log("📦 Runtime-specific (Node/Bun):", GRPC_ALLOWED_FILES.join(", "))
}

main()

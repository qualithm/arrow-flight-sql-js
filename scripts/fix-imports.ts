#!/usr/bin/env bun
/**
 * Post-build script to add .js extensions to relative imports.
 *
 * This is needed for Node.js ESM compatibility because TypeScript's
 * bundler moduleResolution doesn't add extensions, but Node.js ESM
 * requires them for relative imports.
 */

import * as fs from "fs"
import * as path from "path"

const DIST_DIR = path.join(import.meta.dir, "..", "dist")

/**
 * Process an import path and add .js extension if needed
 */
function processImportPath(
  match: string,
  prefix: string,
  quote: string,
  importPath: string,
  filePath: string
): { result: string; modified: boolean } {
  // Don't add .js if it already ends with an extension
  if (importPath.endsWith(".js") || importPath.endsWith(".json") || importPath.endsWith(".mjs")) {
    return { result: match, modified: false }
  }

  // Resolve the import path to check if it's a directory
  const currentDir = path.dirname(filePath)
  const resolvedPath = path.resolve(currentDir, importPath)

  // Check if this is a directory (needs /index.js)
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    // Check if index.js exists in the directory
    const indexPath = path.join(resolvedPath, "index.js")
    if (fs.existsSync(indexPath)) {
      return {
        result: `${prefix}${quote}${importPath}/index.js${quote}`,
        modified: true
      }
    }
  }

  return {
    result: `${prefix}${quote}${importPath}.js${quote}`,
    modified: true
  }
}

/**
 * Add .js extensions to relative imports in a file
 */
function addJsExtensions(filePath: string, distDir: string): void {
  const originalContent = fs.readFileSync(filePath, "utf-8")
  let content = originalContent

  // Match: from "./something" or from '../something' (without .js extension)
  // Handles both simple file imports and directory index imports
  const importRegex = /(from\s+)(["'])(\.\.?\/[^"']+)\2/g

  content = content.replace(
    importRegex,
    (match: string, prefix: string, quote: string, importPath: string) => {
      const result = processImportPath(match, prefix, quote, importPath, filePath)
      return result.result
    }
  )

  // Also handle: export { ... } from "./something"
  const exportRegex = /(export\s+\{[^}]+\}\s+from\s+)(["'])(\.\.?\/[^"']+)\2/g

  content = content.replace(
    exportRegex,
    (match: string, prefix: string, quote: string, importPath: string) => {
      const result = processImportPath(match, prefix, quote, importPath, filePath)
      return result.result
    }
  )

  // Handle: export * from "./something"
  const reExportRegex = /(export\s+\*\s+from\s+)(["'])(\.\.?\/[^"']+)\2/g

  content = content.replace(
    reExportRegex,
    (match: string, prefix: string, quote: string, importPath: string) => {
      const result = processImportPath(match, prefix, quote, importPath, filePath)
      return result.result
    }
  )

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content)
    console.log(`  ✓ ${path.relative(distDir, filePath)}`)
  }
}

function main(): void {
  console.log("🔧 Adding .js extensions to relative imports...\n")

  if (!fs.existsSync(DIST_DIR)) {
    console.log("❌ dist/ directory not found. Run 'bun run build' first.")
    process.exit(1)
  }

  // Process all .js files in dist
  const jsFiles = fs.readdirSync(DIST_DIR).filter((f) => f.endsWith(".js"))

  for (const file of jsFiles) {
    const filePath = path.join(DIST_DIR, file)
    addJsExtensions(filePath, DIST_DIR)
  }

  // Also process .d.ts files for declaration imports
  const dtsFiles = fs.readdirSync(DIST_DIR).filter((f) => f.endsWith(".d.ts"))

  for (const file of dtsFiles) {
    const filePath = path.join(DIST_DIR, file)
    addJsExtensions(filePath, DIST_DIR)
  }

  // Process subdirectories (e.g., generated/)
  const subdirs = fs.readdirSync(DIST_DIR).filter((f) => {
    const stat = fs.statSync(path.join(DIST_DIR, f))
    return stat.isDirectory()
  })

  for (const subdir of subdirs) {
    const subdirPath = path.join(DIST_DIR, subdir)
    const subFiles = fs
      .readdirSync(subdirPath)
      .filter((f) => f.endsWith(".js") || f.endsWith(".d.ts"))

    for (const file of subFiles) {
      const filePath = path.join(subdirPath, file)
      addJsExtensions(filePath, DIST_DIR)
    }
  }

  console.log("\n✅ Done!")
}

main()

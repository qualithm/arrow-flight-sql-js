import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import eslint from "@eslint/js"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import simpleImportSortPlugin from "eslint-plugin-simple-import-sort"
import unusedImportsPlugin from "eslint-plugin-unused-imports"
import globals from "globals"
import tseslint from "typescript-eslint"

let rootDir: string

if ("path" in import.meta) {
  rootDir = dirname(import.meta.path)
} else {
  rootDir = dirname(fileURLToPath(import.meta.url))
}

const ignorePatterns = ["dist", "docs/theme", "docs/api", "docs/theme/dist"]

const asRule = (x: readonly ["off" | "warn" | "error", ...unknown[]]) =>
  x as unknown as Linter.RuleEntry

const namingConventionBase = [
  "error",

  { selector: "typeLike", format: ["PascalCase"] },
  { selector: "typeParameter", format: ["PascalCase"] },
  { selector: "enum", format: ["PascalCase"] },
  { selector: "enumMember", format: ["UPPER_CASE"] },
  { selector: "interface", format: null, custom: { regex: "^I[A-Z]", match: false } },

  { selector: "function", format: ["camelCase"] },
  { selector: "method", format: ["camelCase"] },
  { selector: "accessor", format: ["camelCase"] },
  { selector: "variable", format: ["camelCase", "PascalCase"] },
  {
    selector: "variable",
    modifiers: ["unused"],
    leadingUnderscore: "allow",
    format: ["camelCase", "PascalCase", "UPPER_CASE"]
  },
  { selector: "variable", modifiers: ["destructured"], format: null },

  { selector: "parameter", format: ["camelCase"] },
  {
    selector: "parameter",
    modifiers: ["unused"],
    leadingUnderscore: "allow",
    format: ["camelCase"]
  },
  { selector: "parameterProperty", format: ["camelCase"] },

  { selector: "import", format: ["camelCase", "PascalCase"] },

  { selector: "objectLiteralProperty", format: ["camelCase", "PascalCase"] },
  { selector: "objectLiteralProperty", modifiers: ["requiresQuotes"], format: null },
  { selector: "objectLiteralMethod", format: ["camelCase"] },
  { selector: "objectLiteralMethod", modifiers: ["requiresQuotes"], format: null },

  { selector: "typeProperty", format: ["camelCase", "PascalCase"] },
  { selector: "typeProperty", modifiers: ["requiresQuotes"], format: null },
  {
    selector: "typeProperty",
    format: null,
    filter: { regex: "^[A-Z][A-Z0-9_]*$", match: true }
  },

  { selector: "property", format: ["camelCase", "PascalCase"] },
  { selector: "property", modifiers: ["requiresQuotes"], format: null },
  { selector: "property", format: null, filter: { regex: "^[A-Z][A-Z0-9_]*$", match: true } },

  { selector: "default", format: ["camelCase"] }
] as const

export default defineConfig([
  { ignores: ignorePatterns },

  {
    extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir
      }
    },
    plugins: {
      "simple-import-sort": simpleImportSortPlugin,
      "unused-imports": unusedImportsPlugin
    },
    rules: {
      "brace-style": ["error", "1tbs", { allowSingleLine: false }],
      curly: ["error", "all"],
      "max-statements-per-line": ["error", { max: 1 }],

      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", args: "after-used", argsIgnorePattern: "^_" }
      ],

      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/naming-convention": asRule(namingConventionBase),
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unnecessary-type-parameters": "off",

      "no-restricted-syntax": [
        "error",
        {
          selector: "PrivateIdentifier",
          message:
            "ECMAScript private identifiers (#name) are disallowed; use standard visibility and camelCase."
        }
      ]
    }
  },

  {
    name: "prettier-compat",
    rules: {
      "arrow-body-style": "off",
      "prefer-arrow-callback": "off"
    }
  }
])

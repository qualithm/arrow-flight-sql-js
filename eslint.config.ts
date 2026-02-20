import { defineConfig } from "eslint/config"

import baseConfig from "./eslint.base.config"

export default defineConfig([
  { ignores: ["dist", "docs", "src/generated"] },
  ...baseConfig,

  // Examples can use console.log for demonstration purposes
  {
    name: "examples-overrides",
    files: ["examples/**/*.ts"],
    rules: {
      "no-console": "off"
    }
  }
])

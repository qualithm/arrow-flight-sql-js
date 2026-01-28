import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"
import ssrPlugin from "vite-ssr-components/plugin"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    build: {
      sourcemap: env.NODE_ENV === "production" ? false : "inline",
      manifest: true,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return
            }
            const m = (pkg: string) => id.includes(`/node_modules/${pkg}/`)

            if (m("react") || m("react-dom")) {
              return "react"
            }
            if (m("react-router") || m("react-router-dom")) {
              return "router"
            }
            if (m("zustand") || m("immer")) {
              return "state"
            }
            if (m("@sentry")) {
              return "sentry"
            }
            if (m("ua-parser-js")) {
              return "ua"
            }
            return "vendor"
          }
        },
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
            return
          }
          warn(warning)
        }
      },
      target: "ES2023",
      chunkSizeWarningLimit: 700
    },
    plugins: [cloudflare(), ssrPlugin(), tailwindcss()],
    server: {
      allowedHosts: true,
      host: true,
      origin: `http://localhost:${env.HTTP_PORT}`,
      port: Number(env.HTTP_PORT),
      strictPort: true
    }
  }
})

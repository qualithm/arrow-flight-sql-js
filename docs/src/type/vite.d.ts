/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOG_LEVEL: "debug" | "info" | "warn" | "error"
  readonly VITE_SENTRY_CSP_REPORT: string
  readonly VITE_SENTRY_DSN: string
  readonly VITE_URI_APP: string
  readonly VITE_URI_DOCS: string
  readonly VITE_URI_ID: string
  readonly VITE_URI_PLATFORM: string
  readonly VITE_URI_SITE: string
}

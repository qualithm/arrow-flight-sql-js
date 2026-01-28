import { Hono } from "hono"
import { etag } from "hono/etag"
import { secureHeaders, type SecureHeadersVariables } from "hono/secure-headers"
import { renderToReadableStream } from "react-dom/server"
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router-dom"
import { Link, Script, ViteClient } from "vite-ssr-components/react"

import routes from "./routes"

export type AppEnv = { Variables: SecureHeadersVariables & { nonce: string } }

const app = new Hono<AppEnv>()
const staticHandler = createStaticHandler(routes)

app.use(etag())

app.use(async (c, next) => {
  const nonce = crypto.randomUUID()
  c.set("nonce", nonce)
  await next()
})

app.use((c, next) => {
  const nonce = c.get("nonce")
  return secureHeaders({
    reportingEndpoints: [
      {
        name: "sentry",
        url: `${import.meta.env.VITE_SENTRY_CSP_REPORT}&sentry_environment=${String(process.env.NODE_ENV)}`
      }
    ],
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      manifestSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        `'nonce-${nonce}'`,
        "https://browser.sentry-cdn.com",
        "https://js.sentry-cdn.com",
        "https://static.cloudflareinsights.com",
        "https://*.instatus.com",
        "https://challenges.cloudflare.com",
        "https://plausible.io"
      ],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      connectSrc: [
        "'self'",
        import.meta.env.VITE_URI_PLATFORM,
        "https://sentry.io",
        "https://*.ingest.sentry.io",
        "https://*.ingest.us.sentry.io",
        "https://*.cloudflareinsights.com",
        "https://*.instatus.com",
        "https://plausible.io"
      ],
      imgSrc: ["'self'", "https://cdn.qualithm.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["https://challenges.cloudflare.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      workerSrc: ["'self'"],
      mediaSrc: ["'none'"],
      reportTo: "sentry"
    },
    permissionsPolicy: {
      accelerometer: [],
      camera: [],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      payment: [],
      usb: []
    }
  })(c, next)
})

app.all("*", async (c) => {
  const url = new URL(c.req.url)
  const method = c.req.method
  const nonce = c.get("nonce")

  const body = method !== "GET" && method !== "HEAD" ? await c.req.blob() : undefined
  const request = new Request(url.toString(), {
    method,
    headers: c.req.raw.headers,
    body
  })

  const context = await staticHandler.query(request)
  if (context instanceof Response) {
    return context
  }

  const router = createStaticRouter(staticHandler.dataRoutes, context)

  c.header("Content-Type", "text/html")
  c.header("charset", "utf-8")

  const s = await renderToReadableStream(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          content="viewport-fit=cover, width=device-width, initial-scale=1.0, minimum-scale=1.0"
          name="viewport"
        />
        <meta content="Qualithm" name="author" />
        <meta content="index, follow" name="robots" />
        <meta content="index, follow" name="googlebot" />
        <meta content="light dark" name="color-scheme" />
        <meta content="#18181b" name="theme-color" />
        <meta content="#f4f4f5" media="(prefers-color-scheme: light)" name="theme-color" />
        <meta content="#18181b" media="(prefers-color-scheme: dark)" name="theme-color" />
        <meta content="yes" name="mobile-web-app-capable" />
        <meta content="black-translucent" name="apple-mobile-web-app-status-bar-style" />
        <meta content="telephone=no" name="format-detection" />
        <link
          href="https://cdn.qualithm.com/asset/favicon-32x32.png"
          rel="icon"
          sizes="32x32"
          type="image/png"
        />
        <link
          href="https://cdn.qualithm.com/asset/icon-default-256x256.png"
          rel="apple-touch-icon"
          sizes="256x256"
        />
        <link href="/manifest.json" rel="manifest" />
        <Link href="/src/style.css" rel="stylesheet" />
        <Script defer src="/src/client.tsx" />
        <ViteClient />
      </head>
      <body>
        <div id="root">
          <StaticRouterProvider context={context} nonce={nonce} router={router} />
        </div>
      </body>
    </html>
  )

  await s.allReady

  return c.body(s)
})

export default app

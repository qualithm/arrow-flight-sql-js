// import "./sentry"

import { enableMapSet } from "immer"
import { hydrateRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router-dom"

import log from "./lib/log"
import routes from "./routes"

globalThis.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  event.preventDefault()
  log.error({ event: "unhandled_rejection", error: event.reason as unknown })
})

enableMapSet()

const container = document.getElementById("root")
if (!container) {
  throw new Error("Container not found")
}

const router = createBrowserRouter(routes)

hydrateRoot(container, <RouterProvider router={router} />)

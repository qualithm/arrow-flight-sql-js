import type { HttpRequest, HttpResponse } from "../type/http"
import tc from "./try-catch"

const http = async <T, U>({
  body,
  credentials,
  method,
  signal,
  url
}: HttpRequest<T>): Promise<HttpResponse<U>> => {
  const [main] = await tc<Response | undefined>(async () => {
    const methodUpperCase = method ? method.toUpperCase() : "GET"
    return await fetch(url, {
      method: methodUpperCase,
      headers: {
        Accept: "application/json",
        ...(methodUpperCase !== "GET" ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: credentials ?? "include",
      signal
    })
  })
  if (main.error) {
    return { message: main.error.message } as HttpResponse<U>
  }
  if (main.result) {
    if (main.result.headers.get("content-type") !== "application/json") {
      return { message: "unexpected content type" } as HttpResponse<U>
    }
    const [json] = await tc<unknown>(async () => {
      return (await main.result?.json()) as unknown
    })
    if (json.error) {
      return { message: "invalid json" } as HttpResponse<U>
    }
    const origin = new URL(import.meta.env.VITE_URI_PLATFORM).origin
    const responseOrigin = new URL(main.result.url).origin
    if (origin === responseOrigin) {
      return { ...(json.result as HttpResponse<U>), status: main.result.status }
    } else {
      return { data: json.result as U, status: main.result.status }
    }
  }
  return { message: "no res received" } as HttpResponse<U>
}

export default http

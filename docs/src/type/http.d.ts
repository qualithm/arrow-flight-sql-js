export type Method = "get" | "patch" | "post" | "delete"

export type HttpRequest<T = unknown> = {
  body?: T
  credentials?: "include" | "same-origin" | "omit"
  method?: Method
  signal?: AbortSignal
  url: string
}

export type HttpResponse<U = unknown> = {
  data?: U
  message?: string
  status?: number
}

export type Page<T> = {
  current: number
  items: Array<T | undefined>
  last: number
}

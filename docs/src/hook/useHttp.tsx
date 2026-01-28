import { useCallback, useEffect, useRef, useState } from "react"

import http from "../lib/http"
import { deepSort } from "../lib/utils"
import type { HttpRequest, HttpResponse, Method } from "../type/http"
import type { Collection } from "./useCache"
import useCache from "./useCache"
import useQueue from "./useQueue"

interface useHttpOptions<T, U> extends HttpRequest<T> {
  auto?: boolean
  backoffMultiplier?: number
  body?: T
  cache?: keyof Collection
  credentials?: "include" | "same-origin" | "omit"
  maxBackoff?: number
  maxRetries?: number
  method?: Method
  onError?: (params: {
    body?: T
    data?: U
    message?: string
    method: Method
    status?: number
    url: string
  }) => Promise<void> | void
  onFetched?: (params: {
    body?: T
    data?: U
    message?: string
    method: Method
    status?: number
    url: string
  }) => Promise<void> | void
  pausePolling?: boolean
  pollInterval?: number
  pollOnHidden?: boolean
  preferCache?: boolean
  url: string
  subscribe?: boolean
}

interface useHttp<T, U> extends useHttpOptions<T, U> {
  abort: () => void
  data: U | undefined
  error: boolean
  fetched: boolean
  isPaused: boolean
  lastErrorAt: number | null
  lastFetchedAt: number | null
  loading: boolean
  message?: string
  nextRetryIn: number | null
  offline: boolean
  pause: (internal?: boolean) => void
  pausedAt: number | null
  fetch: (options?: {
    body?: T
    cache?: keyof Collection
    onError?: (params: {
      body?: T
      data?: U
      message?: string
      method: Method
      status?: number
      url: string
    }) => Promise<void> | void
    onFetched?: (params: {
      body?: T
      data?: U
      message?: string
      method: Method
      status?: number
      url: string
    }) => Promise<void> | void
    preferCache?: boolean
    url?: string
  }) => Promise<HttpResponse<U> | undefined>
  resume: (internal?: boolean) => void
  retries: number
  retry: () => Promise<HttpResponse<U> | undefined>
  status?: number
  willRetry: boolean
}

function now() {
  return Date.now()
}

function useHttp<T, U>({
  auto = false,
  backoffMultiplier = 2,
  body,
  cache,
  credentials = "include",
  maxBackoff = 300000,
  maxRetries = 5,
  method = "get",
  pausePolling = false,
  pollInterval = 0,
  pollOnHidden = false,
  preferCache = false,
  url,
  onError,
  onFetched,
  subscribe = true
}: useHttpOptions<T, U>): useHttp<T, U> {
  const c = useRef(useCache())
  const q = useRef(useQueue())
  const [data, setData] = useState<U | undefined>(undefined)
  const [error, setError] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState(pausePolling)
  const [lastErrorAt, setLastErrorAt] = useState<number | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | undefined>(undefined)
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null)
  const [offline, setOffline] = useState(false)
  const [pausedAt, setPausedAt] = useState<number | null>(pausePolling ? now() : null)
  const [retries, setRetries] = useState(0)
  const [status, setStatus] = useState<number | undefined>(undefined)
  const [fetched, setFetched] = useState<boolean>(false)
  const [willRetry, setWillRetry] = useState(false)

  const backoffMultiplierRef = useRef(backoffMultiplier)
  const retryBackoffRef = useRef(pollInterval)
  const bodyRef = useRef(body)
  const cacheRef = useRef(cache)
  const controllerRef = useRef<AbortController | null>(null)
  const credentialsRef = useRef(credentials)
  const isMounted = useRef(true)
  const maxBackoffRef = useRef(maxBackoff)
  const maxRetriesRef = useRef(maxRetries)
  const methodRef = useRef(method)
  const onErrorRef = useRef(onError)
  const onFetchedRef = useRef(onFetched)
  const pollIntervalRef = useRef(pollInterval)
  const pollOnHiddenRef = useRef(pollOnHidden)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preferCacheRef = useRef(preferCache)
  const queueKeyRef = useRef(
    `http:${method}:${url}:${JSON.stringify(deepSort(body))}` as `http:${string}:${string}:${string}`
  )
  const retriesRef = useRef(retries)
  const urlRef = useRef(url)

  const abort = () => {
    controllerRef.current?.abort()
  }

  const fetchRef = useRef<() => Promise<HttpResponse<U> | undefined>>(() =>
    Promise.resolve(undefined)
  )

  const fetch = useCallback(async (): Promise<HttpResponse<U> | undefined> => {
    setLoading(true)

    if (cacheRef.current && preferCacheRef.current) {
      const cache = c.current.get(cacheRef.current)
      if (cache) {
        setData(cache as unknown as U)
        setError(false)
        setFetched(true)
        setLastFetchedAt(now())
        setLoading(false)
        setMessage("cache hit")
        setStatus(undefined)
        return {
          data: cache as unknown as U,
          message: "cache hit",
          status: 200
        }
      }
    }

    const existing = q.current.get(queueKeyRef.current) as
      | Promise<HttpResponse<U> | undefined>
      | undefined
    if (existing) {
      const res = await existing
      if (res) {
        setData(res.data)
        setLoading(false)
        setMessage(res.message)
        setStatus(res.status)
        return res
      }
    }

    controllerRef.current = new AbortController()

    const promise = (async (): Promise<HttpResponse<U> | undefined> => {
      const { data, message, status } = await http<T, U>({
        body: bodyRef.current,
        credentials: credentialsRef.current,
        method: methodRef.current,
        signal: controllerRef.current?.signal,
        url: urlRef.current
      })
      setLoading(false)
      q.current.delete(queueKeyRef.current)
      if (!isMounted.current) {
        return
      }
      if (controllerRef.current?.signal.aborted) {
        return
      }
      if ([200, 201, 202, 204, 206].includes(status || 0)) {
        retryBackoffRef.current = pollIntervalRef.current
        if (cacheRef.current) {
          c.current.set(cacheRef.current, data as unknown as Collection[typeof cacheRef.current])
        }
        setData(data)
        setError(false)
        setFetched(true)
        setLastFetchedAt(now())
        setMessage(message)
        setNextRetryIn(null)
        setRetries(0)
        setStatus(status)
        setWillRetry(false)
        if (onFetchedRef.current) {
          await onFetchedRef.current({
            body: bodyRef.current,
            data,
            message,
            method: methodRef.current,
            status,
            url: urlRef.current
          })
        }
        return { data, message, status }
      }
      if ([408, 429, 500, 502, 503, 504].includes(status || 0)) {
        if (retriesRef.current < maxRetriesRef.current) {
          retryBackoffRef.current = Math.min(
            (retryBackoffRef.current || 100) * backoffMultiplierRef.current,
            maxBackoffRef.current
          )
          setRetries((prev) => prev + 1)
          setWillRetry(true)
          setNextRetryIn(retryBackoffRef.current)
          await new Promise((r) => setTimeout(r, retryBackoffRef.current))
          return fetchRef.current()
        }
        setError(true)
        setFetched(false)
        setLastErrorAt(now())
        setMessage(message)
        setStatus(status)
        if (onErrorRef.current) {
          await onErrorRef.current({
            body: bodyRef.current,
            data,
            message,
            method: methodRef.current,
            status,
            url: urlRef.current
          })
        }
        return { data, message, status }
      } else {
        setError(true)
        setFetched(false)
        setLastErrorAt(now())
        setMessage(message)
        setStatus(status)
        if (onErrorRef.current) {
          await onErrorRef.current({
            body: bodyRef.current,
            data,
            message,
            method: methodRef.current,
            status,
            url: urlRef.current
          })
        }
        return { data, message, status }
      }
    })()
    q.current.set(queueKeyRef.current, promise)
    return promise
  }, [])

  useEffect(() => {
    fetchRef.current = fetch
  }, [fetch])

  const pause = () => {
    setIsPaused(true)
    setPausedAt(now())
  }

  const refetch = async (options?: {
    body?: T
    cache?: keyof Collection
    onError?: (params: {
      body?: T
      data?: U
      message?: string
      method: Method
      status?: number
      url: string
    }) => Promise<void> | void
    onFetched?: (params: {
      body?: T
      data?: U
      message?: string
      method: Method
      status?: number
      url: string
    }) => Promise<void> | void
    preferCache?: boolean
    url?: string
  }) => {
    abort()
    bodyRef.current = options?.body !== undefined ? options.body : bodyRef.current
    cacheRef.current = options?.cache !== undefined ? options.cache : cacheRef.current
    onErrorRef.current = options?.onError !== undefined ? options.onError : onErrorRef.current
    onFetchedRef.current =
      options?.onFetched !== undefined ? options.onFetched : onFetchedRef.current
    preferCacheRef.current =
      options?.preferCache !== undefined ? options.preferCache : preferCacheRef.current
    urlRef.current = options?.url !== undefined ? options.url : urlRef.current
    setError(false)
    setFetched(false)
    setLastErrorAt(null)
    setRetries(0)
    setStatus(undefined)
    setWillRetry(false)
    return await fetch()
  }

  const retry = async () => {
    abort()
    setError(false)
    setFetched(false)
    setLastErrorAt(null)
    setRetries(0)
    setStatus(undefined)
    setWillRetry(false)
    return await fetch()
  }

  const resume = () => {
    setIsPaused(false)
    setPausedAt(null)
  }

  useEffect(() => {
    isMounted.current = true
    if (auto) {
      setTimeout(() => {
        void fetch()
      }, 0)
    }
    const controller = new AbortController()
    controllerRef.current = controller
    return () => {
      isMounted.current = false
      controller.abort()
    }
  }, [auto, fetch])

  useEffect(() => {
    if (subscribe) {
      if (!cacheRef.current) {
        return
      }
      const unsubscribe = useCache.subscribe(
        (cache) => cache.archive[cacheRef.current as keyof Collection]?.data,
        (cache) => {
          if (cache || preferCacheRef.current) {
            setData(cache as unknown as U)
            setError(false)
            setFetched(true)
            setLastFetchedAt(now())
            setLoading(false)
            setMessage("cache hit")
            setStatus(undefined)
          }
        }
      )
      return () => {
        unsubscribe()
      }
    }
  }, [subscribe])

  useEffect(() => {
    backoffMultiplierRef.current = backoffMultiplier
    bodyRef.current = body
    cacheRef.current = cache
    credentialsRef.current = credentials
    maxBackoffRef.current = maxBackoff
    maxRetriesRef.current = maxRetries
    methodRef.current = method
    pollIntervalRef.current = pollInterval
    preferCacheRef.current = preferCache
    queueKeyRef.current = `http:${method}:${url}:${JSON.stringify(deepSort(body))}`
    retriesRef.current = retries
    urlRef.current = url
  }, [
    backoffMultiplier,
    body,
    cache,
    credentials,
    maxBackoff,
    maxRetries,
    method,
    pollInterval,
    preferCache,
    retries,
    url
  ])

  useEffect(() => {
    if (error || isPaused || !pollInterval || willRetry) {
      return
    }
    const loop = () => {
      pollTimer.current = setTimeout(() => {
        void fetch()
        if (isMounted.current) {
          loop()
        }
      }, pollIntervalRef.current)
    }
    loop()
    return () => {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current)
      }
    }
  }, [error, fetch, isPaused, pollInterval, willRetry])

  useEffect(() => {
    if (!pollOnHiddenRef.current) {
      return
    }
    const handleVisibility = () => {
      if (document.hidden) {
        pause()
      } else if (!pausePolling) {
        resume()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [pausePolling])

  useEffect(() => {
    const handleOnline = () => {
      setOffline(false)
      if (!pausePolling) {
        resume()
      }
    }
    const handleOffline = () => {
      setOffline(true)
      pause()
    }
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [pausePolling])

  return {
    abort,
    body,
    cache,
    data,
    error,
    fetch: refetch,
    fetched,
    isPaused,
    lastErrorAt,
    lastFetchedAt,
    loading,
    message,
    method,
    nextRetryIn,
    offline,
    pause,
    pausedAt,
    resume,
    retries,
    retry,
    status,
    url,
    willRetry
  }
}

export default useHttp

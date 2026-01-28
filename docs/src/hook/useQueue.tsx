import { current, isDraft } from "immer"
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"

import type { HttpResponse } from "../type/http"

export type Collection = {
  [key: `http:${string}:${string}:${string}`]: Promise<HttpResponse | undefined>
}

export type Archive = { [C in keyof Collection]?: { data: Collection[C]; modifiedAt: Date } }

export type CacheStore = {
  archive: Archive
}

export type CacheAction = {
  get: <K extends keyof Collection>(key: K) => Collection[K] | undefined
  set: <K extends keyof Collection>(key: K, data: Collection[K]) => void
  delete: (key: keyof Collection) => void
  clear: () => void
}

function toPlain<T>(v: T): T {
  if (isDraft(v)) {
    return current(v)
  }

  try {
    return structuredClone(v)
  } catch {
    return v
  }
}

const cache = create<
  CacheAction & CacheStore,
  [["zustand/subscribeWithSelector", never], ["zustand/immer", never]]
>(
  subscribeWithSelector(
    immer((set, get) => ({
      archive: {},

      get: <K extends keyof Collection>(key: K) => {
        return get().archive[key]?.data
      },

      set: <K extends keyof Collection>(key: K, value: Collection[K]) => {
        const plain = toPlain(value)
        set((state) => {
          state.archive = {
            ...state.archive,
            [key]: { data: plain, modifiedAt: new Date() }
          }
        })
      },

      delete: (key: keyof Collection) => {
        set((state) => {
          Reflect.deleteProperty(state.archive as object, key as unknown as PropertyKey)
        })
      },

      clear: () => {
        set((state) => {
          state.archive = {}
        })
      }
    }))
  )
)

export default cache

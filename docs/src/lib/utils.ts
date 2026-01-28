import type { Context } from "hono"
import { UAParser } from "ua-parser-js"

export type Primitive = string | number | boolean | null | undefined
export type QueryValue = Primitive | QueryValue[] | { [key: string]: QueryValue }
export type DateInput = Date | string | number

export type LengthRule =
  | { exactLength: number; minLength?: never; maxLength?: never }
  | { exactLength?: never; minLength: number; maxLength: number }
  | { exactLength?: never; minLength?: never; maxLength?: never }

export type ParseOptions = LengthRule & {
  label: string
  digitsOnly?: boolean
  pattern?: RegExp
  trim?: boolean
}

export type ParseOk<T> = { isValid: true; message: string; value: T }
export type ParseError = { isValid: false; message: string }
export type ParseResult<T = string> = ParseOk<T> | ParseError

export function validate(raw: unknown, rules: ParseOptions): ParseResult {
  const { label, exactLength, minLength, maxLength, digitsOnly, pattern, trim = true } = rules
  const strRaw = String(raw)
  const value = trim ? strRaw.trim() : strRaw

  if (exactLength != null && value.length !== exactLength) {
    return {
      isValid: false,
      message: `${label} must be exactly ${String(exactLength)} characters long`
    }
  }
  if (minLength != null && value.length < minLength) {
    return {
      isValid: false,
      message: `${label} must be at least ${String(minLength)} characters long`
    }
  }
  if (maxLength != null && value.length > maxLength) {
    return {
      isValid: false,
      message: `${label} must be at most ${String(maxLength)} characters long`
    }
  }
  if (digitsOnly && !/^\d+$/.test(value)) {
    return { isValid: false, message: `${label} must contain digits only` }
  }
  if (pattern && !pattern.test(value)) {
    return { isValid: false, message: `${label} is invalid` }
  }
  return { isValid: true, message: `${label} valid`, value }
}

export function parseCode(code: unknown, length: number): ParseResult {
  return validate(code, { exactLength: length, label: "code", digitsOnly: true })
}

export function parseEmail(email: unknown, minLength = 8, maxLength = 128): ParseResult {
  const res = validate(email, {
    label: "email",
    minLength,
    maxLength,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i
  })
  if (!res.isValid) {
    return res
  }
  return { isValid: true, message: res.message, value: res.value.toLowerCase() }
}

export function parseName(name: unknown, minLength = 2, maxLength = 64): ParseResult {
  const res = validate(name, {
    label: "name",
    minLength,
    maxLength,
    pattern: /^(\p{L}+([.'-]?\p{L}+)*)(\s+(\p{L}+([.'-]?\p{L}+)*))*$/u
  })
  if (!res.isValid) {
    return res
  }
  const collapsed = res.value.replace(/\s+/g, " ")
  return { isValid: true, message: res.message, value: collapsed }
}

export function parseNameWithNumbers(name: unknown, minLength = 2, maxLength = 64): ParseResult {
  const firstWord = String.raw`\p{L}[\p{L}\p{N}]*([.'-]?[\p{L}\p{N}]+)*`
  const laterWord = String.raw`[\p{L}\p{N}]+([.'-]?[\p{L}\p{N}]+)*`
  const pattern = new RegExp(`^(${firstWord})(\\s+(${laterWord}))*$`, "u")
  const res = validate(name, { label: "name", minLength, maxLength, pattern })
  if (!res.isValid) {
    return res
  }
  const collapsed = res.value.replace(/\s+/g, " ").trim()
  return { isValid: true, message: res.message, value: collapsed }
}

export function parseNumber(value: unknown, minLength = 1, maxLength = 16): ParseResult {
  return validate(value, { label: "number", digitsOnly: true, minLength, maxLength })
}

export function parseSecret(secret: unknown, length: number): ParseResult {
  return validate(secret, { label: "secret", exactLength: length, pattern: /^[0-9A-Fa-f]+$/ })
}

export function toTimeago(input?: DateInput): string | null {
  if (input == null) {
    return null
  }
  const then = input instanceof Date ? input : new Date(input)
  if (isNaN(then.getTime())) {
    return null
  }

  const diffS = Math.round((then.getTime() - Date.now()) / 1000)
  if (Math.abs(diffS) < 5) {
    return "just now"
  }

  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; s: number }> = [
    { s: 31_536_000, unit: "year" },
    { s: 2_592_000, unit: "month" },
    { s: 604_800, unit: "week" },
    { s: 86_400, unit: "day" },
    { s: 3_600, unit: "hour" },
    { s: 60, unit: "minute" },
    { s: 1, unit: "second" }
  ]

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  for (const { unit, s } of units) {
    const v = Math.trunc(diffS / s)
    if (Math.abs(v) >= 1) {
      return rtf.format(v, unit)
    }
  }
  return "just now"
}

export function toTimestamp(input?: DateInput | null): string | null {
  if (!input) {
    return null
  }
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) {
    return null
  }

  const hours = d.getHours()
  const minutes = d.getMinutes()
  const amPm = hours >= 12 ? "pm" : "am"
  const hh = hours % 12 || 12
  const dd = d.getDate()
  const mm = d.getMonth() + 1
  const yy = d.getFullYear().toString().slice(-2)
  const pad = (n: number) => n.toString().padStart(2, "0")

  return `${pad(hh)}:${pad(minutes)}${amPm} ${pad(dd)}/${pad(mm)}/${yy}`
}

export function toUa(ua?: string | null): string | null {
  if (!ua) {
    return null
  }
  const parsed = new UAParser(ua).getResult()
  const browserName = parsed.browser.name ?? "Unknown"
  const osName = parsed.os.name ?? "Unknown"
  return `${browserName} on ${osName}`
}

export function toErrorMessage(e: unknown): string {
  if (typeof e === "string") {
    return e
  }
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === "string") {
      return m
    }
  }
  try {
    return JSON.stringify(e, null, 2).replace(/\s+/g, " ")
  } catch {
    return "error"
  }
}

export function toPlural(condition: number | boolean, singular: string, plural: string): string {
  const isPlural = typeof condition === "number" ? condition !== 1 : condition
  return isPlural ? plural : singular
}

export function toIntervalMs(input: string): number {
  const s = input.trim().toLowerCase()
  if (!s) {
    return 1000
  }

  const cleaned = s.replace(/[,_]/g, " ").replace(/\band\b/g, " ")
  let total = 0

  const units: Record<string, number> = {
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
    h: 3_600_000,
    hour: 3_600_000,
    hours: 3_600_000,
    hr: 3_600_000,
    hrs: 3_600_000,
    m: 60_000,
    millisecond: 1,
    milliseconds: 1,
    min: 60_000,
    mins: 60_000,
    minute: 60_000,
    minutes: 60_000,
    ms: 1,
    s: 1_000,
    sec: 1_000,
    second: 1_000,
    seconds: 1_000,
    secs: 1_000,
    w: 604_800_000,
    week: 604_800_000,
    weeks: 604_800_000,
    wk: 604_800_000,
    wks: 604_800_000
  }

  const re =
    /(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|wk|w)\b/g
  let m: RegExpExecArray | null

  while ((m = re.exec(cleaned)) !== null) {
    const n = Number(m[1])
    const u = m[2]
    if (Number.isFinite(n)) {
      total += n * (units[u] ?? 0)
    }
  }

  if (total === 0) {
    const n = Number(cleaned)
    if (Number.isFinite(n)) {
      return Math.max(0, Math.round(n))
    }
    return 1000
  }
  return Math.max(0, Math.round(total))
}

export function createUrl(
  baseUrl: string,
  params: Record<string, QueryValue>,
  hash?: string
): string {
  const url =
    typeof globalThis.location !== "undefined"
      ? new URL(baseUrl, globalThis.location.origin)
      : new URL(baseUrl)

  const searchParams = new URLSearchParams(url.search)

  const flatten = (obj: QueryValue, prefix = ""): [string, string][] => {
    const pairs: [string, string][] = []
    const fullKey = (k: string) => (prefix ? `${prefix}.${k}` : k)

    if (obj == null) {
      return pairs
    }

    if (Array.isArray(obj)) {
      for (const val of obj) {
        for (const p of flatten(val, prefix)) {
          pairs.push(p)
        }
      }
      return pairs
    }

    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        for (const p of flatten(v, fullKey(k))) {
          pairs.push(p)
        }
      }
      return pairs
    }

    pairs.push([prefix, String(obj)])
    return pairs
  }

  for (const [key, value] of Object.entries(params)) {
    for (const [k, v] of flatten(value, key)) {
      searchParams.append(k, v)
    }
  }

  url.search = String(searchParams)
  if (hash !== undefined) {
    url.hash = hash
  }

  return baseUrl.startsWith("/") ? url.pathname + url.search + url.hash : String(url)
}

export function decodeState(state: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!state) {
    return out
  }

  for (const pair of state.split(",")) {
    if (!pair) {
      continue
    }
    const [key, ...rest] = pair.split(":")
    const decodedKey = decodeURIComponent(key)
    const rawValue = decodeURIComponent(rest.join(":"))

    let parsedValue: string | number | boolean = rawValue
    if (rawValue === "true" || rawValue === "false") {
      parsedValue = rawValue === "true"
    } else if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      parsedValue = Number(rawValue)
    }

    out[decodedKey] = parsedValue
  }
  return out
}

export function encodeState(obj: Record<string, string | number | boolean>): string {
  const entriesSorted = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  return entriesSorted
    .map(([k, v]) => `${encodeURIComponent(k)}:${encodeURIComponent(String(v))}`)
    .join(",")
}

export function decodeUint8Array(payload: Uint8Array): string {
  return new TextDecoder().decode(payload)
}

export function encodeUint8Array(payload: string | object): Uint8Array {
  const encoder = new TextEncoder()
  if (typeof payload === "string") {
    return encoder.encode(payload)
  }
  if (typeof payload === "object") {
    return encoder.encode(JSON.stringify(payload))
  }
  return new Uint8Array()
}

export function deepSort<T>(v: T): T {
  const sortInner = (val: unknown, seen: WeakSet<object>): unknown => {
    if (val === null) {
      return val
    }
    if (typeof val !== "object") {
      return val
    }

    if (Array.isArray(val)) {
      return val.map((x) => sortInner(x, seen))
    }

    if (Object.prototype.toString.call(val) !== "[object Object]") {
      return val
    }

    const obj = val as Record<string, unknown>
    if (seen.has(obj)) {
      return obj
    }
    seen.add(obj)

    const entriesSorted = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
    const out: Record<string, unknown> = {}
    for (const [k, x] of entriesSorted) {
      out[k] = sortInner(x, seen)
    }
    return out
  }
  return sortInner(v, new WeakSet()) as T
}

export function generateRandomCode(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let digitString = ""
  for (let i = 0; i < length; i++) {
    digitString += (bytes[i] % 10).toString()
  }
  return digitString.slice(0, length)
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      resolve()
      return
    }
    const t = setTimeout(resolve, ms)
    if (signal) {
      const onAbort = () => {
        clearTimeout(t)
        resolve()
      }
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener("abort", onAbort, { once: true })
      }
    }
  })
}

export function getClientIp(c: Context): string {
  const xff = c.req.header("X-Forwarded-For")
  const cf = c.req.header("CF-Connecting-IP")
  const xr = c.req.header("X-Real-IP")
  const direct = (c as unknown as { ip?: () => string }).ip?.()
  const pick = xff?.split(",")[0]?.trim() || cf || xr || direct || "unknown"
  return pick.slice(0, 64)
}

export function getUserAgent(c: Context): string {
  return (c.req.header("User-Agent") ?? "unknown").slice(0, 512)
}

export type Rows<T> = Partial<T[]>

export type Tiny<TStatus extends number, TExtra extends object = object> = {
  body: { message: string } & TExtra
  init: { status: TStatus }
}

export function ok(message: string): Tiny<200>
export function ok<T extends object>(message: string, extra: T): Tiny<200, T>
export function ok<T extends object = object>(message: string, extra?: T) {
  return { body: extra ? { message, ...extra } : { message }, init: { status: 200 } }
}

export function created(message: string): Tiny<201>
export function created<T extends object>(message: string, extra: T): Tiny<201, T>
export function created<T extends object = object>(message: string, extra?: T) {
  return { body: extra ? { message, ...extra } : { message }, init: { status: 201 } }
}

export function noContent(): Tiny<204> {
  return { body: { message: "ok" }, init: { status: 204 } }
}

export function accepted(message: string): Tiny<202> {
  return { body: { message }, init: { status: 202 } }
}

export function badRequest(message: string): Tiny<400> {
  return { body: { message }, init: { status: 400 } }
}

export function unauthorised(message: string): Tiny<401> {
  return { body: { message }, init: { status: 401 } }
}

export function forbidden(message: string): Tiny<403> {
  return { body: { message }, init: { status: 403 } }
}

export function notFound(message: string): Tiny<404> {
  return { body: { message }, init: { status: 404 } }
}

export function conflict(message: string): Tiny<409> {
  return { body: { message }, init: { status: 409 } }
}

export function unsupportedMediaType(message: string): Tiny<415> {
  return { body: { message }, init: { status: 415 } }
}

export function unprocessableEntity(message: string): Tiny<422> {
  return { body: { message }, init: { status: 422 } }
}

export function failedDependency(message: string): Tiny<424> {
  return { body: { message }, init: { status: 424 } }
}

export function tooManyRequests(message: string): Tiny<429> {
  return { body: { message }, init: { status: 429 } }
}

export function internalServerError(message: string): Tiny<500> {
  return { body: { message }, init: { status: 500 } }
}

export type System = "decimal" | "binary"
export type DecUnit = "B" | "kB" | "MB" | "GB" | "TB" | "PB" | "EB" | "ZB" | "YB"
export type BinUnit = "B" | "KiB" | "MiB" | "GiB" | "TiB" | "PiB" | "EiB" | "ZiB" | "YiB"
export type AnyUnit = DecUnit | BinUnit

const UNITS = {
  decimal: ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"] as const,
  binary: ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"] as const
}

const STEP: Record<System, number> = { decimal: 1000, binary: 1024 }

const ALIASES: Record<string, AnyUnit | undefined> = {
  b: "B",
  byte: "B",
  bytes: "B",
  kb: "kB",
  kilobyte: "kB",
  kilobytes: "kB",
  mb: "MB",
  megabyte: "MB",
  megabytes: "MB",
  gb: "GB",
  gigabyte: "GB",
  gigabytes: "GB",
  tb: "TB",
  terabyte: "TB",
  terabytes: "TB",
  pb: "PB",
  petabyte: "PB",
  petabytes: "PB",
  eb: "EB",
  exabyte: "EB",
  exabytes: "EB",
  zb: "ZB",
  zettabyte: "ZB",
  zettabytes: "ZB",
  yb: "YB",
  yottabyte: "YB",
  yottabytes: "YB",
  kib: "KiB",
  kibibyte: "KiB",
  kibibytes: "KiB",
  mib: "MiB",
  mebibyte: "MiB",
  mebibytes: "MiB",
  gib: "GiB",
  gibibyte: "GiB",
  gibibytes: "GiB",
  tib: "TiB",
  tebibyte: "TiB",
  tebibytes: "TiB",
  pib: "PiB",
  pebibyte: "PiB",
  pebibytes: "PiB",
  eib: "EiB",
  exbibyte: "EiB",
  exbibytes: "EiB",
  zib: "ZiB",
  zebibyte: "ZiB",
  zebibytes: "ZiB",
  yib: "YiB",
  yobibyte: "YiB",
  yobibytes: "YiB"
}

export function normalizeUnit(raw: string): { system: System; symbol: AnyUnit; index: number } {
  const u = raw.trim()

  if (UNITS.decimal.includes(u as DecUnit)) {
    return { system: "decimal", symbol: u as DecUnit, index: UNITS.decimal.indexOf(u as DecUnit) }
  }
  if (UNITS.binary.includes(u as BinUnit)) {
    return { system: "binary", symbol: u as BinUnit, index: UNITS.binary.indexOf(u as BinUnit) }
  }

  const alias = ALIASES[u.toLowerCase()]
  if (!alias) {
    throw new Error(`Unknown unit: ${raw}`)
  }

  if (UNITS.decimal.includes(alias as DecUnit)) {
    return {
      system: "decimal",
      symbol: alias as DecUnit,
      index: UNITS.decimal.indexOf(alias as DecUnit)
    }
  }
  return {
    system: "binary",
    symbol: alias as BinUnit,
    index: UNITS.binary.indexOf(alias as BinUnit)
  }
}

export function convertBytes(bytes: number, unit: string): number {
  const { system, index } = normalizeUnit(unit)
  return bytes / Math.pow(STEP[system], index)
}

export function toBytes(value: number, unit: string): number {
  const { system, index } = normalizeUnit(unit)
  return value * Math.pow(STEP[system], index)
}

type FormatOpts = {
  system?: System | "smart"
  decimals?: number
  locale?: string
  minUnit?: AnyUnit
  maxUnit?: AnyUnit
  stripZeros?: boolean
  space?: "" | " "
}

export function formatBytes(
  bytes: number,
  {
    system = "binary",
    decimals = 1,
    locale = "en",
    minUnit = "B",
    maxUnit = "YiB",
    stripZeros = true,
    space = " "
  }: FormatOpts = {}
): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "-"
  }
  if (bytes === 0) {
    return "0 B"
  }

  if (system === "smart") {
    const nearInt = (n: number) => Math.abs(n - Math.round(n)) < 1e-6
    system = nearInt(bytes / 1024 ** 3)
      ? "binary"
      : nearInt(bytes / 1000 ** 3)
        ? "decimal"
        : "binary"
  }

  const units = UNITS[system]
  const step = STEP[system]

  const minNorm = normalizeUnit(minUnit)
  const maxNorm = normalizeUnit(maxUnit)
  const minIdx = minNorm.system === system ? minNorm.index : 0
  const maxIdx = maxNorm.system === system ? maxNorm.index : units.length - 1

  let idx = Math.max(0, minIdx === -1 ? 0 : minIdx)
  const upper = maxIdx === -1 ? units.length - 1 : maxIdx

  let value = bytes
  while (value >= step && idx < upper) {
    value /= step
    idx++
  }

  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals })
  let out = nf.format(value)

  if (stripZeros && decimals > 0 && out.includes(".")) {
    out = out.replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1")
  }

  return `${out}${space}${units[idx]}`
}

export function parseSize(input: string): number {
  const m = input.trim().match(/^([\d.,_]+)\s*([A-Za-z]+)?$/)
  if (!m) {
    throw new Error(`Invalid size: ${input}`)
  }
  const rawNum = m[1].replace(/[_ ,]/g, "")
  const value = Number(rawNum)
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number: ${m[1]}`)
  }
  const unit = m[2] || "B"
  return toBytes(value, unit)
}

export default {
  validate,
  parseCode,
  parseEmail,
  parseName,
  parseNumber,
  parseSecret,
  toTimeago,
  toTimestamp,
  toUa,
  toErrorMessage,
  toPlural,
  toIntervalMs,
  createUrl,
  decodeState,
  encodeState,
  decodeUint8Array,
  encodeUint8Array,
  deepSort,
  generateRandomCode,
  sleep,
  getClientIp,
  getUserAgent,
  ok,
  created,
  noContent,
  accepted,
  badRequest,
  unauthorised,
  forbidden,
  notFound,
  conflict,
  unsupportedMediaType,
  unprocessableEntity,
  failedDependency,
  tooManyRequests,
  internalServerError,
  normalizeUnit,
  convertBytes,
  toBytes,
  formatBytes,
  parseSize
}

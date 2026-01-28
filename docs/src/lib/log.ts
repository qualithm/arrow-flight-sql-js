const logLevel = { debug: 0, info: 1, warn: 2, error: 3 } as const
export type Level = keyof typeof logLevel

const rawEnv = import.meta.env.VITE_LOG_LEVEL
const envLevel: Level =
  typeof rawEnv === "string" && rawEnv.toLowerCase() in logLevel
    ? (rawEnv.toLowerCase() as Level)
    : "info"

const threshold = logLevel[envLevel]

function isCallable(fn: unknown): fn is (...args: unknown[]) => unknown {
  return typeof fn === "function"
}

export type LogMethod = (message?: unknown, ...optionalParams: unknown[]) => void

const methodMap: Record<Level, LogMethod> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}

export function getCaller(): string {
  const stack = new Error().stack
  if (!stack) {
    return "unknown"
  }

  const lines = stack.split("\n")

  let lastLogIndex = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("log.ts")) {
      lastLogIndex = i
      break
    }
  }
  const callerLine = lastLogIndex >= 0 ? lines[lastLogIndex + 1] : undefined
  if (!callerLine) {
    return "unknown"
  }

  const match = callerLine.match(/(?:\()?(.*):(\d+):(\d+)\)?$/)
  if (!match) {
    return "unknown"
  }

  const fullPath = match[1]
  const filename = fullPath.split(/[\\/]/).pop() || fullPath
  return `${filename}:${match[2]}`
}

export type AnyArgs = unknown[]

export type LogFields = Record<string, unknown>

function formatValue(v: unknown): string {
  if (v === null) {
    return "null"
  }
  if (v === undefined) {
    return "undefined"
  }
  if (typeof v === "string") {
    return v.includes(" ") || v.includes("=") || v.includes('"') ? `"${v.replace(/"/g, '\\"')}"` : v
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v)
  }
  if (v instanceof Error) {
    return `"${v.message.replace(/"/g, '\\"')}"`
  }
  return JSON.stringify(v)
}

function formatFields(fields: LogFields): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${formatValue(v)}`)
    .join(" ")
}

export function createLogger(namespace?: string) {
  function base(level: Level, ...args: AnyArgs) {
    if (logLevel[level] < threshold) {
      return
    }

    const caller = getCaller()
    const ts = new Date().toISOString()
    const method = methodMap[level]

    const resolvedArgs: unknown[] = args.length === 1 && isCallable(args[0]) ? [args[0]()] : args

    if (
      resolvedArgs.length === 1 &&
      typeof resolvedArgs[0] === "object" &&
      resolvedArgs[0] !== null &&
      !(resolvedArgs[0] instanceof Error)
    ) {
      const fields = resolvedArgs[0] as LogFields
      const baseFields = namespace
        ? `ts=${ts} level=${level} ns=${namespace} caller=${caller}`
        : `ts=${ts} level=${level} caller=${caller}`
      method(`${baseFields} ${formatFields(fields)}`)
      return
    }

    const prefix = namespace
      ? `ts=${ts} level=${level} ns=${namespace} caller=${caller}`
      : `ts=${ts} level=${level} caller=${caller}`

    method(prefix, ...resolvedArgs)
  }

  function debug(fields: LogFields): void
  function debug(...args: AnyArgs): void
  function debug(...args: AnyArgs) {
    base("debug", ...args)
  }

  function info(fields: LogFields): void
  function info(...args: AnyArgs): void
  function info(...args: AnyArgs) {
    base("info", ...args)
  }

  function warn(fields: LogFields): void
  function warn(...args: AnyArgs): void
  function warn(...args: AnyArgs) {
    base("warn", ...args)
  }

  function error(fields: LogFields): void
  function error(...args: AnyArgs): void
  function error(...args: AnyArgs) {
    if (args.length === 1 && args[0] instanceof Error) {
      const e = args[0]
      base("error", { event: "error", error: e.message, stack: e.stack })
      return
    }
    base("error", ...args)
  }

  return { debug, info, warn, error }
}

const defaultLogger = createLogger()

export const debug = (...args: AnyArgs) => {
  defaultLogger.debug(...args)
}
export const info = (...args: AnyArgs) => {
  defaultLogger.info(...args)
}
export const warn = (...args: AnyArgs) => {
  defaultLogger.warn(...args)
}
export const error = (...args: AnyArgs) => {
  defaultLogger.error(...args)
}

export default { debug, info, warn, error, createLogger }

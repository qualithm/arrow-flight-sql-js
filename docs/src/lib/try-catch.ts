export default async function tc<T = undefined, F = undefined, E = Error>(
  fn: () => Promise<T> | T,
  finallyFn?: () => Promise<F> | F
): Promise<[{ result: T | null; error: E | null }, { result: F | null; error: E | null }]> {
  let main: { result: T | null; error: E | null }
  let fin: { result: F | null; error: E | null } = { result: null, error: null }

  try {
    const result = await fn()
    main = { result, error: null }
  } catch (e: unknown) {
    main = { result: null, error: e as E }
  }

  if (finallyFn) {
    try {
      const result = await finallyFn()
      fin = { result, error: null }
    } catch (e: unknown) {
      fin = { result: null, error: e as E }
    }
  }

  return [main, fin]
}

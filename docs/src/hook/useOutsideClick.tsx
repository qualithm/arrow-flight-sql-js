import type { RefObject } from "react"
import { useEffect, useRef } from "react"

function useOutsideClick<T extends HTMLElement>(
  options: { disabled: boolean },
  callback: () => void
): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (options.disabled) {
      return
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callbackRef.current()
      }
    }
    document.addEventListener("click", handleClick, true)
    return () => {
      document.removeEventListener("click", handleClick, true)
    }
  }, [options.disabled])

  return ref
}

export default useOutsideClick

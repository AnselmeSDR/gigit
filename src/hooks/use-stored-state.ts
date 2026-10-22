import { useEffect, useState } from "react"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// useState mirrored in localStorage (per-browser UI state only)
export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState(() => read(key, fallback))
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage unavailable: the value just won't survive a reload
    }
  }, [key, value])
  return [value, setValue] as const
}

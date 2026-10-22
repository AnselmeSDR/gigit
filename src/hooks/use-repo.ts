import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  errorMessage,
  fetchCommit,
  fetchDiff,
  fetchFingerprint,
  fetchRepo,
} from "@/lib/api"
import type { CommitDetail, DiffTarget, RepoData } from "@/lib/types"

const POLL_MS = 3000

// Last snapshot of every repository opened this session: switching back to a
// tab shows it at once, then a fingerprint check decides whether to reload
const repoCache = new Map<string, { limit: number; data: RepoData }>()

// Loads a repository and reloads it whenever its refs or working tree change
export function useRepoData(repo: string | null, limit: number) {
  const [tick, setTick] = useState(0)
  const [done, setDone] = useState<{ key: string; error?: string } | null>(null)
  const pending = useRef(false)
  const requestKey = `${repo}\0${limit}\0${tick}`

  useEffect(() => {
    if (!repo) return
    let cancelled = false
    pending.current = true
    const hit = repoCache.get(repo)
    const load =
      hit?.limit === limit
        ? fetchFingerprint(repo).then((fingerprint) =>
            fingerprint === hit.data.fingerprint
              ? hit.data
              : fetchRepo(repo, limit)
          )
        : fetchRepo(repo, limit)
    load
      .then(
        (data) => {
          if (cancelled) return
          repoCache.set(repo, { limit, data })
          setDone({ key: requestKey })
        },
        (e) => {
          if (cancelled) return
          // Without a snapshot the error is shown in place of the repository
          if (hit) toast.error(errorMessage(e))
          setDone({ key: requestKey, error: errorMessage(e) })
        }
      )
      .finally(() => {
        if (!cancelled) pending.current = false
      })
    return () => {
      cancelled = true
      pending.current = false
    }
  }, [repo, limit, requestKey])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!repo) return
    const check = async () => {
      if (document.hidden || pending.current) return
      try {
        const fingerprint = await fetchFingerprint(repo)
        if (fingerprint !== repoCache.get(repo)?.data.fingerprint) reload()
      } catch {
        // Transient failure: the next tick retries
      }
    }
    const timer = window.setInterval(check, POLL_MS)
    window.addEventListener("focus", check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", check)
    }
  }, [repo, reload])

  const current = done?.key === requestKey ? done : null
  return {
    data: (repo && repoCache.get(repo)?.data) || null,
    error: current?.error,
    loading: Boolean(repo) && !current,
    reload,
  }
}

// Commits are immutable: cache their details for the whole session
const commitCache = new Map<string, CommitDetail>()

export function useCommitDetail(repo: string | null, hash: string | null) {
  const key = repo && hash ? `${repo}\0${hash}` : null
  const [result, setResult] = useState<{
    key: string
    detail?: CommitDetail
    error?: string
  } | null>(null)

  useEffect(() => {
    if (!key || !repo || !hash || commitCache.has(key)) return
    let cancelled = false
    fetchCommit(repo, hash).then(
      (detail) => {
        commitCache.set(key, detail)
        if (!cancelled) setResult({ key, detail })
      },
      (e) => {
        if (!cancelled) setResult({ key, error: errorMessage(e) })
      }
    )
    return () => {
      cancelled = true
    }
  }, [key, repo, hash])

  const current = result?.key === key ? result : null
  return {
    detail: (key && commitCache.get(key)) || current?.detail,
    error: current?.error,
  }
}

// Work-tree diffs are refetched when `version` (the repo fingerprint) changes;
// the previous text stays visible meanwhile to avoid flicker
export function useDiffText(
  repo: string | null,
  target: DiffTarget | null,
  version: string
) {
  const targetKey = repo && target ? JSON.stringify([repo, target]) : null
  const key =
    targetKey && target?.kind === "work"
      ? `${targetKey}\0${version}`
      : targetKey
  const [result, setResult] = useState<{
    targetKey: string
    key: string
    text?: string
    error?: string
  } | null>(null)

  useEffect(() => {
    if (!key || !targetKey || !repo || !target) return
    let cancelled = false
    fetchDiff(repo, target).then(
      (text) => {
        if (!cancelled) setResult({ targetKey, key, text })
      },
      (e) => {
        if (!cancelled) setResult({ targetKey, key, error: errorMessage(e) })
      }
    )
    return () => {
      cancelled = true
    }
  }, [key, targetKey, repo, target])

  const shown = result?.targetKey === targetKey ? result : null
  return { text: shown?.text, error: shown?.error, loading: shown?.key !== key }
}

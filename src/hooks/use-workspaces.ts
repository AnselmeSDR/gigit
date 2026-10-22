import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  deleteWorkspace,
  errorMessage,
  fetchSummaries,
  fetchWorkspaceRepos,
  fetchWorkspaces,
  saveWorkspace,
} from "@/lib/api"
import type { RepoSummary, Workspace, WorkspaceDraft } from "@/lib/types"

const RESCAN_MS = 30_000
const SUMMARY_MS = 30_000
const SUMMARY_MIN_GAP_MS = 5_000

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)

  useEffect(() => {
    fetchWorkspaces().then(setWorkspaces, (e) => {
      toast.error(errorMessage(e))
      setWorkspaces([])
    })
  }, [])

  const save = useCallback(async (draft: WorkspaceDraft) => {
    const saved = await saveWorkspace(draft)
    setWorkspaces((list) => {
      const others = (list ?? []).filter((w) => w.id !== saved.id)
      return draft.id
        ? (list ?? []).map((w) => (w.id === saved.id ? saved : w))
        : [...others, saved]
    })
    return saved
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteWorkspace(id)
    setWorkspaces((list) => (list ?? []).filter((w) => w.id !== id))
  }, [])

  return { workspaces, save, remove }
}

// Repositories found in the workspace folders (hidden ones included),
// rescanned when the window regains focus so new modules show up by themselves
export function useWorkspaceRepos(workspace: Workspace | null) {
  const id = workspace?.id ?? null
  const key = workspace ? JSON.stringify([id, workspace.folders]) : null
  const [result, setResult] = useState<{
    key: string
    repos: string[]
  } | null>(null)
  const [tick, setTick] = useState(0)
  const lastScan = useRef(0)

  useEffect(() => {
    if (!key || !id) return
    let cancelled = false
    lastScan.current = Date.now()
    fetchWorkspaceRepos(id).then(
      ({ repos, missing }) => {
        if (cancelled) return
        setResult({ key, repos })
        if (missing.length) toast.warning(`Dossier introuvable : ${missing[0]}`)
      },
      (e) => {
        if (!cancelled) toast.error(errorMessage(e))
      }
    )
    return () => {
      cancelled = true
    }
  }, [key, id, tick])

  const rescan = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!key) return
    const onFocus = () => {
      if (Date.now() - lastScan.current > RESCAN_MS) rescan()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [key, rescan])

  return { repos: result?.key === key ? result.repos : null, rescan }
}

// Branch / dirty state of many repositories, refreshed periodically
export function useSummaries(repos: string[]) {
  const key = repos.join("\0")
  const [summaries, setSummaries] = useState<Record<string, RepoSummary>>({})
  const [tick, setTick] = useState(0)
  const lastFetch = useRef(0)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    lastFetch.current = Date.now()
    fetchSummaries(key.split("\0")).then(
      (next) => {
        if (!cancelled) setSummaries((prev) => ({ ...prev, ...next }))
      },
      () => {
        // Transient failure: the next refresh retries
      }
    )
    return () => {
      cancelled = true
    }
  }, [key, tick])

  useEffect(() => {
    if (!key) return
    const refresh = () => {
      if (document.hidden) return
      if (Date.now() - lastFetch.current < SUMMARY_MIN_GAP_MS) return
      setTick((t) => t + 1)
    }
    const timer = window.setInterval(refresh, SUMMARY_MS)
    window.addEventListener("focus", refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [key])

  return summaries
}

import type {
  CommitDetail,
  DiffTarget,
  RepoData,
  RepoSummary,
  ScanResult,
  Workspace,
  WorkspaceDraft,
} from "@/lib/types"

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  body?: unknown
) {
  const res = await fetch(url, {
    method,
    headers: {
      "X-Gigit": "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data as T
}

const get = <T>(route: string, params: Record<string, string>) =>
  request<T>("GET", `/api/${route}?${new URLSearchParams(params)}`)

export const fetchRecent = () =>
  request<{ recent: string[] }>("GET", "/api/recent").then((r) => r.recent)

export const openRepo = (path: string) =>
  request<{ root: string }>("POST", "/api/open", { path }).then((r) => r.root)

export const pickFolder = () =>
  request<{ path: string | null }>("POST", "/api/pick", {}).then((r) => r.path)

export const scanFolder = (path: string) => get<ScanResult>("scan", { path })

export const fetchWorkspaces = () =>
  request<{ workspaces: Workspace[] }>("GET", "/api/workspaces").then(
    (r) => r.workspaces
  )

export const saveWorkspace = (draft: WorkspaceDraft) =>
  request<{ workspace: Workspace }>(
    draft.id ? "PUT" : "POST",
    "/api/workspaces",
    draft
  ).then((r) => r.workspace)

export const deleteWorkspace = (id: string) =>
  request("DELETE", `/api/workspaces?${new URLSearchParams({ id })}`)

export const fetchWorkspaceRepos = (workspace: string) =>
  get<{ repos: string[]; missing: string[] }>("repos", { workspace })

export const fetchSummaries = (repos: string[]) =>
  request<{ summaries: Record<string, RepoSummary> }>(
    "POST",
    "/api/summaries",
    { repos }
  ).then((r) => r.summaries)

export const fetchRepo = (repo: string, limit: number) =>
  get<RepoData>("repo", { repo, limit: String(limit) })

export const fetchFingerprint = (repo: string) =>
  get<{ fingerprint: string }>("fingerprint", { repo }).then(
    (r) => r.fingerprint
  )

export const fetchCommit = (repo: string, hash: string) =>
  get<CommitDetail>("commit", { repo, hash })

export function fetchDiff(repo: string, target: DiffTarget) {
  const orig = target.orig ?? ""
  const req =
    target.kind === "commit"
      ? get<{ diff: string }>("diff", {
          repo,
          hash: target.hash,
          path: target.path,
          orig,
        })
      : get<{ diff: string }>("wdiff", {
          repo,
          path: target.path,
          orig,
          mode: target.mode,
        })
  return req.then((r) => r.diff)
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e)

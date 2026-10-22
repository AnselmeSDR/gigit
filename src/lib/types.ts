export type Ref =
  | {
      type: "local"
      name: string
      target: string
      upstream: string | null
      ahead: number
      behind: number
      gone: boolean
    }
  | { type: "remote"; name: string; remote: string; target: string }
  | { type: "tag"; name: string; target: string }

export type Stash = { ref: string; hash: string; message: string; time: number }

export type StatusEntry = { path: string; orig?: string; x: string; y: string }

export type LogCommit = {
  hash: string
  parents: string[]
  author: string
  email: string
  time: number
  subject: string
}

export type RepoOp = "merge" | "rebase" | "cherry-pick" | "revert"

export type RepoData = {
  root: string
  name: string
  head: string | null
  branch: string | null
  op: RepoOp | null
  remotes: string[]
  refs: Ref[]
  stashes: Stash[]
  status: StatusEntry[]
  log: LogCommit[]
  fingerprint: string
}

export type CommitFile = {
  status: string
  path: string
  orig?: string
  add: number | null
  del: number | null
}

export type CommitDetail = {
  hash: string
  parents: string[]
  author: string
  email: string
  time: number
  committer: string
  committerEmail: string
  commitTime: number
  message: string
  files: CommitFile[]
}

export type WipList = "conflicts" | "staged" | "unstaged"

export type WipFile = {
  path: string
  orig?: string
  status: string
  untracked?: boolean
}

export type DiffTarget =
  | {
      kind: "commit"
      hash: string
      path: string
      orig?: string
      status: string
    }
  | {
      kind: "work"
      list: WipList
      path: string
      orig?: string
      mode: "staged" | "unstaged" | "untracked"
      status: string
    }

export type Workspace = {
  id: string
  name: string
  folders: string[]
  // Detected repositories the user chose not to list
  hidden: string[]
}

export type WorkspaceDraft = Omit<Workspace, "id"> & { id?: string }

export type RepoSummary = {
  branch: string | null
  ahead: number
  behind: number
  dirty: boolean
  op: RepoOp | null
  error?: string
}

export type ScanResult = { folder: string; repos: string[]; truncated: boolean }

// Graph row item: a commit or the pseudo "work in progress" commit
export type GraphItem = LogCommit & { wip?: boolean }

export const WIP = "WIP"

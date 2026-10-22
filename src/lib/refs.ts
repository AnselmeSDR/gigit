import type { GraphItem, RepoData } from "@/lib/types"

export type RefPill = {
  kind: "local" | "remote" | "tag" | "head"
  name: string
  // Local branch whose upstream points at the same commit
  synced?: boolean
  current?: boolean
}

// Labels to show next to each commit, current branch first
export function buildPills(data: RepoData) {
  const byHash = new Map<string, RefPill[]>()
  const add = (hash: string, pill: RefPill) => {
    const list = byHash.get(hash)
    if (list) list.push(pill)
    else byHash.set(hash, [pill])
  }
  const remoteTargets = new Map<string, string>()
  for (const r of data.refs)
    if (r.type === "remote") remoteTargets.set(r.name, r.target)

  const merged = new Set<string>()
  for (const r of data.refs) {
    if (r.type !== "local") continue
    const synced =
      Boolean(r.upstream) && remoteTargets.get(r.upstream!) === r.target
    if (synced) merged.add(r.upstream!)
    add(r.target, {
      kind: "local",
      name: r.name,
      synced,
      current: r.name === data.branch,
    })
  }
  for (const r of data.refs) {
    if (r.type === "remote" && !merged.has(r.name))
      add(r.target, { kind: "remote", name: r.name })
  }
  for (const r of data.refs)
    if (r.type === "tag") add(r.target, { kind: "tag", name: r.name })
  if (!data.branch && data.head) add(data.head, { kind: "head", name: "HEAD" })
  for (const list of byHash.values())
    list.sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)))
  return byHash
}

// Indexes of the rows matching a search query (message, author, SHA or ref name)
export function searchItems(
  items: GraphItem[],
  pills: Map<string, RefPill[]>,
  query: string
) {
  const q = query.toLowerCase()
  const matches: number[] = []
  items.forEach((c, i) => {
    if (c.wip) return
    const hit =
      c.hash.startsWith(q) ||
      c.subject.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (pills.get(c.hash) ?? []).some((p) => p.name.toLowerCase().includes(q))
    if (hit) matches.push(i)
  })
  return matches
}

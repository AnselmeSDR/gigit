import { useMemo, type ReactNode } from "react"
import {
  ChevronRight,
  CircleAlert,
  FolderGit2,
  TriangleAlert,
} from "lucide-react"
import { cn } from "cn"

import { useStoredState } from "@/hooks/use-stored-state"
import { basename, plural, shortLabels } from "@/lib/format"
import type { RepoSummary } from "@/lib/types"

const COLLAPSED_KEY = "gigit.repos.collapsed"
const INDENT = 14

type RepoNode = { root: string; label: string; children: RepoNode[] }

// Nests each repository under the closest repository that contains it
// (a Dolibarr checkout and its modules)
function buildTree(repos: string[]) {
  const nodes = new Map<string, RepoNode>()
  const top: RepoNode[] = []
  for (const root of [...repos].sort((a, b) => a.length - b.length)) {
    const node: RepoNode = { root, label: basename(root), children: [] }
    let parent: RepoNode | undefined
    for (
      let dir = root.slice(0, root.lastIndexOf("/"));
      dir && !parent;
      dir = dir.slice(0, dir.lastIndexOf("/"))
    ) {
      parent = nodes.get(dir)
    }
    nodes.set(root, node)
    ;(parent ? parent.children : top).push(node)
  }
  const finish = (list: RepoNode[]) => {
    const labels = shortLabels(list.map((n) => n.root))
    for (const n of list) {
      n.label = labels.get(n.root) ?? n.label
      finish(n.children)
    }
    list.sort((a, b) =>
      a.label.localeCompare(b.label, "fr", {
        numeric: true,
        sensitivity: "base",
      })
    )
  }
  finish(top)
  return top
}

function Indicators({ summary }: { summary?: RepoSummary }) {
  if (!summary) return null
  if (summary.error) {
    return (
      <span title={summary.error}>
        <CircleAlert className="text-git-del" />
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
      {summary.op && (
        <span title={`${summary.op} en cours`}>
          <TriangleAlert className="text-git-mod" />
        </span>
      )}
      {summary.ahead > 0 && (
        <span title={`${plural(summary.ahead, "commit")} à pousser`}>
          ↑{summary.ahead}
        </span>
      )}
      {summary.behind > 0 && (
        <span title={`${plural(summary.behind, "commit")} à tirer`}>
          ↓{summary.behind}
        </span>
      )}
      {summary.dirty && (
        <span
          className="size-1.5 rounded-full bg-git-mod"
          title="Modifications non commitées"
        />
      )}
    </span>
  )
}

export function RepoList({
  repos,
  summaries,
  active,
  filter,
  onOpen,
}: {
  repos: string[]
  summaries: Record<string, RepoSummary>
  active: string | null
  filter: string
  onOpen: (root: string) => void
}) {
  const [collapsed, setCollapsed] = useStoredState<string[]>(COLLAPSED_KEY, [])
  const tree = useMemo(() => buildTree(repos), [repos])
  const q = filter.trim().toLowerCase()

  const row = (node: RepoNode, depth: number, hasChildren: boolean) => {
    const summary = summaries[node.root]
    const isCollapsed = collapsed.includes(node.root)
    return (
      <div
        className={cn(
          "flex min-w-0 items-center hover:bg-sidebar-accent [&_svg]:size-3.5 [&_svg]:shrink-0",
          node.root === active && "bg-sidebar-accent"
        )}
        style={{ paddingLeft: 8 + depth * INDENT }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() =>
              setCollapsed((list) =>
                isCollapsed
                  ? list.filter((r) => r !== node.root)
                  : [...list, node.root]
              )
            }
            title={isCollapsed ? "Déplier" : "Replier"}
          >
            <ChevronRight
              className={cn(
                "transition-transform",
                !isCollapsed && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onOpen(node.root)}
          title={
            summary?.branch
              ? `${node.root}\nBranche : ${summary.branch}`
              : node.root
          }
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 py-1 pr-3 text-left text-[13px]",
            node.root === active
              ? "font-semibold text-foreground"
              : "text-sidebar-foreground/85"
          )}
        >
          <FolderGit2 className="text-muted-foreground" />
          <span
            className="min-w-0 shrink-0 truncate"
            style={{ maxWidth: "70%" }}
          >
            {node.label}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-normal text-muted-foreground">
            {summary?.branch ?? ""}
          </span>
          <Indicators summary={summary} />
        </button>
      </div>
    )
  }

  if (!repos.length) {
    return <p className="py-1 pl-7 text-xs text-muted-foreground">Aucun</p>
  }

  // Filtering flattens the tree
  if (q) {
    const hits = repos.filter((r) =>
      r.toLowerCase().slice(r.lastIndexOf("/")).includes(q)
    )
    const labels = shortLabels(hits)
    return hits.length ? (
      <>
        {hits.map((root) => (
          <div key={root}>
            {row(
              { root, label: labels.get(root) ?? root, children: [] },
              0,
              false
            )}
          </div>
        ))}
      </>
    ) : (
      <p className="py-1 pl-7 text-xs text-muted-foreground">Aucun</p>
    )
  }

  const render = (list: RepoNode[], depth: number): ReactNode =>
    list.map((node) => (
      <div key={node.root}>
        {row(node, depth, node.children.length > 0)}
        {node.children.length > 0 &&
          !collapsed.includes(node.root) &&
          render(node.children, depth + 1)}
      </div>
    ))

  return <>{render(tree, 0)}</>
}

import type { RefObject } from "react"
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
  Search,
} from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { plural, shortHash } from "@/lib/format"
import type { RepoData } from "@/lib/types"

function BranchInfo({ data }: { data: RepoData }) {
  if (!data.head)
    return <span className="text-sm text-muted-foreground">Aucun commit</span>
  if (!data.branch) {
    return (
      <span className="flex items-center gap-1.5 text-sm [&_svg]:size-4">
        <GitCommitHorizontal />
        HEAD détachée ·{" "}
        <span className="font-mono">{shortHash(data.head)}</span>
      </span>
    )
  }
  const current = data.refs.find(
    (r) => r.type === "local" && r.name === data.branch
  )
  const upstream = current?.type === "local" ? current : null
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm [&_svg]:size-4 [&_svg]:shrink-0">
      <GitBranch />
      <span className="truncate font-medium">{data.branch}</span>
      {upstream?.upstream && (
        <span className="truncate text-muted-foreground">
          → {upstream.upstream}
        </span>
      )}
      {upstream && upstream.ahead > 0 && (
        <span
          className="font-mono text-xs text-muted-foreground"
          title={`${plural(upstream.ahead, "commit")} à pousser`}
        >
          ↑{upstream.ahead}
        </span>
      )}
      {upstream && upstream.behind > 0 && (
        <span
          className="font-mono text-xs text-muted-foreground"
          title={`${plural(upstream.behind, "commit")} à tirer`}
        >
          ↓{upstream.behind}
        </span>
      )}
    </span>
  )
}

// Second header row: current branch, commit search, refresh
export function RepoToolbar({
  data,
  search,
  matchCount,
  loading,
  searchRef,
  onSearch,
  onJump,
  onReload,
}: {
  data: RepoData | null
  search: string
  matchCount: number | null
  loading: boolean
  searchRef: RefObject<HTMLInputElement | null>
  onSearch: (value: string) => void
  onJump: (direction: 1 | -1) => void
  onReload: () => void
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <div className="min-w-0 flex-1">{data && <BranchInfo data={data} />}</div>
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onJump(e.shiftKey ? -1 : 1)
            if (e.key === "Escape") {
              onSearch("")
              e.currentTarget.blur()
            }
          }}
          placeholder="Message, auteur, SHA, branche"
          className={cn("h-8 w-72 pl-7 text-xs", matchCount != null && "pr-24")}
          spellCheck={false}
        />
        {matchCount != null ? (
          <div className="absolute right-1 flex items-center gap-0.5 text-xs text-muted-foreground">
            <span className="px-1 tabular-nums">{matchCount}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onJump(-1)}
              title="Précédent (Maj+Entrée)"
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onJump(1)}
              title="Suivant (Entrée)"
            >
              <ChevronDown />
            </Button>
          </div>
        ) : (
          <Kbd className="absolute right-2">/</Kbd>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onReload}
        title="Rafraîchir"
      >
        <RefreshCw className={cn(loading && "animate-spin")} />
      </Button>
    </div>
  )
}

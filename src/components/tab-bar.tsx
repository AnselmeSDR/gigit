import { useMemo } from "react"
import { X } from "lucide-react"
import { cn } from "cn"

import { OpenMenu } from "@/components/repo-picker"
import { Button } from "@/components/ui/button"
import { shortLabels } from "@/lib/format"
import type { RepoSummary } from "@/lib/types"

export function TabBar({
  tabs,
  active,
  summaries,
  onActivate,
  onClose,
  onOpen,
}: {
  tabs: string[]
  active: string | null
  summaries: Record<string, RepoSummary>
  onActivate: (root: string) => void
  onClose: (root: string) => void
  onOpen: (path: string) => void
}) {
  const labels = useMemo(() => shortLabels(tabs), [tabs])
  return (
    <div
      role="tablist"
      className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1 overflow-x-auto"
    >
      {tabs.map((root) => {
        const isActive = root === active
        return (
          <div
            key={root}
            role="tab"
            aria-selected={isActive}
            title={root}
            onClick={() => onActivate(root)}
            // Middle click closes, like a browser tab
            onAuxClick={(e) => e.button === 1 && onClose(root)}
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
            className={cn(
              "group flex h-7 max-w-56 shrink-0 cursor-default items-center gap-1.5 rounded-md pr-0.5 pl-2.5 text-[13px] select-none",
              isActive
                ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {summaries[root]?.dirty && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-git-mod"
                title="Modifications non commitées"
              />
            )}
            <span className="truncate">{labels.get(root)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Fermer l’onglet"
              className={cn(
                "size-5 opacity-0 group-hover:opacity-100",
                isActive && "opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation()
                onClose(root)
              }}
            >
              <X />
            </Button>
          </div>
        )
      })}
      <OpenMenu onOpen={onOpen} />
    </div>
  )
}

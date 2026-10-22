import { useMemo, useState, type ReactNode } from "react"
import {
  Archive,
  Check,
  ChevronRight,
  Cloud,
  FolderGit2,
  GitBranch,
  Laptop,
  Tag,
} from "lucide-react"
import { cn } from "cn"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { plural } from "@/lib/format"
import type { RepoData } from "@/lib/types"

const STORAGE_KEY = "gigit.sidebar.closed"

function readClosed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  } catch {
    return {}
  }
}

function Section({
  id,
  title,
  icon,
  count,
  children,
}: {
  id: string
  title: string
  icon: ReactNode
  count: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => !readClosed()[id])
  const toggle = (next: boolean) => {
    setOpen(next)
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...readClosed(), [id]: !next })
      )
    } catch {
      // Storage unavailable: state just won't persist
    }
  }
  return (
    <Collapsible open={open} onOpenChange={toggle} className="py-1">
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-3 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground [&_svg]:size-3.5">
        <ChevronRight className="transition-transform group-data-[state=open]:rotate-90" />
        {icon}
        <span>{title}</span>
        <span className="ml-auto font-normal">{count}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}

function Item({
  icon,
  label,
  extra,
  current,
  nested,
  onClick,
}: {
  icon: ReactNode
  label: string
  extra?: ReactNode
  current?: boolean
  nested?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 py-1 pr-3 text-left text-[13px] hover:bg-sidebar-accent [&_svg]:size-3.5 [&_svg]:shrink-0",
        nested ? "pl-10" : "pl-7",
        current ? "font-semibold text-foreground" : "text-sidebar-foreground/85"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {extra}
    </button>
  )
}

const Empty = () => (
  <p className="py-1 pl-7 text-xs text-muted-foreground">Aucun</p>
)

export function RefSidebar({
  data,
  repos,
  onSelect,
}: {
  data: RepoData | null
  // Workspace repositories, listed above the refs and sharing the filter
  repos?: { count: number; render: (filter: string) => ReactNode }
  onSelect: (hash: string) => void
}) {
  const [filter, setFilter] = useState("")
  const q = filter.trim().toLowerCase()
  const match = (name: string) => !q || name.toLowerCase().includes(q)

  const { locals, remotes, tags } = useMemo(() => {
    const refs = data?.refs ?? []
    return {
      locals: refs.filter((r) => r.type === "local"),
      remotes: refs.filter((r) => r.type === "remote"),
      tags: refs.filter((r) => r.type === "tag"),
    }
  }, [data])

  const shownLocals = locals.filter((r) => match(r.name))
  const shownRemotes = remotes.filter((r) => match(r.name))
  const shownTags = tags.filter((r) => match(r.name))
  const shownStashes = (data?.stashes ?? []).filter((s) => match(s.message))

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="p-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setFilter("")}
          placeholder={repos ? "Filtrer dépôts et refs" : "Filtrer les refs"}
          className="h-7 text-xs"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {repos && (
          <Section
            id="repos"
            title="Dépôts"
            icon={<FolderGit2 />}
            count={repos.count}
          >
            {repos.render(filter)}
          </Section>
        )}
        {data && (
          <>
            <Section
              id="local"
              title="Local"
              icon={<Laptop />}
              count={locals.length}
            >
              {shownLocals.length ? (
                shownLocals.map((r) => (
                  <Item
                    key={r.name}
                    icon={
                      r.name === data.branch ? (
                        <Check className="text-git-add" />
                      ) : (
                        <GitBranch />
                      )
                    }
                    label={r.name}
                    current={r.name === data.branch}
                    onClick={() => onSelect(r.target)}
                    extra={
                      <span className="flex shrink-0 gap-1 font-mono text-[11px] text-muted-foreground">
                        {r.gone && (
                          <span title="Branche distante supprimée">✕</span>
                        )}
                        {r.ahead > 0 && (
                          <span
                            title={`${plural(r.ahead, "commit")} à pousser`}
                          >
                            ↑{r.ahead}
                          </span>
                        )}
                        {r.behind > 0 && (
                          <span title={`${plural(r.behind, "commit")} à tirer`}>
                            ↓{r.behind}
                          </span>
                        )}
                      </span>
                    }
                  />
                ))
              ) : (
                <Empty />
              )}
            </Section>

            <Section
              id="remote"
              title="Remote"
              icon={<Cloud />}
              count={remotes.length}
            >
              {data.remotes.length ? (
                data.remotes.map((remote) => {
                  const list = shownRemotes.filter((r) => r.remote === remote)
                  return (
                    <div key={remote}>
                      <div className="flex items-center gap-2 py-1 pl-7 text-[13px] text-muted-foreground [&_svg]:size-3.5">
                        <Cloud />
                        {remote}
                      </div>
                      {list.map((r) => (
                        <Item
                          key={r.name}
                          nested
                          icon={<GitBranch />}
                          label={r.name.slice(remote.length + 1)}
                          onClick={() => onSelect(r.target)}
                        />
                      ))}
                    </div>
                  )
                })
              ) : (
                <Empty />
              )}
            </Section>

            <Section id="tags" title="Tags" icon={<Tag />} count={tags.length}>
              {shownTags.length ? (
                shownTags.map((r) => (
                  <Item
                    key={r.name}
                    icon={<Tag />}
                    label={r.name}
                    onClick={() => onSelect(r.target)}
                  />
                ))
              ) : (
                <Empty />
              )}
            </Section>

            <Section
              id="stashes"
              title="Stashes"
              icon={<Archive />}
              count={data.stashes.length}
            >
              {shownStashes.length ? (
                shownStashes.map((s) => (
                  <Item
                    key={s.ref}
                    icon={<Archive />}
                    label={s.message}
                    onClick={() => onSelect(s.hash)}
                    extra={
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {s.ref.replace("stash", "")}
                      </span>
                    }
                  />
                ))
              ) : (
                <Empty />
              )}
            </Section>
          </>
        )}
      </ScrollArea>
    </div>
  )
}

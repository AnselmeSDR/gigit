import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useDefaultLayout } from "react-resizable-panels"
import { CircleAlert, FolderGit2, Moon, Sun, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { CommitGraph, HEADER_H } from "@/components/commit-graph"
import { DetailsPanel } from "@/components/details-panel"
import { DiffView } from "@/components/diff-view"
import { RefSidebar } from "@/components/ref-sidebar"
import { RepoList } from "@/components/repo-list"
import { Welcome } from "@/components/repo-picker"
import { RepoToolbar } from "@/components/repo-toolbar"
import { TabBar } from "@/components/tab-bar"
import { useTheme } from "@/components/theme-provider"
import {
  FoundDialog,
  WorkspaceDialog,
  WorkspaceSwitcher,
} from "@/components/workspaces"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Separator } from "@/components/ui/separator"
import { useRepoData } from "@/hooks/use-repo"
import { useStoredState } from "@/hooks/use-stored-state"
import {
  useSummaries,
  useWorkspaceRepos,
  useWorkspaces,
} from "@/hooks/use-workspaces"
import { errorMessage, openRepo, scanFolder } from "@/lib/api"
import { basename, plural, splitStatus } from "@/lib/format"
import { ROW_H, computeGraph } from "@/lib/graph"
import { buildPills, searchItems, type RefPill } from "@/lib/refs"
import {
  WIP,
  type DiffTarget,
  type GraphItem,
  type RepoData,
  type RepoSummary,
  type ScanResult,
  type WorkspaceDraft,
} from "@/lib/types"

const PAGE_SIZE = 1000
// Tab group of repositories opened outside any workspace
const NO_WORKSPACE = "_"
const NAV_KEYS: Record<string, number> = {
  ArrowDown: 1,
  j: 1,
  ArrowUp: -1,
  k: -1,
}
const OP_LABELS = {
  merge: "Fusion",
  rebase: "Rebase",
  "cherry-pick": "Cherry-pick",
  revert: "Revert",
}

type TabGroup = { tabs: string[]; active: string | null }
// What each open repository remembers while another tab is shown
type RepoView = {
  selected: string | null
  diffTarget: DiffTarget | null
  search: string
  limit: number
}

const EMPTY_GROUP: TabGroup = { tabs: [], active: null }
const DEFAULT_VIEW: RepoView = {
  selected: null,
  diffTarget: null,
  search: "",
  limit: PAGE_SIZE,
}
const NEW_WORKSPACE: WorkspaceDraft = { name: "", folders: [], hidden: [] }

const notifyError = (e: unknown) => {
  toast.error(errorMessage(e))
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true'], [role='menu'], [role='dialog']"
      )
    )
  )
}

// Same shape as the polled summaries, but live from the open repository
function liveSummary(data: RepoData): RepoSummary {
  const current = data.refs.find(
    (r) => r.type === "local" && r.name === data.branch
  )
  const local = current?.type === "local" ? current : null
  return {
    branch: data.branch,
    ahead: local?.ahead ?? 0,
    behind: local?.behind ?? 0,
    dirty: data.status.length > 0,
    op: data.op,
  }
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const dark =
    theme === "dark" ||
    (theme === "system" && document.documentElement.classList.contains("dark"))
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="shrink-0"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title="Changer de thème (d)"
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}

function Placeholder({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {children}
      </EmptyHeader>
    </Empty>
  )
}

export function App() {
  const { workspaces, save, remove } = useWorkspaces()
  const [storedWorkspace, setStoredWorkspace] = useStoredState<string | null>(
    "gigit.workspace",
    null
  )
  const [groups, setGroups] = useStoredState<Record<string, TabGroup>>(
    "gigit.tabs",
    {}
  )
  const [views, setViews] = useState<Record<string, RepoView>>({})
  const [found, setFound] = useState<ScanResult | null>(null)
  const [editing, setEditing] = useState<WorkspaceDraft | null>(null)
  const graphScrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollTops = useRef(new Map<string, number>())
  const outerLayout = useDefaultLayout({
    id: "gigit-outer",
    storage: localStorage,
  })
  const repoLayout = useDefaultLayout({
    id: "gigit-repo",
    storage: localStorage,
  })

  // A deleted workspace falls back on "no workspace" once the list is known
  const workspace = workspaces?.find((w) => w.id === storedWorkspace) ?? null
  const workspaceId = workspaces ? (workspace?.id ?? null) : storedWorkspace
  const groupKey = workspaceId ?? NO_WORKSPACE
  const { tabs, active } = groups[groupKey] ?? EMPTY_GROUP

  const { selected, diffTarget, search, limit } =
    (active && views[active]) || DEFAULT_VIEW
  const { data, error, loading, reload } = useRepoData(active, limit)
  const { repos: detected, rescan } = useWorkspaceRepos(workspace)
  const listed = useMemo(
    () => detected?.filter((r) => !workspace?.hidden.includes(r)) ?? [],
    [detected, workspace]
  )
  const summaryRepos = useMemo(
    () => [...new Set([...listed, ...tabs])].sort(),
    [listed, tabs]
  )
  const polled = useSummaries(summaryRepos)
  const summaries = useMemo(
    () =>
      data && active ? { ...polled, [active]: liveSummary(data) } : polled,
    [polled, data, active]
  )

  // ---------- tabs & workspaces ----------

  const updateGroup = useCallback(
    (change: (group: TabGroup) => TabGroup) =>
      setGroups((all) => ({
        ...all,
        [groupKey]: change(all[groupKey] ?? EMPTY_GROUP),
      })),
    [groupKey, setGroups]
  )

  const openTab = useCallback(
    (root: string) =>
      updateGroup((g) => ({
        tabs: g.tabs.includes(root) ? g.tabs : [...g.tabs, root],
        active: root,
      })),
    [updateGroup]
  )

  const closeTab = useCallback(
    (root: string) =>
      updateGroup((g) => {
        const index = g.tabs.indexOf(root)
        const rest = g.tabs.filter((t) => t !== root)
        const next = rest[Math.min(index, rest.length - 1)] ?? null
        return { tabs: rest, active: g.active === root ? next : g.active }
      }),
    [updateGroup]
  )

  const openRepoTab = useCallback(
    (path: string) => openRepo(path).then(openTab, notifyError),
    [openTab]
  )

  // A folder with several repositories asks what to do with them
  const openPath = useCallback(
    (path: string) =>
      scanFolder(path)
        .then((result) => {
          if (result.repos.length === 1) return openRepoTab(result.repos[0])
          if (!result.repos.length)
            throw new Error(`Aucun dépôt Git dans ${result.folder}`)
          setFound(result)
        })
        .catch(notifyError),
    [openRepoTab]
  )

  // `gigit <path>` opens the browser on ?open=<path>
  useEffect(() => {
    const path = new URLSearchParams(location.search).get("open")
    if (!path) return
    history.replaceState(null, "", location.pathname)
    openPath(path)
  }, [openPath])

  const switchWorkspace = (id: string | null) => {
    setStoredWorkspace(id)
    setFound(null)
  }

  const saveWorkspace = (draft: WorkspaceDraft) =>
    save(draft).then((saved) => {
      setEditing(null)
      setStoredWorkspace(saved.id)
    })

  const deleteWorkspace = (id: string) =>
    remove(id).then(() => {
      setEditing(null)
      setGroups((all) =>
        Object.fromEntries(Object.entries(all).filter(([key]) => key !== id))
      )
    })

  // ---------- per-repository view ----------

  const patchView = useCallback(
    (change: (view: RepoView) => Partial<RepoView>) => {
      if (!active) return
      setViews((all) => {
        const view = all[active] ?? DEFAULT_VIEW
        return { ...all, [active]: { ...view, ...change(view) } }
      })
    },
    [active]
  )

  const showDiff = useCallback(
    (target: DiffTarget | null) => patchView(() => ({ diffTarget: target })),
    [patchView]
  )

  const wip = useMemo(() => splitStatus(data?.status ?? []), [data])
  const items = useMemo<GraphItem[]>(() => {
    if (!data) return []
    if (!data.status.length) return data.log
    const wipItem = {
      hash: WIP,
      parents: data.head ? [data.head] : [],
      wip: true,
      author: "",
      email: "",
      time: 0,
      subject: "",
    }
    return [wipItem, ...data.log]
  }, [data])
  const layout = useMemo(() => computeGraph(items), [items])
  const pills = useMemo(
    () => (data ? buildPills(data) : new Map<string, RefPill[]>()),
    [data]
  )
  const rowIndex = useMemo(
    () => new Map(items.map((c, i) => [c.hash, i] as const)),
    [items]
  )
  const query = search.trim()
  const matchList = useMemo(
    () => (query ? searchItems(items, pills, query) : null),
    [items, pills, query]
  )
  const matches = useMemo(
    () => (matchList ? new Set(matchList) : null),
    [matchList]
  )

  // The WIP row disappears once everything is committed: fall back on HEAD
  const current =
    selected === WIP && !data?.status.length ? (data?.head ?? null) : selected
  // A work-tree diff closes by itself when its file leaves its list
  const diff =
    diffTarget &&
    (diffTarget.kind === "commit" ||
      wip[diffTarget.list].some((f) => f.path === diffTarget.path))
      ? diffTarget
      : null

  // Each tab keeps its own scroll position in the graph
  const hasGraph = Boolean(data)
  useLayoutEffect(() => {
    const el = graphScrollRef.current
    if (!el || !active) return
    el.scrollTop = scrollTops.current.get(active) ?? 0
    const onScroll = () => scrollTops.current.set(active, el.scrollTop)
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [active, hasGraph])

  // ---------- navigation ----------

  const scrollToRow = useCallback(
    (index: number, mode: "nearest" | "center") => {
      const el = graphScrollRef.current
      if (!el) return
      const top = index * ROW_H
      const visible = el.clientHeight - HEADER_H
      if (mode === "center") el.scrollTop = top - visible / 2 + ROW_H / 2
      else if (top < el.scrollTop) el.scrollTop = top
      else if (top + ROW_H > el.scrollTop + visible)
        el.scrollTop = top + ROW_H - visible
    },
    []
  )

  const select = useCallback(
    (hash: string, scroll?: "nearest" | "center") => {
      patchView(({ diffTarget: d }) => ({
        selected: hash,
        diffTarget:
          d && (d.kind === "work" ? hash === WIP : d.hash === hash) ? d : null,
      }))
      if (!scroll) return
      const index = rowIndex.get(hash)
      if (index == null) {
        toast.info("Commit hors de la plage chargée")
        return
      }
      scrollToRow(index, scroll)
    },
    [patchView, rowIndex, scrollToRow]
  )

  const jumpToMatch = (direction: 1 | -1) => {
    if (!matchList?.length) return
    const from = current ? (rowIndex.get(current) ?? -1) : -1
    const next =
      direction > 0
        ? (matchList.find((i) => i > from) ?? matchList[0])
        : ([...matchList].reverse().find((i) => i < from) ??
          matchList[matchList.length - 1])
    select(items[next].hash, "center")
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && diffTarget && !isEditable(e.target)) {
        showDiff(null)
        return
      }
      if (
        isEditable(e.target) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        !items.length
      )
        return
      if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      const delta = NAV_KEYS[e.key]
      if (!delta || diffTarget) return
      e.preventDefault()
      const from = current ? (rowIndex.get(current) ?? -1) : -1
      const next = Math.min(Math.max(from + delta, 0), items.length - 1)
      select(items[next].hash, "nearest")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [items, rowIndex, current, diffTarget, select, showDiff])

  // ---------- render ----------

  const conflicts = wip.conflicts.length
  const showWelcome = workspaces !== null && !workspace && !tabs.length

  let main: ReactNode
  if (!active) {
    main = workspace ? (
      <Placeholder icon={<FolderGit2 />} title="Aucun dépôt ouvert">
        <EmptyDescription>
          Choisis un dépôt dans la liste à gauche.
        </EmptyDescription>
      </Placeholder>
    ) : null
  } else if (!data) {
    main = error ? (
      <Placeholder icon={<CircleAlert />} title="Impossible d’ouvrir le dépôt">
        <EmptyDescription className="break-all">{error}</EmptyDescription>
        <EmptyContent>
          <Button variant="outline" onClick={() => closeTab(active)}>
            Fermer l’onglet
          </Button>
        </EmptyContent>
      </Placeholder>
    ) : (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Chargement de {basename(active)}…
      </div>
    )
  } else {
    main = (
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full"
        defaultLayout={repoLayout.defaultLayout}
        onLayoutChanged={repoLayout.onLayoutChanged}
      >
        <ResizablePanel id="graph" minSize={400}>
          <div className="relative h-full">
            <CommitGraph
              items={items}
              layout={layout}
              pills={pills}
              head={data.head}
              status={data.status}
              selected={current}
              matches={matches}
              canLoadMore={data.log.length >= limit}
              scrollRef={graphScrollRef}
              onSelect={select}
              onLoadMore={() =>
                patchView((v) => ({ limit: v.limit + PAGE_SIZE }))
              }
            />
            {diff && (
              <div className="absolute inset-0 z-30">
                <DiffView
                  repo={active}
                  target={diff}
                  version={data.fingerprint}
                  onClose={() => showDiff(null)}
                />
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          id="details"
          defaultSize={380}
          minSize={280}
          maxSize={720}
        >
          <DetailsPanel
            repo={active}
            selected={current}
            wip={current === WIP ? wip : null}
            diff={diff}
            onOpenDiff={showDiff}
            onSelect={(hash) => select(hash, "center")}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    )
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-sidebar px-2">
        <WorkspaceSwitcher
          workspaces={workspaces ?? []}
          current={workspace}
          onSwitch={switchWorkspace}
          onCreate={() => setEditing(NEW_WORKSPACE)}
          onEdit={() => workspace && setEditing(workspace)}
          onRescan={rescan}
        />
        <Separator orientation="vertical" className="h-5!" />
        <TabBar
          tabs={tabs}
          active={active}
          summaries={summaries}
          onActivate={openTab}
          onClose={closeTab}
          onOpen={openPath}
        />
        <ThemeToggle />
      </header>

      {active && (
        <RepoToolbar
          data={data}
          search={search}
          matchCount={query ? (matchList?.length ?? 0) : null}
          loading={loading}
          searchRef={searchRef}
          onSearch={(value) => patchView(() => ({ search: value }))}
          onJump={jumpToMatch}
          onReload={reload}
        />
      )}

      {data?.op && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-git-mod/10 px-3 py-1.5 text-sm text-amber-600 dark:text-git-mod [&_svg]:size-4">
          <TriangleAlert />
          <span>
            <b>{OP_LABELS[data.op]} en cours</b>
            {" — "}
            {conflicts
              ? `${plural(conflicts, "conflit")} à résoudre`
              : "aucun conflit restant"}
          </span>
        </div>
      )}

      {showWelcome ? (
        <Welcome
          workspaces={workspaces}
          onOpen={openPath}
          onSwitchWorkspace={switchWorkspace}
          onCreateWorkspace={() => setEditing(NEW_WORKSPACE)}
        />
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={outerLayout.defaultLayout}
          onLayoutChanged={outerLayout.onLayoutChanged}
        >
          <ResizablePanel
            id="sidebar"
            defaultSize={260}
            minSize={160}
            maxSize={480}
          >
            <RefSidebar
              data={data}
              repos={
                workspace
                  ? {
                      count: listed.length,
                      render: (filter) => (
                        <RepoList
                          repos={listed}
                          summaries={summaries}
                          active={active}
                          filter={filter}
                          onOpen={openRepoTab}
                        />
                      ),
                    }
                  : undefined
              }
              onSelect={(hash) => select(hash, "center")}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="main" minSize={480}>
            {main}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {found && (
        <FoundDialog
          found={found}
          current={workspace}
          owner={
            workspaces?.find((w) => w.folders.includes(found.folder)) ?? null
          }
          onOpenRepo={(root) => {
            setFound(null)
            openRepoTab(root)
          }}
          onCreate={() => {
            setFound(null)
            setEditing({
              name: basename(found.folder),
              folders: [found.folder],
              hidden: [],
            })
          }}
          onAddToCurrent={() => {
            if (!workspace) return
            save({
              ...workspace,
              folders: [...workspace.folders, found.folder],
            }).then(() => {
              setFound(null)
              toast.success(`Dossier ajouté à « ${workspace.name} »`)
            }, notifyError)
          }}
          onSwitch={switchWorkspace}
          onClose={() => setFound(null)}
        />
      )}

      {editing && (
        <WorkspaceDialog
          key={editing.id ?? "new"}
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={saveWorkspace}
          onDelete={deleteWorkspace}
        />
      )}
    </div>
  )
}

export default App

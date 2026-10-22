import { useEffect, useState } from "react"
import {
  Check,
  ChevronsUpDown,
  FolderGit2,
  FolderOpen,
  Layers,
  Plus,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { pick } from "@/components/repo-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { errorMessage, scanFolder } from "@/lib/api"
import { basename, plural, relativePath } from "@/lib/format"
import type { ScanResult, Workspace, WorkspaceDraft } from "@/lib/types"

export function WorkspaceSwitcher({
  workspaces,
  current,
  onSwitch,
  onCreate,
  onEdit,
  onRescan,
}: {
  workspaces: Workspace[]
  current: Workspace | null
  onSwitch: (id: string | null) => void
  onCreate: () => void
  onEdit: () => void
  onRescan: () => void
}) {
  const mark = (on: boolean) =>
    on ? <Check /> : <span className="size-4 shrink-0" />
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="max-w-56 shrink-0 gap-2 font-semibold"
        >
          <Layers />
          <span className="truncate">{current?.name ?? "Sans workspace"}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => onSwitch(w.id)}>
            {mark(current?.id === w.id)}
            <span className="truncate">{w.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => onSwitch(null)}>
          {mark(!current)}
          <span className="text-muted-foreground">Sans workspace</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCreate}>
          <Plus />
          Nouveau workspace…
        </DropdownMenuItem>
        {current && (
          <>
            <DropdownMenuItem onSelect={onEdit}>
              <Settings2 />
              <span className="truncate">Modifier « {current.name} »…</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRescan}>
              <RefreshCw />
              Rescanner les dossiers
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RepoPath({ root, folder }: { root: string; folder?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
      <FolderGit2 />
      <span className="truncate font-mono text-xs" title={root}>
        {folder ? relativePath(root, folder) : root}
      </span>
    </span>
  )
}

// Create or edit a workspace: name, folders, and which detected repositories
// to list
export function WorkspaceDialog({
  draft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: WorkspaceDraft
  onClose: () => void
  onSave: (draft: WorkspaceDraft) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}) {
  const [name, setName] = useState(draft.name)
  const [folders, setFolders] = useState(draft.folders)
  const [hidden, setHidden] = useState(draft.hidden)
  const [scans, setScans] = useState<Record<string, string[] | "error">>({})
  const [pathInput, setPathInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [initialFolders] = useState(draft.folders)

  useEffect(() => {
    let cancelled = false
    for (const folder of initialFolders) {
      scanFolder(folder).then(
        (r) => !cancelled && setScans((s) => ({ ...s, [folder]: r.repos })),
        () => !cancelled && setScans((s) => ({ ...s, [folder]: "error" }))
      )
    }
    return () => {
      cancelled = true
    }
  }, [initialFolders])

  const addFolder = async (path: string) => {
    try {
      const { folder, repos } = await scanFolder(path)
      if (!repos.length) throw new Error(`Aucun dépôt Git dans ${folder}`)
      setScans((s) => ({ ...s, [folder]: repos }))
      setFolders((list) => (list.includes(folder) ? list : [...list, folder]))
      setPathInput("")
      if (!name.trim()) setName(basename(folder))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const rows = folders.flatMap((folder) => {
    const scan = scans[folder]
    return Array.isArray(scan) ? scan.map((root) => ({ root, folder })) : []
  })
  const unique = [...new Map(rows.map((r) => [r.root, r])).values()]
  const scanning = folders.some((f) => !scans[f])
  const shown = unique.filter((r) => !hidden.includes(r.root)).length

  const submit = async () => {
    setBusy(true)
    try {
      await onSave({ id: draft.id, name: name.trim(), folders, hidden })
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "Modifier le workspace" : "Nouveau workspace"}
          </DialogTitle>
          <DialogDescription>
            Les dépôts des dossiers sont détectés automatiquement, y compris
            ceux imbriqués et ceux ajoutés plus tard.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4">
          <Input
            autoFocus={!draft.id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom : Pro, Perso, Dolibarr v22…"
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Dossiers
            </span>
            {folders.map((folder) => (
              <div
                key={folder}
                className="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 py-1 pr-1 pl-2.5 [&_svg]:size-3.5"
              >
                <FolderOpen className="shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs"
                  title={folder}
                >
                  {folder}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {scans[folder] === "error"
                    ? "introuvable"
                    : scans[folder]
                      ? plural(scans[folder].length, "dépôt")
                      : "scan…"}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Retirer ce dossier"
                  onClick={() =>
                    setFolders((l) => l.filter((f) => f !== folder))
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (pathInput.trim()) addFolder(pathInput.trim())
              }}
            >
              <Input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="~/Workspace/…"
                spellCheck={false}
                className="h-8 font-mono text-xs"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!pathInput.trim()}
              >
                Ajouter
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => pick(addFolder)}
              >
                <FolderOpen />
                Choisir…
              </Button>
            </form>
          </div>

          {unique.length > 0 && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Dépôts listés : {shown} / {unique.length}
              </span>
              <ScrollArea className="h-56 rounded-md border">
                <div className="flex flex-col py-1">
                  {unique.map(({ root, folder }) => (
                    <label
                      key={root}
                      className="flex min-w-0 cursor-pointer items-center gap-2.5 px-2.5 py-1 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={!hidden.includes(root)}
                        onCheckedChange={(checked) =>
                          setHidden((h) =>
                            checked ? h.filter((r) => r !== root) : [...h, root]
                          )
                        }
                      />
                      <RepoPath root={root} folder={folder} />
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {draft.id ? (
            <Button
              variant={confirmDelete ? "destructive" : "ghost"}
              onClick={() =>
                confirmDelete
                  ? onDelete(draft.id!).catch((e) =>
                      toast.error(errorMessage(e))
                    )
                  : setConfirmDelete(true)
              }
              title="Les dossiers et les dépôts ne sont pas touchés"
            >
              {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
            </Button>
          ) : (
            <span />
          )}
          <Button
            onClick={submit}
            disabled={busy || scanning || !name.trim() || !folders.length}
          >
            {draft.id ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Shown when an opened folder holds several repositories
export function FoundDialog({
  found,
  current,
  owner,
  onOpenRepo,
  onCreate,
  onAddToCurrent,
  onSwitch,
  onClose,
}: {
  found: ScanResult
  current: Workspace | null
  // Workspace that already has this folder, if any
  owner: Workspace | null
  onOpenRepo: (root: string) => void
  onCreate: () => void
  onAddToCurrent: () => void
  onSwitch: (id: string) => void
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {plural(found.repos.length, "dépôt")} trouvés
          </DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">
            {found.folder}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 min-w-0 rounded-md border">
          <div className="flex flex-col py-1">
            {found.repos.map((root) => (
              <button
                key={root}
                type="button"
                onClick={() => onOpenRepo(root)}
                className="flex min-w-0 px-2.5 py-1.5 text-left hover:bg-muted/50"
                title="Ouvrir dans un onglet"
              >
                <RepoPath root={root} folder={found.folder} />
              </button>
            ))}
          </div>
        </ScrollArea>
        {found.truncated && (
          <p className="text-xs text-muted-foreground">
            Dossier très volumineux : le scan s’est arrêté avant la fin.
          </p>
        )}
        <DialogFooter>
          {current && owner?.id !== current.id && (
            <Button variant="outline" onClick={onAddToCurrent}>
              <span className="truncate">Ajouter à « {current.name} »</span>
            </Button>
          )}
          {owner ? (
            owner.id !== current?.id && (
              <Button onClick={() => onSwitch(owner.id)}>
                <span className="truncate">Ouvrir « {owner.name} »</span>
              </Button>
            )
          ) : (
            <Button onClick={onCreate}>
              <Layers />
              Créer un workspace…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

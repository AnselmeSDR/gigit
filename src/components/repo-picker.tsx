import { useEffect, useState } from "react"
import {
  FolderGit2,
  FolderOpen,
  Layers,
  Plus,
  TextCursorInput,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { errorMessage, fetchRecent, pickFolder } from "@/lib/api"
import { basename } from "@/lib/format"
import type { Workspace } from "@/lib/types"

export async function pick(onOpen: (path: string) => void) {
  try {
    const path = await pickFolder()
    if (path) onOpen(path)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function PathDialog({
  open,
  onOpenChange,
  onOpen,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (path: string) => void
}) {
  const [value, setValue] = useState("")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!value.trim()) return
            onOpen(value.trim())
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Ouvrir un dossier</DialogTitle>
            <DialogDescription>
              Chemin d’un dépôt, ou d’un dossier : tous les dépôts qu’il
              contient sont détectés.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="~/Workspace/Projects/mon-depot"
            spellCheck={false}
            className="font-mono"
          />
          <DialogFooter>
            <Button type="submit" disabled={!value.trim()}>
              Ouvrir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// "+" at the end of the tab bar: recent repositories, Finder, typed path
export function OpenMenu({ onOpen }: { onOpen: (path: string) => void }) {
  const [recent, setRecent] = useState<string[]>([])
  const [pathOpen, setPathOpen] = useState(false)

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) fetchRecent().then(setRecent, () => setRecent([]))
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            title="Ouvrir un dépôt"
          >
            <Plus />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80" align="start">
          {recent.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Récents
              </DropdownMenuLabel>
              {recent.slice(0, 12).map((r) => (
                <DropdownMenuItem
                  key={r}
                  onSelect={() => onOpen(r)}
                  className="flex-col items-start gap-0"
                >
                  <span className="font-medium">{basename(r)}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {r}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => pick(onOpen)}>
            <FolderOpen />
            Choisir un dossier…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPathOpen(true)}>
            <TextCursorInput />
            Saisir un chemin…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PathDialog
        key={String(pathOpen)}
        open={pathOpen}
        onOpenChange={setPathOpen}
        onOpen={onOpen}
      />
    </>
  )
}

export function Welcome({
  workspaces,
  onOpen,
  onSwitchWorkspace,
  onCreateWorkspace,
}: {
  workspaces: Workspace[]
  onOpen: (path: string) => void
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: () => void
}) {
  const [recent, setRecent] = useState<string[] | null>(null)
  const [path, setPath] = useState("")

  useEffect(() => {
    fetchRecent().then(setRecent, () => setRecent([]))
  }, [])

  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderGit2 />
        </EmptyMedia>
        <EmptyTitle className="text-lg">gigit</EmptyTitle>
        <EmptyDescription>
          Ouvre un dépôt, ou un dossier pour détecter tous ceux qu’il contient.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md">
        <div className="flex gap-2">
          <Button onClick={() => pick(onOpen)}>
            <FolderOpen />
            Choisir un dossier…
          </Button>
          <Button variant="outline" onClick={onCreateWorkspace}>
            <Layers />
            Nouveau workspace…
          </Button>
        </div>
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (path.trim()) onOpen(path.trim())
          }}
        >
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="ou colle un chemin : ~/Workspace/…"
            spellCheck={false}
            className="font-mono text-xs"
          />
          <Button type="submit" variant="outline" disabled={!path.trim()}>
            Ouvrir
          </Button>
        </form>
        {workspaces.length > 0 && (
          <div className="mt-4 flex w-full flex-col gap-1 text-left">
            <span className="px-2 text-xs font-medium text-muted-foreground">
              Workspaces
            </span>
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onSwitchWorkspace(w.id)}
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground"
              >
                <Layers />
                <span className="truncate">{w.name}</span>
              </button>
            ))}
          </div>
        )}
        {recent && recent.length > 0 && (
          <div className="mt-4 flex w-full flex-col gap-1 text-left">
            <span className="px-2 text-xs font-medium text-muted-foreground">
              Récents
            </span>
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onOpen(r)}
                className="flex min-w-0 flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                <span className="text-sm font-medium">{basename(r)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {r}
                </span>
              </button>
            ))}
          </div>
        )}
      </EmptyContent>
    </Empty>
  )
}

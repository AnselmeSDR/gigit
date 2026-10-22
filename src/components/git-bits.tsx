import { Check, Cloud, GitCommitHorizontal, Laptop, Tag } from "lucide-react"
import { cn } from "cn"

import { hue, initials, splitPath } from "@/lib/format"
import type { RefPill } from "@/lib/refs"

export function AuthorAvatar({
  name,
  email,
  size = "sm",
}: {
  name: string
  email: string
  size?: "sm" | "lg"
}) {
  return (
    <span
      title={`${name} <${email}>`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white select-none",
        size === "sm" ? "size-5 text-[9px]" : "size-9 text-xs"
      )}
      style={{ backgroundColor: `hsl(${hue(email || name)} 45% 40%)` }}
    >
      {initials(name)}
    </span>
  )
}

const STATUS_STYLES: Record<string, string> = {
  M: "bg-git-mod/15 text-git-mod",
  T: "bg-git-mod/15 text-git-mod",
  A: "bg-git-add/15 text-git-add",
  D: "bg-git-del/15 text-git-del",
  R: "bg-git-info/15 text-git-info",
  C: "bg-git-info/15 text-git-info",
  U: "bg-git-del/25 text-git-del",
}

const STATUS_LABELS: Record<string, string> = {
  M: "Modifié",
  T: "Type modifié",
  A: "Ajouté",
  D: "Supprimé",
  R: "Renommé",
  C: "Copié",
  U: "En conflit",
}

export function StatusLetter({ status }: { status: string }) {
  return (
    <span
      title={STATUS_LABELS[status] ?? status}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-sm font-mono text-[10px] font-semibold",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  )
}

export function RefBadge({ pill, color }: { pill: RefPill; color: string }) {
  const icons =
    pill.kind === "tag" ? (
      <Tag />
    ) : pill.kind === "remote" ? (
      <Cloud />
    ) : pill.kind === "head" ? (
      <GitCommitHorizontal />
    ) : (
      <>
        <Laptop />
        {pill.synced && <Cloud />}
      </>
    )
  return (
    <span
      title={pill.name}
      className={cn(
        "inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 text-xs text-foreground [&_svg]:size-3 [&_svg]:shrink-0",
        pill.current && "font-semibold"
      )}
      style={{
        borderColor: color,
        backgroundColor: `color-mix(in oklab, ${color} ${pill.current ? 40 : 20}%, transparent)`,
      }}
    >
      {pill.current && <Check />}
      {icons}
      <span className="truncate">{pill.name}</span>
    </span>
  )
}

// Rendering thousands of rows (e.g. untracked build output) would freeze the panel
const MAX_FILES = 500

export type FileEntry = {
  path: string
  orig?: string
  status: string
  add?: number | null
  del?: number | null
}

export function FileList<T extends FileEntry>({
  files,
  isActive,
  onOpen,
}: {
  files: T[]
  isActive: (file: T) => boolean
  onOpen: (file: T) => void
}) {
  if (!files.length) {
    return (
      <p className="px-3 py-1 text-xs text-muted-foreground">Aucun fichier</p>
    )
  }
  const hidden = files.length - MAX_FILES
  return (
    <ul className="flex flex-col">
      {files.slice(0, MAX_FILES).map((f) => {
        const { dir, name } = splitPath(f.path)
        return (
          <li key={`${f.orig ?? ""}>${f.path}`}>
            <button
              type="button"
              onClick={() => onOpen(f)}
              title={f.orig ? `${f.orig} → ${f.path}` : f.path}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 px-3 py-1 text-left text-[13px] hover:bg-muted/60",
                isActive(f) && "bg-git-info/15 hover:bg-git-info/20"
              )}
            >
              <StatusLetter status={f.status} />
              <span className="flex min-w-0 flex-1">
                <span className="truncate text-muted-foreground">{dir}</span>
                <span className="shrink-0">{name}</span>
              </span>
              {f.add != null && (
                <span className="shrink-0 font-mono text-[11px]">
                  <span className="text-git-add">+{f.add}</span>{" "}
                  <span className="text-git-del">−{f.del}</span>
                </span>
              )}
            </button>
          </li>
        )
      })}
      {hidden > 0 && (
        <li className="px-3 py-1 text-xs text-muted-foreground">
          … et {hidden} autres fichiers
        </li>
      )}
    </ul>
  )
}

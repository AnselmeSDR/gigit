import { useMemo } from "react"
import { X } from "lucide-react"
import { cn } from "cn"

import { StatusLetter } from "@/components/git-bits"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { useDiffText } from "@/hooks/use-repo"
import {
  parseDiff,
  type DiffFile,
  type DiffHunk,
  type DiffLine,
} from "@/lib/diff"
import { shortHash } from "@/lib/format"
import type { DiffTarget } from "@/lib/types"

const MAX_LINES = 5000
const MODE_LABELS = {
  staged: "indexé",
  unstaged: "non indexé",
  untracked: "non suivi",
}

const LINE_STYLES: Record<DiffLine["kind"], string> = {
  add: "bg-git-add/12",
  del: "bg-git-del/12",
  ctx: "",
  meta: "text-muted-foreground italic",
}

const PREFIX_STYLES: Record<DiffLine["kind"], string> = {
  add: "text-git-add",
  del: "text-git-del",
  ctx: "text-muted-foreground",
  meta: "",
}

export function DiffView({
  repo,
  target,
  version,
  onClose,
}: {
  repo: string
  target: DiffTarget
  version: string
  onClose: () => void
}) {
  const { text, error, loading } = useDiffText(repo, target, version)
  // Cap the rendered lines: huge diffs would freeze the page
  const { files, truncated } = useMemo(() => {
    const capped: DiffFile[] = []
    let budget = MAX_LINES
    let cut = false
    for (const file of text == null ? [] : parseDiff(text)) {
      const hunks: DiffHunk[] = []
      for (const hunk of file.hunks) {
        const lines = hunk.lines.slice(0, Math.max(budget, 0))
        if (lines.length < hunk.lines.length) cut = true
        if (lines.length) hunks.push({ ...hunk, lines })
        budget -= lines.length
      }
      capped.push({ ...file, hunks })
    }
    return { files: capped, truncated: cut }
  }, [text])
  const where =
    target.kind === "commit" ? shortHash(target.hash) : MODE_LABELS[target.mode]

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <StatusLetter status={target.status} />
        <span
          className="min-w-0 truncate font-mono text-[13px]"
          title={target.path}
        >
          {target.orig ? `${target.orig} → ${target.path}` : target.path}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{where}</span>
        <div className="flex-1" />
        <Kbd>Échap</Kbd>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Fermer le diff"
        >
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5">
        {error && (
          <p className="p-4 font-sans text-sm text-destructive">{error}</p>
        )}
        {text == null && !error && loading && (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton
                key={i}
                className="h-4"
                style={{ width: `${40 + ((i * 37) % 55)}%` }}
              />
            ))}
          </div>
        )}
        {text != null && !files.some((f) => f.hunks.length || f.binary) && (
          <p className="p-4 font-sans text-sm text-muted-foreground">
            Aucune différence de contenu (changement de mode ou fichier vide).
          </p>
        )}
        {files.map((file, fi) => (
          <div key={fi}>
            {files.length > 1 && (
              <div className="border-b bg-muted/40 px-4 py-1 text-muted-foreground">
                {file.header[0]}
              </div>
            )}
            {file.binary && (
              <p className="p-4 font-sans text-sm text-muted-foreground">
                Fichier binaire.
              </p>
            )}
            {file.hunks.map((hunk, hi) => (
              <div key={hi}>
                <div className="sticky top-0 z-10 border-y bg-muted px-4 py-0.5 text-muted-foreground">
                  {hunk.header}
                </div>
                <table className="w-full border-collapse">
                  <tbody>
                    {hunk.lines.map((line, li) => (
                      <tr
                        key={li}
                        className={cn(
                          LINE_STYLES[line.kind],
                          line.marker && "bg-git-mod/20"
                        )}
                      >
                        <td className="w-12 min-w-12 pr-2 text-right align-top text-muted-foreground/60 select-none">
                          {line.oldNo}
                        </td>
                        <td className="w-12 min-w-12 pr-2 text-right align-top text-muted-foreground/60 select-none">
                          {line.newNo}
                        </td>
                        <td className="pr-4 whitespace-pre [tab-size:4]">
                          <span
                            className={cn(
                              "inline-block w-4 select-none",
                              PREFIX_STYLES[line.kind]
                            )}
                          >
                            {line.prefix}
                          </span>
                          {line.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))}
        {truncated && (
          <p className="p-4 font-sans text-sm text-muted-foreground">
            Diff tronqué à {MAX_LINES} lignes.
          </p>
        )}
      </div>
    </div>
  )
}

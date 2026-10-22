import { Copy, GitCommitHorizontal, Lock } from "lucide-react"
import { toast } from "sonner"

import { AuthorAvatar, FileList } from "@/components/git-bits"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useCommitDetail } from "@/hooks/use-repo"
import { fullDate, plural, shortHash } from "@/lib/format"
import type { CommitDetail, DiffTarget, WipFile, WipList } from "@/lib/types"

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(label)
  } catch {
    toast.error("Impossible de copier")
  }
}

function CommitInfo({
  commit,
  diff,
  onOpenDiff,
  onSelect,
}: {
  commit: CommitDetail
  diff: DiffTarget | null
  onOpenDiff: (target: DiffTarget) => void
  onSelect: (hash: string) => void
}) {
  const [subject, ...rest] = commit.message.split("\n")
  const body = rest.join("\n").trim()
  const add = commit.files.reduce((n, f) => n + (f.add ?? 0), 0)
  const del = commit.files.reduce((n, f) => n + (f.del ?? 0), 0)
  const committedBySomeoneElse =
    commit.committer !== commit.author || commit.commitTime !== commit.time

  return (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex flex-col gap-2 px-3">
        <h2 className="text-sm leading-snug font-semibold">{subject}</h2>
        {body && (
          <p className="text-[13px] whitespace-pre-wrap text-muted-foreground">
            {body}
          </p>
        )}
      </div>

      <div className="flex items-start gap-3 px-3">
        <AuthorAvatar name={commit.author} email={commit.email} size="lg" />
        <div className="min-w-0 text-[13px]">
          <div className="truncate">
            <span className="font-medium">{commit.author}</span>{" "}
            <span className="text-muted-foreground">{commit.email}</span>
          </div>
          <div className="text-muted-foreground">{fullDate(commit.time)}</div>
          {committedBySomeoneElse && (
            <div className="text-xs text-muted-foreground">
              Commité par {commit.committer} · {fullDate(commit.commitTime)}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 text-xs text-muted-foreground">
        <span>commit</span>
        <Button
          variant="outline"
          size="xs"
          className="font-mono"
          onClick={() => copy(commit.hash, "SHA copié")}
          title="Copier le SHA complet"
        >
          {shortHash(commit.hash)}
          <Copy />
        </Button>
        {commit.parents.length ? (
          <>
            <span className="ml-1">
              {commit.parents.length > 1 ? "parents" : "parent"}
            </span>
            {commit.parents.map((p) => (
              <Button
                key={p}
                variant="ghost"
                size="xs"
                className="font-mono text-git-info"
                onClick={() => onSelect(p)}
              >
                {shortHash(p)}
              </Button>
            ))}
          </>
        ) : (
          <span className="ml-1">commit racine</span>
        )}
      </div>

      {commit.parents.length > 1 && (
        <p className="mx-3 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          Commit de fusion : fichiers comparés au premier parent.
        </p>
      )}

      <div>
        <div className="flex items-center gap-2 border-y bg-muted/30 px-3 py-1.5 text-xs">
          <span className="font-medium">
            {plural(commit.files.length, "fichier")}
          </span>
          <span className="font-mono text-git-add">+{add}</span>
          <span className="font-mono text-git-del">−{del}</span>
        </div>
        <FileList
          files={commit.files}
          isActive={(f) => diff?.kind === "commit" && diff.path === f.path}
          onOpen={(f) =>
            onOpenDiff({
              kind: "commit",
              hash: commit.hash,
              path: f.path,
              orig: f.orig,
              status: f.status,
            })
          }
        />
      </div>
    </div>
  )
}

function CommitDetails({
  repo,
  hash,
  diff,
  onOpenDiff,
  onSelect,
}: {
  repo: string
  hash: string
  diff: DiffTarget | null
  onOpenDiff: (target: DiffTarget) => void
  onSelect: (hash: string) => void
}) {
  const { detail, error } = useCommitDetail(repo, hash)
  if (error) return <p className="p-3 text-sm text-destructive">{error}</p>
  if (!detail) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  return (
    <CommitInfo
      commit={detail}
      diff={diff}
      onOpenDiff={onOpenDiff}
      onSelect={onSelect}
    />
  )
}

const WIP_SECTIONS: { list: WipList; title: string }[] = [
  { list: "conflicts", title: "Conflits" },
  { list: "unstaged", title: "Non indexés" },
  { list: "staged", title: "Indexés" },
]

function WipDetails({
  wip,
  diff,
  onOpenDiff,
}: {
  wip: Record<WipList, WipFile[]>
  diff: DiffTarget | null
  onOpenDiff: (target: DiffTarget) => void
}) {
  const open = (f: WipFile, list: WipList) =>
    onOpenDiff({
      kind: "work",
      list,
      path: f.path,
      orig: list === "staged" ? f.orig : undefined,
      mode: f.untracked
        ? "untracked"
        : list === "staged"
          ? "staged"
          : "unstaged",
      status: f.status,
    })
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="px-3">
        <h2 className="text-sm font-semibold">Modifications en cours</h2>
        <p className="flex items-center gap-1 text-xs text-muted-foreground [&_svg]:size-3">
          <Lock /> Lecture seule
        </p>
      </div>
      {WIP_SECTIONS.filter(
        ({ list }) => list !== "conflicts" || wip.conflicts.length
      ).map(({ list, title }) => (
        <div key={list}>
          <div className="flex items-center gap-2 border-y bg-muted/30 px-3 py-1.5 text-xs">
            <span className="font-medium">{title}</span>
            <span className="text-muted-foreground">{wip[list].length}</span>
          </div>
          <FileList
            files={wip[list]}
            isActive={(f) =>
              diff?.kind === "work" &&
              diff.list === list &&
              diff.path === f.path
            }
            onOpen={(f) => open(f, list)}
          />
        </div>
      ))}
    </div>
  )
}

export function DetailsPanel({
  repo,
  selected,
  wip,
  diff,
  onOpenDiff,
  onSelect,
}: {
  repo: string
  selected: string | null
  wip: Record<WipList, WipFile[]> | null
  diff: DiffTarget | null
  onOpenDiff: (target: DiffTarget) => void
  onSelect: (hash: string) => void
}) {
  if (!selected) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitCommitHorizontal />
          </EmptyMedia>
          <EmptyTitle>Aucun commit sélectionné</EmptyTitle>
          <EmptyDescription>
            Clique sur une ligne du graphe pour voir son détail.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <ScrollArea className="h-full">
      {wip ? (
        <WipDetails wip={wip} diff={diff} onOpenDiff={onOpenDiff} />
      ) : (
        <CommitDetails
          key={selected}
          repo={repo}
          hash={selected}
          diff={diff}
          onOpenDiff={onOpenDiff}
          onSelect={onSelect}
        />
      )}
    </ScrollArea>
  )
}

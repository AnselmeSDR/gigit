import { memo, useMemo, type RefObject } from "react"
import { cn } from "cn"

import { AuthorAvatar, RefBadge } from "@/components/git-bits"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { fullDate, relativeDate, shortHash } from "@/lib/format"
import {
  ROW_H,
  graphPaths,
  graphWidth,
  laneColor,
  laneX,
  type GraphLayout,
} from "@/lib/graph"
import type { RefPill } from "@/lib/refs"
import type { GraphItem, StatusEntry } from "@/lib/types"

export const HEADER_H = 32
const REFS_W = 200
const AUTHOR_W = 150
const DATE_W = 100
const SHA_W = 72
const MIN_MSG_W = 160
const MAX_GRAPH_W = 280

type Props = {
  items: GraphItem[]
  layout: GraphLayout
  pills: Map<string, RefPill[]>
  head: string | null
  status: StatusEntry[]
  selected: string | null
  matches: Set<number> | null
  canLoadMore: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  onSelect: (hash: string) => void
  onLoadMore: () => void
}

export function CommitGraph({
  items,
  layout,
  pills,
  head,
  status,
  selected,
  matches,
  canLoadMore,
  scrollRef,
  onSelect,
  onLoadMore,
}: Props) {
  const fullWidth = graphWidth(layout.lanes)
  const graphCol = Math.max(Math.min(fullWidth, MAX_GRAPH_W), 64)
  const minWidth = REFS_W + graphCol + MIN_MSG_W + AUTHOR_W + DATE_W + SHA_W

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto"
      role="grid"
      aria-label="Historique des commits"
    >
      <div style={{ minWidth }}>
        <div
          className="sticky top-0 z-20 flex items-center border-b bg-background pr-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
          style={{ height: HEADER_H }}
          role="row"
        >
          <div className="shrink-0 px-3 text-right" style={{ width: REFS_W }}>
            Branche / tag
          </div>
          <div className="shrink-0 px-2" style={{ width: graphCol }}>
            Graphe
          </div>
          <div className="min-w-0 flex-1 px-2">Message</div>
          <div className="shrink-0 px-2" style={{ width: AUTHOR_W }}>
            Auteur
          </div>
          <div className="shrink-0 px-2" style={{ width: DATE_W }}>
            Date
          </div>
          <div className="shrink-0 px-2" style={{ width: SHA_W }}>
            SHA
          </div>
        </div>

        <div className="relative">
          <div
            className="pointer-events-none absolute top-0 z-10 overflow-hidden"
            style={{
              left: REFS_W,
              width: graphCol,
              height: items.length * ROW_H,
            }}
          >
            <GraphSvg
              layout={layout}
              items={items}
              pills={pills}
              head={head}
              width={fullWidth}
            />
          </div>
          {items.map((item, i) => (
            <CommitRow
              key={item.hash}
              item={item}
              color={laneColor(layout.rows[i].col)}
              pills={pills.get(item.hash)}
              status={item.wip ? status : undefined}
              graphCol={graphCol}
              selected={item.hash === selected}
              dimmed={matches != null && !item.wip && !matches.has(i)}
              onSelect={onSelect}
            />
          ))}
        </div>

        {canLoadMore && (
          <div className="flex justify-center p-3">
            <Button variant="outline" size="sm" onClick={onLoadMore}>
              Charger plus de commits
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

const GraphSvg = memo(function GraphSvg({
  layout,
  items,
  pills,
  head,
  width,
}: {
  layout: GraphLayout
  items: GraphItem[]
  pills: Map<string, RefPill[]>
  head: string | null
  width: number
}) {
  const paths = useMemo(() => graphPaths(layout, items), [layout, items])
  const r = ROW_H / 2
  return (
    <svg
      width={width}
      height={Math.max(items.length * ROW_H, 1)}
      aria-hidden="true"
    >
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={p.color}
          strokeWidth={2}
          strokeDasharray={p.dashed ? "3 3" : undefined}
        />
      ))}
      {layout.rows.map((row, i) => {
        const c = items[i]
        const x = laneX(row.col)
        const y = i * ROW_H + r
        const color = laneColor(row.col)
        return (
          <g key={c.hash}>
            {pills.has(c.hash) && (
              <line
                x1={0}
                y1={y}
                x2={x}
                y2={y}
                stroke={color}
                strokeWidth={1.5}
                opacity={0.55}
              />
            )}
            {c.wip ? (
              <circle
                cx={x}
                cy={y}
                r={6}
                stroke={color}
                strokeWidth={2}
                strokeDasharray="2.5 2"
                className="fill-background"
              />
            ) : c.parents.length > 1 ? (
              <circle cx={x} cy={y} r={4} fill={color} />
            ) : (
              <>
                {c.hash === head && (
                  <circle
                    cx={x}
                    cy={y}
                    r={9.5}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill={color}
                  strokeWidth={2}
                  className="stroke-background"
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
})

function wipCounts(status: StatusEntry[]) {
  const counts = { modified: 0, added: 0, deleted: 0 }
  for (const f of status) {
    const code = f.x === "?" ? "A" : [f.y, f.x].find((s) => s !== " ")
    if (code === "A") counts.added++
    else if (code === "D") counts.deleted++
    else counts.modified++
  }
  return counts
}

const CommitRow = memo(function CommitRow({
  item,
  color,
  pills,
  status,
  graphCol,
  selected,
  dimmed,
  onSelect,
}: {
  item: GraphItem
  color: string
  pills: RefPill[] | undefined
  status: StatusEntry[] | undefined
  graphCol: number
  selected: boolean
  dimmed: boolean
  onSelect: (hash: string) => void
}) {
  const counts = status ? wipCounts(status) : null
  return (
    <div
      role="row"
      aria-selected={selected}
      onClick={() => onSelect(item.hash)}
      className={cn(
        "flex cursor-default items-center pr-3 text-[13px]",
        selected ? "bg-git-info/15" : "hover:bg-muted/50"
      )}
      style={{ height: ROW_H }}
    >
      <div
        className={cn(
          "flex shrink-0 justify-end gap-1 overflow-hidden px-2",
          dimmed && "opacity-30"
        )}
        style={{ width: REFS_W }}
      >
        {pills?.length ? (
          <>
            <RefBadge pill={pills[0]} color={color} />
            {pills.length > 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-xs"
                    style={{ borderColor: color }}
                  >
                    +{pills.length - 1}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="flex flex-col items-start gap-1"
                >
                  {pills.slice(1).map((p) => (
                    <span key={`${p.kind}:${p.name}`}>{p.name}</span>
                  ))}
                </TooltipContent>
              </Tooltip>
            )}
          </>
        ) : null}
      </div>
      <div className="shrink-0" style={{ width: graphCol }} />
      {counts ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 text-muted-foreground">
          <span className="italic">// WIP</span>
          {counts.modified > 0 && (
            <span className="text-git-mod">✎ {counts.modified}</span>
          )}
          {counts.added > 0 && (
            <span className="text-git-add">+ {counts.added}</span>
          )}
          {counts.deleted > 0 && (
            <span className="text-git-del">− {counts.deleted}</span>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center",
            dimmed && "opacity-30"
          )}
        >
          <div
            title={item.subject}
            className={cn(
              "min-w-0 flex-1 truncate px-2",
              item.parents.length > 1 && "text-muted-foreground"
            )}
          >
            {item.subject}
          </div>
          <div
            className="flex shrink-0 items-center gap-1.5 px-2"
            style={{ width: AUTHOR_W }}
          >
            <AuthorAvatar name={item.author} email={item.email} />
            <span className="truncate text-muted-foreground">
              {item.author}
            </span>
          </div>
          <div
            className="shrink-0 truncate px-2 text-muted-foreground"
            style={{ width: DATE_W }}
            title={fullDate(item.time)}
          >
            {relativeDate(item.time)}
          </div>
          <div
            className="shrink-0 px-2 font-mono text-xs text-muted-foreground"
            style={{ width: SHA_W }}
          >
            {shortHash(item.hash)}
          </div>
        </div>
      )}
    </div>
  )
})

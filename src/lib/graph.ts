import type { GraphItem } from "@/lib/types"

export const ROW_H = 28
export const LANE_W = 16
export const GRAPH_PAD = 8
// Theme variables (src/index.css), so lanes follow the light/dark palette
export const LANE_COLORS = Array.from(
  { length: 10 },
  (_, i) => `var(--lane-${i})`
)

type Lane = string | null

export type GraphRow = {
  col: number
  before: Lane[]
  beforeWip: boolean[]
  after: Lane[]
  afterWip: boolean[]
  // Columns this commit's parent edges leave towards (first one is its own lane)
  out: number[]
}

export type GraphLayout = { rows: GraphRow[]; lanes: number }

export const laneX = (lane: number) => GRAPH_PAD + lane * LANE_W + LANE_W / 2
export const laneColor = (lane: number) =>
  LANE_COLORS[lane % LANE_COLORS.length]
export const graphWidth = (lanes: number) => GRAPH_PAD * 2 + lanes * LANE_W

// Assign each commit a column; lanes[j] holds the hash that lane is heading to
export function computeGraph(items: GraphItem[]): GraphLayout {
  const lanes: Lane[] = []
  const wip: boolean[] = []
  const rows: GraphRow[] = []
  let width = 1
  const free = () => {
    const i = lanes.findIndex((l) => l == null)
    return i === -1 ? lanes.length : i
  }
  for (const c of items) {
    const before = lanes.slice()
    const beforeWip = wip.slice()
    let col = lanes.indexOf(c.hash)
    if (col === -1) col = free()
    for (let j = 0; j < lanes.length; j++) {
      if (lanes[j] !== c.hash) continue
      lanes[j] = null
      wip[j] = false
    }
    const out: number[] = []
    c.parents.forEach((parent, n) => {
      if (n === 0) {
        lanes[col] = parent
        wip[col] = Boolean(c.wip)
        out.push(col)
        return
      }
      let k = lanes.indexOf(parent)
      if (k === -1) {
        k = free()
        lanes[k] = parent
        wip[k] = false
      }
      out.push(k)
    })
    while (lanes.length && lanes[lanes.length - 1] == null) {
      lanes.pop()
      wip.pop()
    }
    rows.push({
      col,
      before,
      beforeWip,
      after: lanes.slice(),
      afterWip: wip.slice(),
      out,
    })
    width = Math.max(width, before.length, lanes.length, col + 1)
  }
  return { rows, lanes: width }
}

export type GraphPath = {
  key: string
  color: string
  dashed: boolean
  d: string
}

// Build one SVG path per (color, dashed) pair: rounded elbows like GitKraken
export function graphPaths(
  layout: GraphLayout,
  items: GraphItem[]
): GraphPath[] {
  const r = ROW_H / 2
  const paths = new Map<string, GraphPath>()
  const add = (lane: number, dashed: boolean, d: string) => {
    const colorIndex = lane % LANE_COLORS.length
    const key = `${colorIndex}${dashed ? "d" : ""}`
    const path = paths.get(key)
    if (path) path.d += d
    else paths.set(key, { key, color: LANE_COLORS[colorIndex], dashed, d })
  }
  layout.rows.forEach((row, i) => {
    const hash = items[i].hash
    const y0 = i * ROW_H
    const yc = y0 + r
    const y1 = y0 + ROW_H
    const xc = laneX(row.col)
    // Top half: lanes passing through, or converging into this commit
    row.before.forEach((h, j) => {
      if (h == null) return
      const x = laneX(j)
      const dashed = row.beforeWip[j]
      if (h !== hash || j === row.col) {
        add(j, dashed, `M${x} ${y0}V${yc}`)
        return
      }
      const s = Math.sign(xc - x)
      add(
        j,
        dashed,
        `M${x} ${y0}A${r} ${r} 0 0 ${s > 0 ? 0 : 1} ${x + s * r} ${yc}H${xc}`
      )
    })
    // Bottom half: untouched lanes go on, then edges towards the parents
    row.after.forEach((h, k) => {
      if (h != null && k !== row.col && row.before[k] === h) {
        add(k, row.afterWip[k], `M${laneX(k)} ${yc}V${y1}`)
      }
    })
    row.out.forEach((k) => {
      const x = laneX(k)
      if (k === row.col) {
        add(k, row.afterWip[k], `M${xc} ${yc}V${y1}`)
        return
      }
      const s = Math.sign(x - xc)
      add(
        k,
        false,
        `M${xc} ${yc}H${x - s * r}A${r} ${r} 0 0 ${s > 0 ? 1 : 0} ${x} ${y1}`
      )
    })
  })
  return [...paths.values()]
}

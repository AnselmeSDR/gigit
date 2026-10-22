import type { StatusEntry, WipFile, WipList } from "@/lib/types"

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" })
const shortDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" })
const longDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
})

export function relativeDate(time: number) {
  const s = Date.now() / 1000 - time
  if (s < 60) return "à l’instant"
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute")
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), "hour")
  if (s < 7 * 86400) return rtf.format(-Math.floor(s / 86400), "day")
  return shortDate.format(time * 1000)
}

export const fullDate = (time: number) => longDate.format(time * 1000)

export const shortHash = (hash: string) => hash.slice(0, 7)

export const plural = (n: number, word: string) =>
  `${n} ${word}${n > 1 ? "s" : ""}`

export const basename = (p: string) =>
  p.replace(/\/+$/, "").split("/").pop() ?? p

// Path relative to a folder, or the folder's own name for the folder itself
export function relativePath(p: string, folder: string) {
  if (p === folder) return basename(p)
  return p.startsWith(`${folder}/`) ? p.slice(folder.length + 1) : p
}

// Base names, plus the closest parent folder that tells same-named paths
// apart (abricot · v22 / abricot · v22_gafic)
export function shortLabels(paths: string[]) {
  const groups = new Map<string, string[]>()
  for (const p of paths) {
    const name = basename(p)
    groups.set(name, [...(groups.get(name) ?? []), p])
  }
  const labels = new Map<string, string>()
  for (const [name, group] of groups) {
    if (group.length === 1) {
      labels.set(group[0], name)
      continue
    }
    const parents = group.map((p) => p.split("/").slice(0, -1).reverse())
    group.forEach((p, i) => {
      const depth = parents[i].findIndex((dir, d) =>
        parents.every((other, j) => j === i || other[d] !== dir)
      )
      labels.set(p, depth === -1 ? p : `${name} · ${parents[i][depth]}`)
    })
  }
  return labels
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  )
}

export function hue(text: string) {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 360
}

export function splitPath(p: string) {
  const slash = p.lastIndexOf("/")
  return { dir: p.slice(0, slash + 1), name: p.slice(slash + 1) }
}

const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"])

export function splitStatus(status: StatusEntry[]): Record<WipList, WipFile[]> {
  const lists: Record<WipList, WipFile[]> = {
    conflicts: [],
    staged: [],
    unstaged: [],
  }
  for (const f of status) {
    const xy = f.x + f.y
    if (CONFLICT_CODES.has(xy)) {
      lists.conflicts.push({ path: f.path, status: "U" })
    } else if (xy === "??") {
      lists.unstaged.push({ path: f.path, status: "A", untracked: true })
    } else {
      if (f.x !== " ")
        lists.staged.push({ path: f.path, orig: f.orig, status: f.x })
      if (f.y !== " ") lists.unstaged.push({ path: f.path, status: f.y })
    }
  }
  return lists
}

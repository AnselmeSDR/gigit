import fsp from "node:fs/promises"
import path from "node:path"
import { HttpError, expandPath, resolveRepo } from "./git.js"

// Dependency and build folders never hold repositories worth listing
const SKIP_DIRS = new Set([
  "node_modules",
  "vendor",
  "bower_components",
  "dist",
  "build",
  "target",
  "Library",
  "Pods",
  "DerivedData",
  "__pycache__",
  "venv",
])
const MAX_DEPTH = 8
const MAX_DIRS = 100_000

// Finds every Git work tree under a folder, nested ones included
// (e.g. a Dolibarr checkout with one repository per module)
export async function scanRepos(input) {
  let folder
  try {
    // Real path, so results match the roots Git reports (/tmp → /private/tmp)
    folder = await fsp.realpath(expandPath(input, "Dossier"))
  } catch (e) {
    if (e.status) throw e
    throw new HttpError(400, `Dossier introuvable : ${input}`)
  }
  const repos = []
  let visited = 0

  async function walk(dir, depth) {
    if (++visited > MAX_DIRS) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable folder
    }
    // ".git" is a folder for clones, a file for worktrees and submodules
    if (entries.some((e) => e.name === ".git")) repos.push(dir)
    if (depth >= MAX_DEPTH) return
    await Promise.all(
      entries
        .filter(
          (e) =>
            e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)
        )
        .map((e) => walk(path.join(dir, e.name), depth + 1))
    )
  }

  await walk(folder, 0)
  // A folder inside a single repository opens that repository
  if (!repos.length) {
    const repo = await resolveRepo(folder).catch(() => null)
    if (repo) repos.push(repo.root)
  }
  return { folder, repos: repos.sort(), truncated: visited > MAX_DIRS }
}

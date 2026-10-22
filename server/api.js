import crypto from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  HttpError,
  expandPath,
  filePath,
  getCommit,
  getCommitDiff,
  getLog,
  getSummary,
  getWorkDiff,
  resolveRepo,
  run,
  snapshot,
} from "./git.js"
import { scanRepos } from "./scan.js"

const STATE_FILE = path.join(os.homedir(), ".config", "gigit", "state.json")
const MAX_RECENT = 20
const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

const MAX_SUMMARIES = 500
const SUMMARY_CONCURRENCY = 8

async function loadState() {
  try {
    return JSON.parse(await fsp.readFile(STATE_FILE, "utf8"))
  } catch {
    return {}
  }
}

let stateQueue = Promise.resolve()

// Serializes read-modify-write cycles; the rename keeps the file whole on crash
function updateState(change) {
  const next = stateQueue.then(async () => {
    const state = await loadState()
    const result = await change(state)
    await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true })
    const tmp = `${STATE_FILE}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2))
    await fsp.rename(tmp, STATE_FILE)
    return result
  })
  stateQueue = next.catch(() => {})
  return next
}

function addRecent(root) {
  return updateState((state) => {
    state.recent = [
      root,
      ...(state.recent || []).filter((r) => r !== root),
    ].slice(0, MAX_RECENT)
  })
}

const uniqueStrings = (list) => [
  ...new Set(list.filter((v) => typeof v === "string" && v)),
]

function cleanWorkspace(input, existing) {
  const name =
    typeof input.name === "string" ? input.name.trim() : existing?.name
  if (!name) throw new HttpError(400, "Nom manquant")
  const folders = Array.isArray(input.folders)
    ? uniqueStrings(input.folders.map((f) => expandPath(f, "Dossier")))
    : (existing?.folders ?? [])
  if (!folders.length) throw new HttpError(400, "Aucun dossier")
  const hidden = Array.isArray(input.hidden)
    ? uniqueStrings(input.hidden)
    : (existing?.hidden ?? [])
  return { id: existing?.id ?? crypto.randomUUID(), name, folders, hidden }
}

function findWorkspace(state, id) {
  const workspace = (state.workspaces || []).find((w) => w.id === id)
  if (!workspace) throw new HttpError(404, "Workspace introuvable")
  return workspace
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return results
}

async function pickFolder() {
  try {
    const { stdout } = await run(
      "osascript",
      [
        "-e",
        "activate",
        "-e",
        'POSIX path of (choose folder with prompt "Ouvrir un dossier")',
      ],
      { timeout: 300_000 }
    )
    return stdout.trim() || null
  } catch (e) {
    if (/-128/.test(e.message)) return null // user cancelled
    throw e
  }
}

const ROUTES = {
  async "GET /api/workspaces"() {
    const { workspaces = [] } = await loadState()
    return { workspaces }
  },
  async "POST /api/workspaces"(query, body) {
    const workspace = cleanWorkspace(body)
    await updateState((state) => {
      state.workspaces = [...(state.workspaces || []), workspace]
    })
    return { workspace }
  },
  async "PUT /api/workspaces"(query, body) {
    const workspace = await updateState((state) => {
      const current = findWorkspace(state, body.id)
      const next = cleanWorkspace(body, current)
      state.workspaces = state.workspaces.map((w) =>
        w.id === next.id ? next : w
      )
      return next
    })
    return { workspace }
  },
  async "DELETE /api/workspaces"(query) {
    await updateState((state) => {
      findWorkspace(state, query.id)
      state.workspaces = state.workspaces.filter((w) => w.id !== query.id)
    })
    return {}
  },
  async "GET /api/scan"(query) {
    return scanRepos(query.path)
  },
  // Every repository found in a workspace's folders, hidden ones included
  async "GET /api/repos"(query) {
    const workspace = findWorkspace(await loadState(), query.workspace)
    const scans = await Promise.all(
      workspace.folders.map((f) => scanRepos(f).catch(() => null))
    )
    const repos = new Set(scans.flatMap((scan) => scan?.repos ?? []))
    return {
      repos: [...repos].sort(),
      missing: workspace.folders.filter((f, i) => !scans[i]),
    }
  },
  async "POST /api/summaries"(query, body) {
    const repos = uniqueStrings(
      Array.isArray(body.repos) ? body.repos : []
    ).slice(0, MAX_SUMMARIES)
    const entries = await mapLimit(repos, SUMMARY_CONCURRENCY, async (r) => {
      try {
        return [r, await getSummary(await resolveRepo(r))]
      } catch (e) {
        return [r, { error: e.message }]
      }
    })
    return { summaries: Object.fromEntries(entries) }
  },
  async "GET /api/recent"() {
    const { recent = [] } = await loadState()
    return { recent: recent.filter((r) => fs.existsSync(r)) }
  },
  async "POST /api/open"(query, body) {
    const { root } = await resolveRepo(body.path)
    await addRecent(root)
    return { root }
  },
  async "POST /api/pick"() {
    return { path: await pickFolder() }
  },
  async "GET /api/repo"(query) {
    const repo = await resolveRepo(query.repo)
    const limit = Math.min(Math.max(Number(query.limit) || 1000, 100), 50_000)
    const snap = await snapshot(repo)
    const log = await getLog(repo.root, limit, Boolean(snap.head))
    return { root: repo.root, name: path.basename(repo.root), ...snap, log }
  },
  async "GET /api/fingerprint"(query) {
    const { fingerprint } = await snapshot(await resolveRepo(query.repo))
    return { fingerprint }
  },
  async "GET /api/commit"(query) {
    const { root } = await resolveRepo(query.repo)
    return getCommit(root, query.hash)
  },
  async "GET /api/diff"(query) {
    const { root } = await resolveRepo(query.repo)
    return {
      diff: await getCommitDiff(
        root,
        query.hash,
        filePath(query.path),
        query.orig || null
      ),
    }
  },
  async "GET /api/wdiff"(query) {
    const { root } = await resolveRepo(query.repo)
    return {
      diff: await getWorkDiff(
        root,
        filePath(query.path),
        query.orig || null,
        query.mode
      ),
    }
  },
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => {
      try {
        resolve(
          chunks.length
            ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
            : {}
        )
      } catch {
        reject(new HttpError(400, "JSON invalide"))
      }
    })
    req.on("error", reject)
  })
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(body))
}

// Connect-style middleware: handles /api/*, hands everything else to next()
export function createApi() {
  return async function api(req, res, next) {
    const url = new URL(req.url, "http://localhost")
    if (!url.pathname.startsWith("/api/")) return next()
    try {
      // Block DNS rebinding and cross-site requests (browsers can't send a custom header cross-origin without CORS)
      const hostname = (req.headers.host || "").replace(/:\d+$/, "")
      if (!ALLOWED_HOSTNAMES.has(hostname))
        throw new HttpError(403, "Hôte non autorisé")
      if (req.headers["x-gigit"] !== "1")
        throw new HttpError(403, "En-tête manquant")
      const handler = ROUTES[`${req.method} ${url.pathname}`]
      if (!handler) throw new HttpError(404, "Introuvable")
      const body =
        req.method === "POST" || req.method === "PUT" ? await readJson(req) : {}
      sendJson(
        res,
        200,
        await handler(Object.fromEntries(url.searchParams), body)
      )
    } catch (e) {
      if (!e.status) console.error(e)
      sendJson(res, e.status || 500, { error: e.message })
    }
  }
}

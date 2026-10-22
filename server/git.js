import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"

const DEFAULT_TIMEOUT = 60_000
const US = "\x1f"
const RS = "\x1e"
const REF_FORMAT = [
  "%(refname)",
  "%(objectname)",
  "%(*objectname)",
  "%(upstream:short)",
  "%(upstream:track,nobracket)",
  "%(symref)",
].join("%1f")
const LOG_FORMAT = ["%H", "%P", "%an", "%ae", "%at", "%s"].join("%x1f") + "%x1e"
const COMMIT_FORMAT = [
  "%H",
  "%P",
  "%an",
  "%ae",
  "%at",
  "%cn",
  "%ce",
  "%ct",
  "%B",
].join("%x1f")
const STASH_FORMAT = ["%gd", "%H", "%gs", "%ct"].join("%x1f")
const DIFF_OPTS = ["--no-color", "--no-ext-diff"]

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function run(
  cmd,
  args,
  { cwd, timeout = DEFAULT_TIMEOUT, okCodes = [0] } = {}
) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      {
        cwd,
        timeout,
        maxBuffer: 256 * 1024 * 1024,
        // Never prompt, never take optional locks: gigit only reads
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
        },
      },
      (err, stdout, stderr) => {
        const code = err ? err.code : 0
        if (okCodes.includes(code)) return resolve({ stdout, stderr, code })
        const message = err?.killed
          ? `Délai dépassé : ${cmd} ${args[0]}`
          : (stderr || stdout || err.message).trim()
        reject(new HttpError(400, message))
      }
    )
    child.stdin?.on("error", () => {})
    child.stdin?.end()
  })
}

const git = (root, args, opts = {}) => run("git", args, { ...opts, cwd: root })

export function sha(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{4,64}$/i.test(value)) {
    throw new HttpError(400, `Commit invalide : ${value}`)
  }
  return value
}

export function filePath(value) {
  if (typeof value !== "string" || !value)
    throw new HttpError(400, "Chemin manquant")
  return value
}

// ---------- repository ----------

const repoCache = new Map()

// Absolute path from user input, with "~" expanded
export function expandPath(input, label = "Chemin") {
  if (typeof input !== "string" || !input.trim())
    throw new HttpError(400, `${label} manquant`)
  return path.resolve(input.trim().replace(/^~(?=$|\/)/, os.homedir()))
}

export async function resolveRepo(input) {
  const abs = expandPath(input, "Dépôt")
  if (repoCache.has(abs)) return repoCache.get(abs)
  const { stdout } = await git(abs, [
    "rev-parse",
    "--show-toplevel",
    "--absolute-git-dir",
  ]).catch(() => {
    throw new HttpError(400, `Pas un dépôt Git : ${abs}`)
  })
  const [root, gitDir] = stdout.trim().split("\n")
  if (!root) throw new HttpError(400, `Dépôt sans arbre de travail : ${abs}`)
  const repo = { root, gitDir }
  repoCache.set(abs, repo)
  return repo
}

function repoOp(gitDir) {
  const has = (file) => fs.existsSync(path.join(gitDir, file))
  if (has("rebase-merge") || has("rebase-apply")) return "rebase"
  if (has("MERGE_HEAD")) return "merge"
  if (has("CHERRY_PICK_HEAD")) return "cherry-pick"
  if (has("REVERT_HEAD")) return "revert"
  return null
}

// ---------- parsers ----------

function parseTrack(track) {
  const ahead = /ahead (\d+)/.exec(track)
  const behind = /behind (\d+)/.exec(track)
  return {
    ahead: ahead ? Number(ahead[1]) : 0,
    behind: behind ? Number(behind[1]) : 0,
    gone: track === "gone",
  }
}

function parseRefs(out, remotes) {
  // Longest remote first so "a/b" wins over "a"
  const sortedRemotes = [...remotes].sort((a, b) => b.length - a.length)
  const refs = []
  for (const line of out.split("\n")) {
    if (!line) continue
    const [full, obj, peeled, upstream, track, symref] = line.split(US)
    if (symref) continue
    const target = peeled || obj
    if (full.startsWith("refs/heads/")) {
      refs.push({
        type: "local",
        name: full.slice(11),
        target,
        upstream: upstream || null,
        ...parseTrack(track),
      })
    } else if (full.startsWith("refs/remotes/")) {
      const name = full.slice(13)
      const remote =
        sortedRemotes.find((r) => name.startsWith(`${r}/`)) ||
        name.split("/")[0]
      refs.push({ type: "remote", name, remote, target })
    } else if (full.startsWith("refs/tags/")) {
      refs.push({ type: "tag", name: full.slice(10), target })
    }
  }
  return refs
}

function parseStatus(out) {
  const parts = out.split("\0")
  const files = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (!entry) continue
    const x = entry[0]
    const file = { path: entry.slice(3), x, y: entry[1] }
    // -z format: renamed entries are "XY new\0old\0"
    if (x === "R" || x === "C") file.orig = parts[++i]
    files.push(file)
  }
  return files
}

function parseStashes(out) {
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, hash, message, time] = line.split(US)
      return { ref, hash, message, time: Number(time) }
    })
}

function parseNameStatus(out) {
  const parts = out.split("\0")
  const files = []
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i]
    if (!code) continue
    const status = code[0]
    if (status === "R" || status === "C")
      files.push({ status, orig: parts[++i], path: parts[++i] })
    else files.push({ status, path: parts[++i] })
  }
  return files
}

function parseNumstat(out) {
  const stats = new Map()
  const parts = out.split("\0")
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]
    if (!rec) continue
    const t1 = rec.indexOf("\t")
    const t2 = rec.indexOf("\t", t1 + 1)
    let file = rec.slice(t2 + 1)
    // Renames: "add\tdel\t\0old\0new\0"
    if (file === "") {
      i++
      file = parts[++i]
    }
    const add = rec.slice(0, t1)
    const del = rec.slice(t1 + 1, t2)
    stats.set(file, {
      add: add === "-" ? null : Number(add),
      del: del === "-" ? null : Number(del),
    })
  }
  return stats
}

// ---------- queries ----------

export async function snapshot({ root, gitDir }) {
  const [refs, status, head, branch, stashes, remotes] = await Promise.all([
    git(root, [
      "for-each-ref",
      `--format=${REF_FORMAT}`,
      "refs/heads",
      "refs/remotes",
      "refs/tags",
    ]),
    git(root, ["status", "--porcelain=v1", "-z", "-uall"]),
    git(root, ["rev-parse", "-q", "--verify", "HEAD"], { okCodes: [0, 1] }),
    git(root, ["symbolic-ref", "-q", "--short", "HEAD"], { okCodes: [0, 1] }),
    git(root, ["stash", "list", `--format=${STASH_FORMAT}`], {
      okCodes: [0, 128],
    }),
    git(root, ["remote"]),
  ])
  const op = repoOp(gitDir)
  const raw =
    [refs, status, head, branch, stashes, remotes]
      .map((r) => r.stdout)
      .join("\0") + (op || "")
  const remoteNames = remotes.stdout.split("\n").filter(Boolean)
  return {
    head: head.stdout.trim() || null,
    branch: branch.stdout.trim() || null,
    op,
    remotes: remoteNames,
    refs: parseRefs(refs.stdout, remoteNames),
    stashes: parseStashes(stashes.stdout),
    status: parseStatus(status.stdout),
    fingerprint: crypto.createHash("sha1").update(raw).digest("hex"),
  }
}

// Light status for repository lists: branch, tracking and dirtiness
export async function getSummary({ root, gitDir }) {
  const { stdout } = await git(root, [
    "status",
    "--porcelain=v2",
    "--branch",
    "-z",
    "-unormal",
  ])
  const summary = { branch: null, ahead: 0, behind: 0, dirty: false }
  for (const entry of stdout.split("\0")) {
    if (entry.startsWith("# branch.head ")) {
      const name = entry.slice(14)
      summary.branch = name === "(detached)" ? null : name
    } else if (entry.startsWith("# branch.ab ")) {
      const [ahead, behind] = entry.slice(12).split(" ")
      summary.ahead = Number(ahead)
      summary.behind = -Number(behind)
    } else if (entry && !entry.startsWith("#")) {
      summary.dirty = true
    }
  }
  return { ...summary, op: repoOp(gitDir) }
}

export async function getLog(root, limit, hasHead) {
  const args = [
    "log",
    "--date-order",
    `--max-count=${limit}`,
    `--format=${LOG_FORMAT}`,
    "--branches",
    "--remotes",
    "--tags",
  ]
  if (hasHead) args.push("HEAD")
  let stdout
  try {
    ;({ stdout } = await git(root, args))
  } catch (e) {
    if (!hasHead) return [] // empty repository
    throw e
  }
  return stdout
    .split(RS)
    .map((rec) => rec.replace(/^\n/, ""))
    .filter(Boolean)
    .map((rec) => {
      const [hash, parents, author, email, time, subject] = rec.split(US)
      return {
        hash,
        parents: parents ? parents.split(" ") : [],
        author,
        email,
        time: Number(time),
        subject,
      }
    })
}

export async function getCommit(root, hash) {
  const { stdout } = await git(root, [
    "show",
    "-s",
    `--format=${COMMIT_FORMAT}`,
    sha(hash),
  ])
  const [
    full,
    parents,
    author,
    email,
    time,
    committer,
    committerEmail,
    commitTime,
    ...rest
  ] = stdout.split(US)
  const parentList = parents ? parents.split(" ") : []
  // Merge commits are diffed against their first parent
  const range = parentList.length ? [parentList[0], full] : ["--root", full]
  const base = ["diff-tree", "-r", "-z", "-M", "--no-commit-id"]
  const [nameStatus, numstat] = await Promise.all([
    git(root, [...base, "--name-status", ...range]),
    git(root, [...base, "--numstat", ...range]),
  ])
  const stats = parseNumstat(numstat.stdout)
  const files = parseNameStatus(nameStatus.stdout).map((f) => ({
    ...f,
    ...(stats.get(f.path) || { add: null, del: null }),
  }))
  return {
    hash: full,
    parents: parentList,
    author,
    email,
    time: Number(time),
    committer,
    committerEmail,
    commitTime: Number(commitTime),
    message: rest.join(US).replace(/\s+$/, ""),
    files,
  }
}

export async function getCommitDiff(root, hash, file, orig) {
  sha(hash)
  const files = orig ? [orig, file] : [file]
  const parent = await git(root, ["rev-parse", "-q", "--verify", `${hash}^1`], {
    okCodes: [0, 1],
  })
  const parentHash = parent.stdout.trim()
  const args = parentHash
    ? ["diff", ...DIFF_OPTS, "-M", parentHash, hash, "--", ...files]
    : [
        "diff-tree",
        ...DIFF_OPTS,
        "-p",
        "-M",
        "--root",
        "--no-commit-id",
        hash,
        "--",
        ...files,
      ]
  return (await git(root, args)).stdout
}

export async function getWorkDiff(root, file, orig, mode) {
  if (mode === "untracked") {
    const args = ["diff", ...DIFF_OPTS, "--no-index", "--", "/dev/null", file]
    return (await git(root, args, { okCodes: [0, 1] })).stdout
  }
  const staged = mode === "staged"
  const files = staged && orig ? [orig, file] : [file]
  const args = [
    "diff",
    ...DIFF_OPTS,
    "-M",
    ...(staged ? ["--cached"] : []),
    "--",
    ...files,
  ]
  return (await git(root, args)).stdout
}

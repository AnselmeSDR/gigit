#!/usr/bin/env node
import http from "node:http"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { createApi } from "./api.js"

const PORT = Number(process.env.PORT) || 8790
const HOST = "127.0.0.1"
const BASE_URL = `http://${HOST}:${PORT}/`
const DIST_DIR = path.join(import.meta.dirname, "..", "dist")
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
}

async function serveStatic(req, res) {
  const { pathname } = new URL(req.url, BASE_URL)
  const file = path.join(
    DIST_DIR,
    pathname === "/" ? "index.html" : decodeURIComponent(pathname)
  )
  const inDist = file.startsWith(DIST_DIR + path.sep)
  if (
    req.method !== "GET" ||
    !inDist ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    res.end(
      fs.existsSync(DIST_DIR)
        ? "Introuvable"
        : "Build manquant : lance `npm run build`."
    )
    return
  }
  // Hashed assets can be cached forever, index.html must stay fresh
  const cache = pathname.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : "no-store"
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    "Cache-Control": cache,
  })
  res.end(await fsp.readFile(file))
}

const args = process.argv.slice(2)
const repoArg = args.find((a) => !a.startsWith("--"))
const startUrl = repoArg
  ? `${BASE_URL}?open=${encodeURIComponent(path.resolve(repoArg))}`
  : BASE_URL

function openBrowser(url) {
  if (args.includes("--no-open")) return
  execFile(process.platform === "darwin" ? "open" : "xdg-open", [url], () => {})
}

const api = createApi()
const server = http.createServer((req, res) =>
  api(req, res, () => serveStatic(req, res))
)

server.on("error", (e) => {
  if (e.code !== "EADDRINUSE") throw e
  console.log(`gigit tourne déjà sur ${BASE_URL}`)
  openBrowser(startUrl)
  process.exit(0)
})

server.listen(PORT, HOST, () => {
  console.log(`gigit → ${BASE_URL}`)
  openBrowser(startUrl)
})

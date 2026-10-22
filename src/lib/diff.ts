export type DiffLine = {
  kind: "add" | "del" | "ctx" | "meta"
  prefix: string
  text: string
  oldNo: number | null
  newNo: number | null
  marker: boolean
}

export type DiffHunk = { header: string; lines: DiffLine[] }

export type DiffFile = { header: string[]; hunks: DiffHunk[]; binary: boolean }

const HUNK_RE = /^(@@+) -(\d+)(?:,\d+)?(?: -\d+(?:,\d+)?)* \+(\d+)/
const CONFLICT_MARKER_RE = /^(<{7}|={7}|>{7})/

function parseHunkLines(header: string, raw: string[]): DiffLine[] {
  const m = HUNK_RE.exec(header)
  // "@@" for regular diffs, "@@@" for combined diffs (conflicts): one prefix char per parent
  const width = m ? m[1].length - 1 : 1
  let oldNo = m ? Number(m[2]) : 0
  let newNo = m ? Number(m[3]) : 0
  return raw.map((line) => {
    if (line.startsWith("\\")) {
      return {
        kind: "meta",
        prefix: "",
        text: line,
        oldNo: null,
        newNo: null,
        marker: false,
      }
    }
    const prefix = line.slice(0, width)
    const text = line.slice(width)
    const marker = CONFLICT_MARKER_RE.test(text)
    if (width > 1) {
      // Combined diff: only the new side numbering is meaningful
      if (prefix.includes("-"))
        return { kind: "del", prefix, text, oldNo: null, newNo: null, marker }
      const kind = prefix.includes("+") ? "add" : "ctx"
      return { kind, prefix, text, oldNo: null, newNo: newNo++, marker }
    }
    if (prefix === "+")
      return { kind: "add", prefix, text, oldNo: null, newNo: newNo++, marker }
    if (prefix === "-")
      return { kind: "del", prefix, text, oldNo: oldNo++, newNo: null, marker }
    return { kind: "ctx", prefix, text, oldNo: oldNo++, newNo: newNo++, marker }
  })
}

export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let file: DiffFile | null = null
  let hunk: { header: string; raw: string[] } | null = null
  const flush = () => {
    if (file && hunk) {
      file.hunks.push({
        header: hunk.header,
        lines: parseHunkLines(hunk.header, hunk.raw),
      })
    }
    hunk = null
  }
  const lines = text.split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  for (const line of lines) {
    if (line.startsWith("diff ")) {
      flush()
      file = { header: [line], hunks: [], binary: false }
      files.push(file)
      continue
    }
    if (!file) {
      file = { header: [], hunks: [], binary: false }
      files.push(file)
    }
    if (line.startsWith("@@")) {
      flush()
      hunk = { header: line, raw: [] }
      continue
    }
    if (hunk) {
      hunk.raw.push(line)
      continue
    }
    file.header.push(line)
    if (/^(Binary files|GIT binary patch)/.test(line)) file.binary = true
  }
  flush()
  return files
}

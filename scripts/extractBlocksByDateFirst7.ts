import fs from "fs";
import { DateTime } from "luxon";

const [, , csvPath = "data/october_availability.csv", startISO = "2025-10-01"] = process.argv;

// Matches: 08:00–10:00, 8:00-10:00, 8AM–10AM, 3PM-5:30PM (hyphen or en dash, optional minutes, optional AM/PM)
const RANGE_RE =
  /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\b/;

function to24hMinutes(hStr: string, mStr?: string, ampm?: string) {
  let h = parseInt(hStr, 10);
  const m = mStr ? parseInt(mStr, 10) : 0;
  const mer = ampm?.toLowerCase();

  if (mer === "am") {
    if (h === 12) h = 0;
  } else if (mer === "pm") {
    if (h !== 12) h += 12;
  }
  return h * 60 + m;
}

function parseTimeRange(label: string) {
  const m = label.match(RANGE_RE);
  if (!m) return null;
  const startMin = to24hMinutes(m[1], m[2], m[3]);
  const endMin = to24hMinutes(m[4], m[5], m[6]);
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) return null;
  return { startMin, endMin };
}

// Find the row (among the first ~10) that contains the most time-range tokens.
// Some Google Form exports put the “slot” headers on the 2nd row, etc.
function detectHeaderRow(lines: string[], lookAhead = 10): string[] | null {
  let best: { idx: number; hits: number; cols: string[] } | null = null;
  for (let i = 0; i < Math.min(lookAhead, lines.length); i++) {
    const cols = splitCsvLine(lines[i]);
    const hits = cols.reduce((n, c) => (RANGE_RE.test(c) ? n + 1 : n), 0);
    if (!best || hits > best.hits) best = { idx: i, hits, cols };
  }
  return best && best.hits > 0 ? best.cols : null;
}

// Very lightweight CSV splitter good enough for header rows (handles simple quotes)
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function main() {
  const csv = fs.readFileSync(csvPath, "utf8");
  const lines = csv.split(/\r?\n/).filter(Boolean);

  const headerCols = detectHeaderRow(lines);
  if (!headerCols) {
    console.log("No time-range headers detected. Wrote 0 rows.");
    fs.writeFileSync("data/blocks.byDate.first7.json", "[]");
    return;
  }

  const ranges = headerCols
    .map((h) => h.replace(/\s+/g, " ").trim())
    .map(parseTimeRange)
    .filter(Boolean) as { startMin: number; endMin: number }[];

  const start = DateTime.fromISO(startISO);
  const out: { dateISO: string; startMin: number; endMin: number; locked: boolean }[] = [];

  for (let i = 0; i < 7; i++) {
    const dateISO = start.plus({ days: i }).toISODate()!;
    for (const r of ranges) {
      out.push({ dateISO, startMin: r.startMin, endMin: r.endMin, locked: false });
    }
  }

  fs.writeFileSync("data/blocks.byDate.first7.json", JSON.stringify(out, null, 2));
  console.log(`Wrote data/blocks.byDate.first7.json with ${out.length} rows (days=${7}, slots=${ranges.length}).`);
}

main();
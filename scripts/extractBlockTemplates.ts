// scripts/extractBlockTemplates.ts
/**
 * Robust extractor for weekly block templates from a Google Forms CSV export.
 *
 * Fixes:
 * - Reads the ENTIRE FIRST CSV RECORD (header) even if it spans multiple lines
 *   because quoted cells can contain embedded newlines.
 * - Supports columns where a single cell contains:
 *       "Wednesday, October 1\n8AM - 10AM"
 *   OR adjacent-pair columns like:
 *       "7AM - 10AM","Thursday, October 2"
 *   (either order).
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/extractBlockTemplates.ts \
 *     data/october_availability.csv --out data/blockTemplates.json --year 2025 --month 10
 */

import * as fs from "fs";
import * as path from "path";

type Template = {
  day: number;       // 0=Mon..6=Sun (Mon-first)
  startMin: number;  // minutes from 00:00
  endMin: number;
  label?: string;
};

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: ts-node scripts/extractBlockTemplates.ts <csvPath> --out <jsonOut> --year 2025 --month 10");
  process.exit(1);
}

function getArg(name: string, fallback?: string) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const csvPath = args[0];
const outPath = getArg("out", "data/blockTemplates.json")!;
const year = Number(getArg("year"));
const month = Number(getArg("month")); // 1..12

if (!year || !month) {
  console.error("Please pass --year and --month (e.g., --year 2025 --month 10).");
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(csvPath, "utf8");

/**
 * Read the FIRST CSV RECORD (header row), honoring quoted fields that can contain commas and newlines.
 * Returns the raw header record as a string (without the trailing newline that ends the record).
 */
function readFirstCsvRecord(input: string): string {
  let i = 0;
  const n = input.length;
  let inQuotes = false;

  while (i < n) {
    const ch = input[i];

    if (ch === '"') {
      // If we're inside quotes and see a double-quote, check for escaped double-quote ("")
      if (inQuotes) {
        if (i + 1 < n && input[i + 1] === '"') {
          i += 2; // skip escaped quote
          continue;
        } else {
          inQuotes = false; // closing quote
          i++;
          continue;
        }
      } else {
        inQuotes = true; // opening quote
        i++;
        continue;
      }
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      // End of first record
      // Consume a single \r, a single \n, or the pair \r\n
      let end = i;
      if (ch === "\r" && i + 1 < n && input[i + 1] === "\n") {
        end = i; // keep CRLF together
      }
      return input.slice(0, i);
    }

    i++;
  }

  // If we reach here, the whole file is a single record (unlikely but handle it)
  return input;
}

/**
 * Tokenize a CSV record (single line logically), handling quotes + escaped quotes.
 * Returns an array of field strings (without surrounding quotes; double quotes unescaped).
 */
function tokenizeCsvRecord(rec: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  const n = rec.length;
  let inQuotes = false;

  while (i < n) {
    const ch = rec[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && rec[i + 1] === '"') {
          cur += '"'; // escaped double-quote
          i += 2;
        } else {
          inQuotes = false; // closing quote
          i++;
        }
      } else {
        cur += ch;
        i++;
      }
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  out.push(cur);
  return out;
}

// ---- Parse helpers ----
const WEEKDAY_TO_IDX: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
};

function parseTimeTokenToMin(token: string): number | null {
  // "8AM", "11:30PM" (case-insensitive, optional minutes)
  const m = token.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3].toUpperCase();
  if (ampm === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return h * 60 + min;
}

function parseTimeRange(s: string): { startMin: number; endMin: number } | null {
  // "7AM - 10AM", "3PM - 5:30PM", "6:30PM - 9:30PM"
  const m = s.trim().match(/^(\d{1,2}(?::\d{2})?\s*[AP]M)\s*-\s*(\d{1,2}(?::\d{2})?\s*[AP]M)$/i);
  if (!m) return null;
  const start = parseTimeTokenToMin(m[1]);
  const end = parseTimeTokenToMin(m[2]);
  if (start == null || end == null) return null;
  return { startMin: start, endMin: end };
}

function parseDateText(s: string): { weekdayIdx: number; mon: number; dayNum: number } | null {
  // Matches "Thursday, October 2" (tolerates extra spaces after comma)
  const m = s.match(/^\s*([A-Za-z]+),\s+([A-Za-z]+)\s+(\d{1,2})\s*$/);
  if (!m) return null;
  const wd = m[1].toLowerCase();
  const monName = m[2].toLowerCase();
  const dayNum = Number(m[3]);
  const weekdayIdx = WEEKDAY_TO_IDX[wd];
  if (weekdayIdx == null) return null;

  const monIdx =
    [
      "january","february","march","april","may","june",
      "july","august","september","october","november","december",
    ].indexOf(monName) + 1;
  if (!monIdx) return null;

  return { weekdayIdx, mon: monIdx, dayNum };
}

// ---- Extract templates from header fields ----
const headerRec = readFirstCsvRecord(raw);
const fields = tokenizeCsvRecord(headerRec).map((s) => s.trim());

// We will gather pairs from two patterns:
// A) single field contains BOTH date and time separated by newline(s)
// B) adjacent fields where one is a date and the other is a time range (any order)
type Pair = { weekdayIdx: number; startMin: number; endMin: number };

const pairs: Pair[] = [];

// A) One-cell case: "Wednesday, October 1\n8AM - 10AM"  (order might be reversed)
for (const f of fields) {
  // Normalize internal newlines to '\n' and split
  const parts = f.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Try all 2-part combinations (date then time, time then date)
    for (let i = 0; i < parts.length - 1; i++) {
      const a = parts[i];
      const b = parts[i + 1];

      const dA = parseDateText(a);
      const rA = parseTimeRange(a);
      const dB = parseDateText(b);
      const rB = parseTimeRange(b);

      // date then time
      if (dA && rB) {
        if (dA.mon === month) {
          pairs.push({ weekdayIdx: dA.weekdayIdx, startMin: rB.startMin, endMin: rB.endMin });
        }
      }
      // time then date
      if (rA && dB) {
        if (dB.mon === month) {
          pairs.push({ weekdayIdx: dB.weekdayIdx, startMin: rA.startMin, endMin: rA.endMin });
        }
      }
    }
  }
}

// B) Adjacent-field case
for (let i = 0; i < fields.length - 1; i++) {
  const a = fields[i];
  const b = fields[i + 1];

  const dA = parseDateText(a);
  const rA = parseTimeRange(a);
  const dB = parseDateText(b);
  const rB = parseTimeRange(b);

  // time then date
  if (rA && dB) {
    if (dB.mon === month) {
      pairs.push({ weekdayIdx: dB.weekdayIdx, startMin: rA.startMin, endMin: rA.endMin });
    }
    continue;
  }
  // date then time
  if (dA && rB) {
    if (dA.mon === month) {
      pairs.push({ weekdayIdx: dA.weekdayIdx, startMin: rB.startMin, endMin: rB.endMin });
    }
    i++; // consumed next
  }
}

// Dedupe weekly templates by (weekday,start,end)
const key = (p: Pair) => `${p.weekdayIdx}:${p.startMin}:${p.endMin}`;
const uniq = new Map<string, Template>();
for (const p of pairs) {
  const k = key(p);
  if (!uniq.has(k)) {
    uniq.set(k, { day: p.weekdayIdx, startMin: p.startMin, endMin: p.endMin });
  }
}

const templates = Array.from(uniq.values()).sort((a, b) => a.day - b.day || a.startMin - b.startMin);

// Write output
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(templates, null, 2), "utf8");
console.log(`✅  Extracted ${templates.length} unique weekly templates -> ${outPath}`);

// Debug hint if still zero
if (templates.length === 0) {
  console.warn(
    "⚠ No templates found. Check that your header columns contain either:\n" +
      '  - A single cell like "Wednesday, October 1\\n8AM - 10AM" OR\n' +
      '  - Adjacent cells like "7AM - 10AM","Thursday, October 2".\n' +
      "Also confirm you passed --year and --month that match the header month names."
  );
}
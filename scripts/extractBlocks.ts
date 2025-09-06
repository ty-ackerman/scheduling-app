#!/usr/bin/env ts-node
/**
 * Extract day-specific schedule blocks from a facilitator availability CSV.
 *
 * Input headers examples (very flexible):
 *   "Mon Sep 2 8:00–12:00"
 *   "Tuesday 3PM-5:30PM"
 *   "Wed 18:30–21:00"
 *
 * Output: data/blocks.october.byDay.json
 *   [
 *     { "day": "MON", "label": "07:00–10:00", "start": "07:00", "end": "10:00" },
 *     { "day": "MON", "label": "08:00–10:00", "start": "08:00", "end": "10:00" },
 *     { "day": "TUE", "label": "15:00–18:00", "start": "15:00", "end": "18:00" },
 *     ...
 *   ]
 *
 * Notes:
 *  - Blocks are unique **per day** via (day,start,end).
 *  - Sorted by weekday order (Mon→Sun) and time.
 *  - No frequency/count field is written.
 *
 * Run:
 *   npx ts-node --project tsconfig.scripts.json scripts/extractBlocks.ts data/october_availability.csv
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";

type DayKey = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
type Block = { day: DayKey; label: string; start: string; end: string };

const INPUT = path.resolve(process.argv[2] || "");
if (!INPUT) {
  console.error("Usage: ts-node scripts/extractBlocks.ts <path/to/file.csv>");
  process.exit(1);
}

const OUT_DIR = path.resolve("data");
const OUT_PATH = path.join(OUT_DIR, "blocks.october.byDay.json");

const DAY_ORDER: DayKey[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_MAP: Record<string, DayKey> = {
  MONDAY: "MON", MON: "MON",
  TUESDAY: "TUE", TUE: "TUE", TUES: "TUE",
  WEDNESDAY: "WED", WED: "WED",
  THURSDAY: "THU", THU: "THU",
  FRIDAY: "FRI", FRI: "FRI",
  SATURDAY: "SAT", SAT: "SAT",
  SUNDAY: "SUN", SUN: "SUN",
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function pad2(n: number) { return n.toString().padStart(2, "0"); }
function clean(s: string) { return s.replace(/\s+/g, " ").trim(); }

function parseClock(raw: string): { hour: number; minute: number } | null {
  const s = clean(raw).toUpperCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = m[3];

  if (suffix === "AM") {
    if (hour === 12) hour = 0;
  } else if (suffix === "PM") {
    if (hour !== 12) hour += 12;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}
function fmt24(h: number, m: number) { return `${pad2(h)}:${pad2(m)}`; }

function findDayToken(header: string): DayKey | null {
  const up = header.toUpperCase();
  // try simple word tokens first
  for (const token in DAY_MAP) {
    if (new RegExp(`\\b${token}\\b`, "i").test(up)) return DAY_MAP[token];
  }
  // fallback: leading 3 letters like "Mon", "Tue"
  const m = up.match(/^(MON|TUE|WED|THU|FRI|SAT|SUN)\b/);
  return m ? (m[1] as DayKey) : null;
}

function extractTimeRange(header: string): { start: string; end: string } | null {
  const SEP = "—";
  const normalized = clean(header)
    .replace(/\s+to\s+/gi, SEP)
    .replace(/[–—-]/g, SEP);

  const token = String.raw`(?:\d{1,2}(?::\d{2})?\s*(?:[AaPp][Mm])?)`;
  const rx = new RegExp(`${token}\\s*${SEP}\\s*${token}`);
  const m = normalized.match(rx);
  if (!m) return null;

  const parts = normalized.split(SEP);
  if (parts.length < 2) return null;

  const left = parts[parts.length - 2].trim().split(/\s+/).pop() || "";
  const right = parts[parts.length - 1].trim().split(/\s+/)[0] || "";

  const a = parseClock(left);
  const b = parseClock(right);
  if (!a || !b) return null;

  return { start: fmt24(a.hour, a.minute), end: fmt24(b.hour, b.minute) };
}

(async () => {
  try {
    const raw = fs.readFileSync(INPUT);
    const records = parse(raw, { bom: true, columns: true, skip_empty_lines: true }) as Record<string, string>[];
    const headers = Object.keys(records[0] ?? {});
    const uniq = new Map<string, Block>(); // key = `${day}|${start}|${end}`

    for (const h of headers) {
      const day = findDayToken(h);
      const range = extractTimeRange(h);
      if (!day || !range) continue;
      const key = `${day}|${range.start}|${range.end}`;
      if (!uniq.has(key)) {
        uniq.set(key, { day, label: `${range.start}–${range.end}`, start: range.start, end: range.end });
      }
    }

    const blocks = Array.from(uniq.values()).sort((a, b) => {
      const od = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
      if (od !== 0) return od;
      return a.start === b.start ? (a.end < b.end ? -1 : 1) : (a.start < b.start ? -1 : 1);
    });

    ensureDir(OUT_DIR);
    fs.writeFileSync(OUT_PATH, JSON.stringify(blocks, null, 2));
    console.log(`✅ Wrote ${blocks.length} day-specific blocks → ${path.relative(process.cwd(), OUT_PATH)}`);
  } catch (err: any) {
    console.error("❌ Failed to extract day-specific blocks.");
    console.error(err?.message || err);
    try {
      const sample = fs.readFileSync(INPUT, "utf8").split("\n").slice(0, 5).join("\n");
      console.error("\nFirst lines of the CSV:\n" + sample);
    } catch {}
    process.exit(1);
  }
})();
// scripts/extractTemplates.ts
/**
 * Robust extractor for weekly BlockTemplates from a Google Forms CSV
 * where header cells can span multiple lines, e.g.:
 *   "Thursday, October 2
 *    7AM - 10AM"
 *
 * We read the FIRST CSV RECORD (not just the first physical line),
 * honoring quotes and embedded newlines per RFC4180.
 *
 * We support these shapes per header *cell*:
 *   A) Single cell contains BOTH weekday and time range (across lines).
 *      e.g. "Friday, October 3\n6:30PM - 9:30PM"
 *   B) Adjacent pair across two cells (either order):
 *      e.g.  "7AM - 10AM" , "Thursday, October 2"
 *            "Thursday, October 2" , "7AM - 10AM"
 *
 * Non-schedule columns (Timestamp, Name, Notes, etc.) are ignored.
 * We dedupe by (weekday, startMin, endMin) and sort Mon→Sun then by time.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/extractTemplates.ts data/october_availability.csv
 * Output:
 *   data/blockTemplates.json
 */

import * as fs from "fs";
import * as path from "path";
import { parseRangeToMinutes, WEEKDAY_TO_NUM } from "../src/lib/timeparse";

function readFirstCsvRecord(filePath: string): string[] {
  const text = fs.readFileSync(filePath, "utf8");
  const out: string[] = [];
  let i = 0;
  let cell = "";
  let inQuote = false;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"') {
      // Handle escaped double-quote ("")
      if (inQuote && text[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      inQuote = !inQuote;
      i++;
      continue;
    }

    if (ch === "," && !inQuote) {
      out.push(cell);
      cell = "";
      i++;
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuote) {
      // End of the first CSV record
      // Normalize CRLF/CR
      while (text[i] === "\r" || text[i] === "\n") i++;
      out.push(cell);
      cell = "";
      break;
    }

    cell += ch;
    i++;
  }

  // If we hit EOF without newline, push remaining cell
  if (cell.length && out.length === 0) out.push(cell);

  // Trim trailing \r in cells and keep embedded newlines
  return out.map(s => s.replace(/\r/g, ""));
}

function normalizeSpaces(s: string) {
  return s.replace(/[ \t]+/g, " ").trim();
}

/** Find weekday anywhere (prefers full names) → 1..7 (Mon..Sun) or null */
function findWeekdayAnywhere(s: string): number | null {
  const text = s.toUpperCase();
  const candidates = [
    "MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY",
    "MON","TUE","TUES","WED","THU","THUR","THURS","FRI","SAT","SUN"
  ];
  for (const cand of candidates) {
    const re = new RegExp(`\\b${cand}\\b`);
    if (re.test(text)) {
      return WEEKDAY_TO_NUM[cand] ?? null;
    }
  }
  return null;
}

/** Find the first time range anywhere inside the cell */
function findTimeRangeInCell(cell: string): { startMin: number; endMin: number } | null {
  const lines = cell.split("\n").map(s => normalizeSpaces(s)).filter(Boolean);
  for (const ln of lines) {
    const parsed = parseRangeToMinutes(ln);
    if (parsed) return parsed;
  }
  // Fallback: permissive scan across the entire cell
  const permissive = /([0-9]{1,2}(?::[0-5][0-9])?\s*(?:AM|PM)?)\s*[-–]\s*([0-9]{1,2}(?::[0-5][0-9])?\s*(?:AM|PM)?)/i;
  const m = permissive.exec(cell);
  if (m) {
    const p = parseRangeToMinutes(`${m[1]} - ${m[2]}`);
    if (p) return p;
  }
  return null;
}

type TemplateKey = { weekday: number; startMin: number; endMin: number };

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Provide path to CSV, e.g. data/october_availability.csv");
    process.exit(1);
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const headers = readFirstCsvRecord(inputPath);
  if (headers.length === 0) {
    console.error("CSV appears empty (no header record).");
    process.exit(1);
  }

  const seen = new Set<string>();
  const result: TemplateKey[] = [];
  let recognized = 0;

  function addTemplate(weekday: number, startMin: number, endMin: number) {
    const key = `${weekday}:${startMin}:${endMin}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ weekday, startMin, endMin });
    }
    recognized++;
  }

  // Pass 1: single-cell headers that contain BOTH bits (weekday + time)
  const isScheduleCell: boolean[] = headers.map(h => {
    const wd = findWeekdayAnywhere(h);
    const tr = findTimeRangeInCell(h);
    if (wd && tr) {
      addTemplate(wd, tr.startMin, tr.endMin);
      return true;
    }
    return false;
  });

  // Pass 2: adjacent pairs (either order), skipping cells already used in Pass 1
  for (let i = 0; i < headers.length - 1; i++) {
    if (isScheduleCell[i]) continue;
    const a = headers[i];
    const b = headers[i + 1];

    const aWd = findWeekdayAnywhere(a);
    const aTr = findTimeRangeInCell(a);
    const bWd = findWeekdayAnywhere(b);
    const bTr = findTimeRangeInCell(b);

    // A=weekday, B=time
    if (aWd && bTr) {
      addTemplate(aWd, bTr.startMin, bTr.endMin);
      i++; // consume pair
      continue;
    }
    // A=time, B=weekday
    if (aTr && bWd) {
      addTemplate(bWd, aTr.startMin, aTr.endMin);
      i++; // consume pair
      continue;
    }
  }

  // Sort Mon→Sun then time ascending
  result.sort((x, y) => (x.weekday - y.weekday) || (x.startMin - y.startMin) || (x.endMin - y.endMin));

  const outPath = path.join("data", "blockTemplates.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`✅  Wrote ${result.length} unique templates to ${outPath} (recognized ${recognized} schedule headers; scanned ${headers.length} cells)`);

  if (result.length === 0) {
    console.warn("⚠ No schedule headers recognized. Run the debug print below and paste it to me if needed.");
  }
}

main();
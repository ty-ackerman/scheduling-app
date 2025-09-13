/**
 * scripts/migrateDatedBlocksFromCSV.ts
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/migrateDatedBlocksFromCSV.ts data/availability.csv 2025-10
 *
 * This reads the CSV headers, extracts pairs like:
 *   "7AM - 10AM","Thursday, October 2"
 *   "1PM - 4:30PM","Sunday, October 5 CLASS"
 *
 * And upserts DatedBlock rows for the given month (YYYY-MM).
 * It ignores staff rows and only uses header pairs to define the time blocks.
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

type HeaderPair = {
  timeRaw: string;   // e.g. "7AM - 10AM"
  dateRaw: string;   // e.g. "Thursday, October 2"  or "Sunday, October 5 CLASS"
};

type ParsedSlot = {
  dateISO: string;   // "2025-10-02"
  startMin: number;  // minutes from midnight
  endMin: number;
  isClass: boolean;
  label?: string;
};

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function toMinutes(h: number, m: number): number {
  return h * 60 + m;
}

function parseTimePiece(piece: string): { h: number; m: number } | null {
  // Accept forms like "7AM", "10:30PM", "8 PM", "11:15 pm"
  const s = piece.trim().replace(/\s+/g, "");
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?([aApP][mM])$/);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3].toLowerCase();
  if (ampm === "am") {
    if (hh === 12) hh = 0;
  } else {
    // pm
    if (hh !== 12) hh += 12;
  }
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { h: hh, m: mm };
}

function parseTimeRange(raw: string): { startMin: number; endMin: number } | null {
  // "7AM - 10AM" or "1PM-4:30PM"
  const parts = raw.split("-").map(s => s.trim());
  if (parts.length !== 2) return null;
  const a = parseTimePiece(parts[0]);
  const b = parseTimePiece(parts[1]);
  if (!a || !b) return null;
  const startMin = toMinutes(a.h, a.m);
  const endMin = toMinutes(b.h, b.m);
  if (endMin <= startMin) return null; // we don't handle overnight blocks in this script
  return { startMin, endMin };
}

function normalizeDateCell(raw: string): { weekday: string; monthName: string; dayNum: number; isClass: boolean } | null {
  // Handles:
  //  "Thursday, October 2"
  //  "Sunday, October 5 CLASS"
  const s = raw.trim();
  const isClass = /CLASS/i.test(s);
  const stripped = s.replace(/\bCLASS\b/ig, "").trim();

  // Expect "<Weekday>, <Month> <day>"
  const m = stripped.match(/^([A-Za-z]+),\s+([A-Za-z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  return {
    weekday: m[1],
    monthName: m[2],
    dayNum: parseInt(m[3], 10),
    isClass,
  };
}

function monthNameToNumber(name: string): number | null {
  const map: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  const n = map[name.toLowerCase()];
  return n ?? null;
}

function parseHeaderPairs(headerLine: string): HeaderPair[] {
  // We only care about headers that come in adjacent pairs:
  //   time, date
  // The CSV often has earlier columns for timestamp/name/notes—skip those by detecting valid pairs.
  // We'll do a lightweight CSV split for the header line.
  const cols = splitCsvLine(headerLine);
  const pairs: HeaderPair[] = [];

  for (let i = 0; i + 1 < cols.length; i += 1) {
    const timeCand = cols[i]?.trim();
    const dateCand = cols[i + 1]?.trim();
    if (!timeCand || !dateCand) continue;

    // Heuristic: timeCol must contain "AM" or "PM"
    if (!/(am|pm)/i.test(timeCand)) continue;

    // dateCol must contain a weekday and a month name
    if (!/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i.test(dateCand)) continue;
    if (!/January|February|March|April|May|June|July|August|September|October|November|December/i.test(dateCand)) continue;

    // Looks like a pair
    pairs.push({ timeRaw: timeCand, dateRaw: dateCand });
    // Skip ahead by one more so we don't accidentally reuse the date column as a time column
    i += 1;
  }
  return pairs;
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV splitter for a single line (handles quoted commas).
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // toggle quoted state OR escaped quote
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const csvPath = process.argv[2];
  const yymm = process.argv[3]; // "YYYY-MM"

  if (!csvPath || !yymm) {
    die("Usage: ts-node scripts/migrateDatedBlocksFromCSV.ts <csvPath> <YYYY-MM>");
  }

  const abs = path.resolve(csvPath);
  if (!fs.existsSync(abs)) die(`CSV not found: ${abs}`);

  const raw = fs.readFileSync(abs, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) die("CSV is empty");

  // Parse month
  const dtMonth = DateTime.fromFormat(yymm, "yyyy-LL");
  if (!dtMonth.isValid) die(`Invalid month argument: ${yymm} (expected YYYY-MM)`);

  // Ensure Month row exists
  let monthRow = await prisma.month.findFirst({
    where: { year: dtMonth.year, month: dtMonth.month },
  });
  if (!monthRow) {
    monthRow = await prisma.month.create({
      data: { year: dtMonth.year, month: dtMonth.month, status: "DRAFT" },
    });
  }

  // Parse header pairs from header line
  const header = lines[0];
  const pairs = parseHeaderPairs(header);

  if (pairs.length === 0) {
    console.log("No header pairs detected. Nothing to insert.");
    process.exit(0);
  }

  // Build ParsedSlot list
  const slots: ParsedSlot[] = [];
  for (const p of pairs) {
    const tr = parseTimeRange(p.timeRaw);
    const dc = normalizeDateCell(p.dateRaw);
    if (!tr || !dc) continue;

    const monthNum = monthNameToNumber(dc.monthName);
    if (!monthNum) continue;

    // Must match the requested month
    if (monthNum !== dtMonth.month) continue;

    const day = dc.dayNum;
    const date = DateTime.fromObject({ year: dtMonth.year, month: monthNum, day });
    if (!date.isValid) continue;

    slots.push({
      dateISO: date.toISODate()!,
      startMin: tr.startMin,
      endMin: tr.endMin,
      isClass: dc.isClass,
      label: undefined, // can derive a label if desired; leave empty for now
    });
  }

  // Deduplicate exact duplicates (same dateISO + startMin + endMin)
  const uniqKey = (s: ParsedSlot) => `${s.dateISO}|${s.startMin}|${s.endMin}`;
  const seen = new Set<string>();
  const uniqueSlots = slots.filter(s => {
    const k = uniqKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (uniqueSlots.length === 0) {
    console.log("0 unique DatedBlocks to upsert for", yymm);
    process.exit(0);
  }

  console.log(`Upserting ${uniqueSlots.length} DatedBlocks for ${yymm} …`);

  let created = 0, skipped = 0;
  for (const s of uniqueSlots) {
    // If an identical row already exists for this month/date/time, skip
    const exists = await prisma.datedBlock.findFirst({
      where: {
        monthId: monthRow.id,
        dateISO: s.dateISO,
        startMin: s.startMin,
        endMin: s.endMin,
      },
      select: { id: true },
    });

    if (exists) {
      skipped++;
      continue;
    }

    await prisma.datedBlock.create({
      data: {
        monthId: monthRow.id,
        dateISO: s.dateISO,
        startMin: s.startMin,
        endMin: s.endMin,
        isClass: s.isClass,
        label: s.label ?? null,
        locked: false,
      },
    });
    created++;
  }

  console.log(`Done. Created=${created}, Skipped=${skipped}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
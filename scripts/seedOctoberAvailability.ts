/* scripts/seedOctoberAvailability.ts
 * Seed October (1–28) facilitator availability from data/availability.csv.
 * - Handles two shapes:
 *    A) "7AM - 10AM","Thursday, October 2"
 *    B) "Tuesday, October 7 CLASS\n6PM - 7:15PM"
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient, MonthStatus } from "@prisma/client";

const prisma = new PrismaClient();

// ---- Config ----
const CSV_PATH = path.resolve("data/availability.csv");
const TARGET_YEAR = 2025;
const TARGET_MONTH = 10; // October
const DAY_RANGE = { start: 1, end: 28 }; // inclusive
const PLACEHOLDER_FACILITATORS = [
  { email: "fac-placeholder-1@alter.local", name: "Facilitator One" },
  { email: "fac-placeholder-2@alter.local", name: "Facilitator Two" },
  { email: "fac-placeholder-3@alter.local", name: "Facilitator Three" },
];

// ---- Utils ----
function toMinutes(h: number, m: number, ampm: string): number {
  let hh = h % 12;
  if (ampm.toLowerCase() === "pm") hh += 12;
  return hh * 60 + m;
}

function parseTimeRange(s: string): { startMin: number; endMin: number } | null {
  // e.g. "7AM - 10AM" | "6PM - 7:15PM" | "1:30PM - 4:30PM"
  const rx = /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*$/i;
  const m = s.match(rx);
  if (!m) return null;
  const h1 = parseInt(m[1], 10);
  const min1 = m[2] ? parseInt(m[2], 10) : 0;
  const ampm1 = m[3];
  const h2 = parseInt(m[4], 10);
  const min2 = m[5] ? parseInt(m[5], 10) : 0;
  const ampm2 = m[6];

  const startMin = toMinutes(h1, min1, ampm1);
  const endMin = toMinutes(h2, min2, ampm2);
  if (endMin <= startMin) return null; // sanity
  return { startMin, endMin };
}

// Monday=1 .. Sunday=7
function dayIndexFromDate(y: number, m: number, d: number): number {
  const js = new Date(Date.UTC(y, m - 1, d));
  const dow = js.getUTCDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow; // Mon=1..Sun=7
}

function extractDayNumber(dateStr: string): number | null {
  // Accept things like "Thursday, October 2", "Tue, Oct 7", etc.
  // We only need the day number after "October".
  const m = dateStr.match(/october\s+(\d{1,2})/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function looksLikeDateCell(s: string): boolean {
  return /october\s+\d{1,2}/i.test(s);
}

function looksLikeTimeCell(s: string): boolean {
  return /\b(am|pm)\b/i.test(s) && /\-/.test(s);
}

function normalizeCell(s: string): string {
  return s.replace(/\r/g, "").trim();
}

// CSV splitter that tolerates quoted commas and newlines
function splitCsvIntoCells(csvText: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (ch === '"' && !inQuotes) {
      inQuotes = true;
      continue;
    }
    if (ch === '"' && inQuotes) {
      if (next === '"') {
        // Escaped quote
        cur += '"';
        i++;
        continue;
      } else {
        inQuotes = false;
        continue;
      }
    }
    if (!inQuotes && ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(normalizeCell);
}

// Parse “A” shape: TIME then DATE (cells are adjacent)
function parsePairs_TimeThenDate(cells: string[]) {
  type Item = { day: number; startMin: number; endMin: number; isClass: boolean; label?: string | null };
  const items: Item[] = [];

  for (let i = 0; i < cells.length - 1; i++) {
    const a = cells[i];
    const b = cells[i + 1];
    if (!looksLikeTimeCell(a) || !looksLikeDateCell(b)) continue;

    const time = parseTimeRange(a.replace(/\s+/g, " "));
    if (!time) continue;

    const dayNum = extractDayNumber(b);
    if (!dayNum || dayNum < DAY_RANGE.start || dayNum > DAY_RANGE.end) continue;

    // Optional CLASS label (rare in this shape, but we’ll catch “CLASS” in either cell)
    const isClass = /class/i.test(a) || /class/i.test(b);

    items.push({
      day: dayIndexFromDate(TARGET_YEAR, TARGET_MONTH, dayNum),
      startMin: time.startMin,
      endMin: time.endMin,
      isClass,
      label: isClass ? "CLASS" : null,
    });

    i++; // consume the pair
  }

  return items;
}

// Parse “B” shape: DATE (maybe with CLASS) then newline then TIME
function parseDateThenTimeBlocks(cells: string[]) {
  type Item = { day: number; startMin: number; endMin: number; isClass: boolean; label?: string | null };
  const items: Item[] = [];

  for (const cell of cells) {
    if (!looksLikeDateCell(cell)) continue;

    // Example cell:
    // "Tuesday, October 7 CLASS\n6PM - 7:15PM"
    const parts = cell.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const header = parts[0];
    const timeStr = parts.slice(1).join(" ").replace(/\s+/g, " "); // in case multiple lines

    const dayNum = extractDayNumber(header);
    if (!dayNum || dayNum < DAY_RANGE.start || dayNum > DAY_RANGE.end) continue;

    const time = parseTimeRange(timeStr);
    if (!time) continue;

    const isClass = /class/i.test(header) || /class/i.test(timeStr);

    items.push({
      day: dayIndexFromDate(TARGET_YEAR, TARGET_MONTH, dayNum),
      startMin: time.startMin,
      endMin: time.endMin,
      isClass,
      label: isClass ? "CLASS" : null,
    });
  }

  return items;
}

async function main() {
  console.log("Reading CSV:", CSV_PATH);
  if (!fs.existsSync(CSV_PATH)) {
    console.error("CSV not found at", CSV_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const cells = splitCsvIntoCells(raw);

  const itemsA = parsePairs_TimeThenDate(cells);
  const itemsB = parseDateThenTimeBlocks(cells);

  // Merge and de-dupe by (day,start,end,isClass)
  const keyOf = (x: { day: number; startMin: number; endMin: number; isClass: boolean }) =>
    `${x.day}-${x.startMin}-${x.endMin}-${x.isClass ? 1 : 0}`;

  const mergedMap = new Map<string, { day: number; startMin: number; endMin: number; isClass: boolean; label?: string | null }>();
  [...itemsA, ...itemsB].forEach((it) => mergedMap.set(keyOf(it), it));
  const blocks = Array.from(mergedMap.values());

  console.log(`Parsed ${blocks.length} unique block entries for Oct ${DAY_RANGE.start}-${DAY_RANGE.end}.`);

  // Ensure Month(2025-10)
  let monthRow = await prisma.month.findUnique({
    where: { year_month: { year: TARGET_YEAR, month: TARGET_MONTH } },
  });
  if (!monthRow) {
    monthRow = await prisma.month.create({
      data: { year: TARGET_YEAR, month: TARGET_MONTH, status: MonthStatus.DRAFT },
    });
    console.log("Created Month row for 2025-10");
  } else {
    console.log("Using existing Month row for 2025-10");
  }

  // Upsert Blocks
  const upsertedBlocks: { id: string; day: number; startMin: number; endMin: number }[] = [];
  for (const b of blocks) {
    const existing = await prisma.block.findFirst({
      where: {
        day: b.day,
        startMin: b.startMin,
        endMin: b.endMin,
        isClass: b.isClass,
      },
      select: { id: true, day: true, startMin: true, endMin: true },
    });

    if (existing) {
      upsertedBlocks.push(existing);
    } else {
      const created = await prisma.block.create({
        data: {
          day: b.day,
          startMin: b.startMin,
          endMin: b.endMin,
          isClass: b.isClass,
          label: b.label ?? null,
          locked: false,
        },
        select: { id: true, day: true, startMin: true, endMin: true },
      });
      upsertedBlocks.push(created);
    }
  }
  console.log(`Upserted/Found ${upsertedBlocks.length} Blocks.`);

  // Ensure placeholder facilitator users
  const facilitatorIds: string[] = [];
  for (const u of PLACEHOLDER_FACILITATORS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        rolesJson: ["FACILITATOR"] as any,
      },
      update: {
        rolesJson: ["FACILITATOR"] as any,
      },
      select: { id: true },
    });
    facilitatorIds.push(user.id);
  }
  console.log(`Ensured ${facilitatorIds.length} placeholder facilitators.`);

  // Seed Availability: make each placeholder facilitator available for all blocks in this month
  let createdCount = 0;
  for (const userId of facilitatorIds) {
    for (const b of upsertedBlocks) {
      await prisma.availability.upsert({
        where: {
          userId_monthId_blockId: {
            userId,
            monthId: monthRow.id,
            blockId: b.id,
          },
        },
        update: { everyWeek: false },
        create: {
          userId,
          monthId: monthRow.id,
          blockId: b.id,
          everyWeek: false,
        },
      });
      createdCount++;
    }
  }
  console.log(`Seeded/updated ${createdCount} Availability rows for facilitators in 2025-10.`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
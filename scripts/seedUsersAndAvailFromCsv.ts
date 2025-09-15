/* scripts/seedUsersAndAvailFromCsv.ts
 * Seed October (1–28) facilitator users + date-specific availability from data/availability.csv.
 * Works with DatedBlock + DayAvailability (not weekly Block/Availability).
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
const ROLE: "FACILITATOR" = "FACILITATOR";

// ---- Small helpers ----
const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const normalizeName = (s: string) =>
  s.trim().replace(/\s+/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());

function toMinutes(h: number, m: number, ampm: string): number {
  let hh = h % 12;
  if (/pm/i.test(ampm)) hh += 12;
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
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

function looksLikeDateCell(s: string): boolean {
  return /october\s+\d{1,2}/i.test(s);
}
function extractDayNumber(dateStr: string): number | null {
  const m = dateStr.match(/october\s+(\d{1,2})/i);
  return m ? parseInt(m[1], 10) : null;
}
function normalizeCell(s: string): string {
  return s.replace(/\r/g, "").trim();
}
function splitCsvIntoRows(csv: string): string[] {
  // naive split by newline for row boundaries; headers can contain \n but they are quoted
  return csv.split(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/g);
}
function splitRow(row: string): string[] {
  // split by comma respecting quotes
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    const next = row[i + 1];
    if (ch === '"' && !inQuotes) { inQuotes = true; continue; }
    if (ch === '"' && inQuotes) {
      if (next === '"') { cur += '"'; i++; continue; }
      inQuotes = false; continue;
    }
    if (!inQuotes && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(normalizeCell);
}

// Parse a header cell into a dated block descriptor
type HeaderBlock = { dateISO: string; startMin: number; endMin: number; isClass: boolean; label: string | null };

function parseHeaderCell(cell: string): HeaderBlock | null {
  if (!cell) return null;

  // Shape B (one cell): "Tuesday, October 7 CLASS\n6PM - 7:15PM"
  if (looksLikeDateCell(cell)) {
    const parts = cell.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const header = parts[0];
      const timeStr = parts.slice(1).join(" ").replace(/\s+/g, " ");
      const dayNum = extractDayNumber(header);
      if (!dayNum || dayNum < DAY_RANGE.start || dayNum > DAY_RANGE.end) return null;
      const time = parseTimeRange(timeStr);
      if (!time) return null;
      const isClass = /class/i.test(header) || /class/i.test(timeStr);
      const dateISO = `${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      return { dateISO, startMin: time.startMin, endMin: time.endMin, isClass, label: isClass ? "CLASS" : null };
    }
  }

  // Shape A (two cells adjacent): "7AM - 10AM","Thursday, October 2"
  // We handle this at header-pair pass below — here return null.
  return null;
}

async function ensureMonth(year: number, month: number) {
  let row = await prisma.month.findUnique({ where: { year_month: { year, month } } });
  if (!row) row = await prisma.month.create({ data: { year, month, status: MonthStatus.DRAFT } });
  return row;
}

async function main() {
  console.log("[seed] Reading CSV:", CSV_PATH);
  if (!fs.existsSync(CSV_PATH)) {
    console.error("[seed] CSV not found at", CSV_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const rows = splitCsvIntoRows(raw);
  if (rows.length === 0) {
    console.error("[seed] Empty CSV");
    process.exit(1);
  }

  // --- Parse header row into a list of header blocks ---
  const headerCells = splitRow(rows[0]);
  // Expect first two columns to be Timestamp, Name — the rest are headers we parse.
  const headerMeta = headerCells.slice(2);

  const parsedFromSingle: (HeaderBlock | null)[] = headerMeta.map(parseHeaderCell);

  // Extra pass to catch Shape A pairs: TIME then DATE in adjacent header cells
  const parsed: (HeaderBlock | null)[] = [];
  for (let i = 0; i < headerMeta.length; i++) {
    const single = parsedFromSingle[i];
    if (single) { parsed.push(single); continue; }

    const a = headerMeta[i];
    const b = headerMeta[i + 1];
    // "TIME","DATE"
    const time = a && parseTimeRange(a.replace(/\s+/g, " "));
    const dayNum = b && looksLikeDateCell(b) ? extractDayNumber(b) : null;
    if (time && dayNum && dayNum >= DAY_RANGE.start && dayNum <= DAY_RANGE.end) {
      const isClass = /class/i.test(a) || /class/i.test(b!);
      const dateISO = `${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      parsed.push({ dateISO, startMin: time.startMin, endMin: time.endMin, isClass, label: isClass ? "CLASS" : null });
      i++; // consume pair
    } else {
      // not a recognizable header -> skip
    }
  }

  // De-dupe headers to build the definitive set of dated blocks we need to exist
  const keyOf = (x: HeaderBlock) => `${x.dateISO}-${x.startMin}-${x.endMin}-${x.isClass ? 1 : 0}`;
  const headerBlocksMap = new Map<string, HeaderBlock>();
  for (const hb of parsed) if (hb) headerBlocksMap.set(keyOf(hb), hb);
  const headerBlocks = Array.from(headerBlocksMap.values());

  console.log(`[seed] Parsed ${headerBlocks.length} unique header blocks for 2025-10 (days ${DAY_RANGE.start}-${DAY_RANGE.end}).`);

  // --- Ensure Month ---
  const monthRow = await ensureMonth(TARGET_YEAR, TARGET_MONTH);

  // --- Upsert DatedBlocks for all headers ---
  const datedBlockLookup = new Map<string, string>(); // key -> datedBlockId

  for (const hb of headerBlocks) {
    const existing = await prisma.datedBlock.findFirst({
      where: {
        monthId: monthRow.id,
        dateISO: hb.dateISO,
        startMin: hb.startMin,
        endMin: hb.endMin,
        isClass: hb.isClass,
      },
      select: { id: true },
    });

    if (existing) {
      datedBlockLookup.set(keyOf(hb), existing.id);
      continue;
    }

    const created = await prisma.datedBlock.create({
      data: {
        monthId: monthRow.id,
        dateISO: hb.dateISO,
        startMin: hb.startMin,
        endMin: hb.endMin,
        isClass: hb.isClass,
        label: hb.label,
        locked: false,
      },
      select: { id: true },
    });
    datedBlockLookup.set(keyOf(hb), created.id);
  }

  console.log(`[seed] Ensured ${datedBlockLookup.size} DatedBlocks.`);

  // --- Process each responder row to seed Users + DayAvailability ---
  let usersUpserted = 0;
  let dayAvUpserts = 0;

  for (let r = 1; r < rows.length; r++) {
    const cols = splitRow(rows[r]);
    if (cols.length < 2) continue;
    const nameRaw = cols[1];
    if (!nameRaw) continue;

    const name = normalizeName(nameRaw);
    const email = `${slug(name)}@example.local`; // synthesize; can be edited later

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name,
        rolesJson: JSON.parse(JSON.stringify([ROLE])),
      },
      update: {
        name,
        rolesJson: JSON.parse(JSON.stringify([ROLE])),
      },
      select: { id: true },
    });
    usersUpserted++;

    // Cells that correspond to headers start at index 2
    for (let c = 2, h = 0; c < cols.length && h < headerMeta.length; c++, h++) {
      const cell = (cols[c] || "").trim().toUpperCase();
      const isYes = cell === "Y" || cell === "V";
      if (!isYes) continue;

      // Find the matching header block key at index h
      // Re-derive hb for index h (we kept order in 'parsed' by pushing recognized blocks)
      // We need a parallel index of “which header indices produced a block”
      // Build it once from header pass:
    }

    // We need a robust mapping from each header index -> HeaderBlock (or null)
  }

  // Rebuild an array where each headerMeta index maps to a HeaderBlock | null
  const headerIndexToHB: (HeaderBlock | null)[] = new Array(headerMeta.length).fill(null);
  {
    // First fill with single-cell parsed
    for (let i = 0; i < headerMeta.length; i++) {
      headerIndexToHB[i] = parseHeaderCell(headerMeta[i]);
    }
    // Then fill Shape A pairs
    for (let i = 0; i < headerMeta.length - 1; i++) {
      if (headerIndexToHB[i]) continue;
      const a = headerMeta[i];
      const b = headerMeta[i + 1];
      const time = a && parseTimeRange(a.replace(/\s+/g, " "));
      const dayNum = b && looksLikeDateCell(b) ? extractDayNumber(b) : null;
      if (time && dayNum && dayNum >= DAY_RANGE.start && dayNum <= DAY_RANGE.end) {
        const isClass = /class/i.test(a) || /class/i.test(b!);
        const dateISO = `${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        headerIndexToHB[i] = { dateISO, startMin: time.startMin, endMin: time.endMin, isClass, label: isClass ? "CLASS" : null };
        headerIndexToHB[i + 1] = null; // consumed
        i++;
      }
    }
  }

  // Now reprocess responder rows using index mapping
  usersUpserted = 0;
  dayAvUpserts = 0;
  const userCache = new Map<string, string>(); // email -> userId

  for (let r = 1; r < rows.length; r++) {
    const cols = splitRow(rows[r]);
    if (cols.length < 2) continue;
    const nameRaw = cols[1];
    if (!nameRaw) continue;
    const name = normalizeName(nameRaw);
    const email = `${slug(name)}@example.local`;

    let userId = userCache.get(email);
    if (!userId) {
      const u = await prisma.user.upsert({
        where: { email },
        create: {
          email,
          name,
          rolesJson: JSON.parse(JSON.stringify([ROLE])),
        },
        update: {
          name,
          rolesJson: JSON.parse(JSON.stringify([ROLE])),
        },
        select: { id: true },
      });
      userId = u.id;
      userCache.set(email, userId);
      usersUpserted++;
    }

    for (let i = 0; i < headerIndexToHB.length; i++) {
      const hb = headerIndexToHB[i];
      if (!hb) continue;
      const cell = (cols[i + 2] || "").trim().toUpperCase(); // +2 offset for Timestamp,Name
      const isYes = cell === "Y" || cell === "V";
      if (!isYes) continue;

      const key = keyOf(hb);
      const datedBlockId = datedBlockLookup.get(key);
      if (!datedBlockId) {
        console.warn("[seed] WARNING: missing DatedBlock for header key", key);
        continue;
      }

      await prisma.dayAvailability.upsert({
        where: { userId_datedBlockId: { userId, datedBlockId } },
        update: {},
        create: { userId, datedBlockId },
      });
      dayAvUpserts++;
    }
  }

  console.log(`[seed] Users upserted: ${usersUpserted}`);
  console.log(`[seed] DayAvailability upserts: ${dayAvUpserts}`);
  console.log("[seed] Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
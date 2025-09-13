/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CSV_PATH = path.join(process.cwd(), "data", "availability.csv");

// 🔧 Adjust for the target schedule month you want to seed
const TARGET_YEAR = 2025;
const TARGET_MONTH = 10; // October

// ---------- Types ----------
type TimeRange = { startMin: number; endMin: number };
type ParsedHeader = TimeRange & { dateISO: string; isClass: boolean };

// ---------- Regex helpers ----------
const TIME_RE: RegExp =
  /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*$/i;

const HEADER_RE: RegExp =
  // "Wednesday, October 1\n8AM - 10AM" OR "Saturday, October 4 CLASS\n11:30AM - 12:30PM"
  /^\s*(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*([A-Za-z]+)\s+(\d{1,2})(?:\s+CLASS)?\s*\n\s*(.+?)\s*$/i;

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// ---------- CSV utilities (handles multiline quoted cells) ----------
function assembleCsvRows(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const rows: string[] = [];
  let buf = "";
  let quoteCount = 0;

  const pushBuf = () => {
    rows.push(buf);
    buf = "";
    quoteCount = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    buf = buf.length ? buf + "\n" + line : line;

    // Count unescaped quotes for THIS line
    let q = 0;
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '"') {
        if (j + 1 < line.length && line[j + 1] === '"') { j++; continue; }
        q++;
      }
    }
    quoteCount += q;

    // If total quotes in the buffered record are even, we have a complete CSV record
    if (quoteCount % 2 === 0) pushBuf();
  }
  if (buf.length) rows.push(buf); // fallback push
  return rows;
}

function splitCsvRecord(rec: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < rec.length; i++) {
    const ch = rec[i];
    if (ch === '"') {
      if (inQ && rec[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// ---------- Parsers ----------
function toMinutes(h: string | number, m?: string, ap?: string): number {
  const hhNum = Number(h) % 12;
  let hh = hhNum;
  if ((ap || "").toUpperCase() === "PM") hh += 12;
  const mm = m ? Number(m) : 0;
  return hh * 60 + mm;
}

function parseTimeRange(s: string): TimeRange | null {
  const m = TIME_RE.exec(s || "");
  if (!m) return null;
  const [, h1, m1, ap1, h2, m2, ap2] = m;
  return { startMin: toMinutes(h1, m1, ap1), endMin: toMinutes(h2, m2, ap2) };
}

function parseHeaderCell(cell: string): ParsedHeader | null {
  // Expect: "<weekday>, <Month> <Day> [CLASS]\n<time range>"
  const m = HEADER_RE.exec(cell || "");
  if (!m) return null;
  const [, monthName, dayStr, timeLine] = m;

  const monthKey = String(monthName).toLowerCase();
  const month = MONTH_MAP[monthKey];
  if (!month) return null;

  const day = Number(dayStr);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;

  const tr = parseTimeRange(timeLine);
  if (!tr) return null;

  const dateISO = `${TARGET_YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const isClass = /\bCLASS\b/i.test(cell);
  return { dateISO, ...tr, isClass };
}

// ---------- Main ----------
async function main(): Promise<void> {
  console.log("[seed] CSV:", CSV_PATH);
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV not found at ${CSV_PATH}`);

  const raw: string = fs.readFileSync(CSV_PATH, "utf8");
  const records = assembleCsvRows(raw);
  if (records.length === 0) throw new Error("CSV appears empty");
  console.log(`[seed] physical lines: ${raw.split(/\r?\n/).length}, logical CSV records: ${records.length}`);

  const headerRec = records[0];
  const headers = splitCsvRecord(headerRec);
  console.log(`[seed] header columns: ${headers.length}`);
  headers.slice(0, 10).forEach((h, i) => {
    const preview = h.replace(/\n/g, "\\n").slice(0, 100);
    console.log(`  [H${i}] "${preview}"`);
  });
  if (headers.length > 10) console.log(`  … (+${headers.length - 10} more)`);

  // We only care about headers >= index 2 (Timestamp, Name are 0/1)
  const candidates: ParsedHeader[] = [];
  let ok = 0, bad = 0, offMonth = 0;
  for (let i = 2; i < headers.length; i++) {
    const parsed = parseHeaderCell(headers[i]);
    if (!parsed) { bad++; continue; }
    const yr = Number(parsed.dateISO.slice(0, 4));
    const mo = Number(parsed.dateISO.slice(5, 7));
    if (yr !== TARGET_YEAR || mo !== TARGET_MONTH) { offMonth++; continue; }
    candidates.push(parsed);
    ok++;
  }
  console.log(`[seed] parsed headers → ok: ${ok}, bad: ${bad}, offMonth: ${offMonth}, kept(for target): ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("[seed] No header cells matched the expected pattern for the target month. Check previews above.");
    return;
  }

  // Wipe schedule data (order matters)
  console.log("[seed] Deleting Availability/DayAvailability/DatedBlock/Block/Month…");
  try { await prisma.availability.deleteMany({}); } catch {}
  try { (prisma as any).dayAvailability && await (prisma as any).dayAvailability.deleteMany({}); } catch {}
  try { await prisma.datedBlock.deleteMany({}); } catch {}
  try { await prisma.block.deleteMany({}); } catch {}
  try { await prisma.month.deleteMany({}); } catch {}

  // Create target month
  const monthRow = await prisma.month.create({
    data: { year: TARGET_YEAR, month: TARGET_MONTH, status: "DRAFT" },
  });

  // Insert DatedBlocks (dedupe by date/start/end)
  const seen = new Set<string>();
  let created = 0;
  for (const r of candidates) {
    const key = `${r.dateISO}:${r.startMin}:${r.endMin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.datedBlock.create({
      data: {
        monthId: monthRow.id,
        dateISO: r.dateISO,
        startMin: r.startMin,
        endMin: r.endMin,
        isClass: !!r.isClass,
        locked: false,
        label: null,
      },
    });
    created++;
  }
  console.log(`[seed] created ${created} dated blocks for ${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, "0")}`);
  console.log("[seed] DONE");
}

main()
  .catch(async (e: unknown) => {
    console.error("[seed] FAILED:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    prisma.$disconnect();
  });
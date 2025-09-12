// scripts/seedAvailabilityFromCSV.ts
// Seed real facilitator availability for October from a CSV of Google Form responses.
// Usage:
//   npx ts-node --project tsconfig.scripts.json scripts/seedAvailabilityFromCSV.ts data/availability.csv 2025-10
//
// Notes:
// - SQLite does NOT support createMany({ skipDuplicates: true }), so this version
//   dedupes in JS and then uses per-row UPSERT on the compound unique key
//   (userId, monthId, blockId).

import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { PrismaClient, Location } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

type Row = Record<string, string>;
const YES_VALUES = new Set(["yes", "y", "true", "1"]);

function isYes(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return YES_VALUES.has(s);
}

type ParsedHeader = {
  dateISO: string;   // 2025-10-07
  weekday: number;   // 1..7 (Mon..Sun)
  startMin: number;
  endMin: number;
  isClass: boolean;
  label: string | null;
  raw: string;
};

function parseTimeRange(line: string): { startMin: number; endMin: number } | null {
  const t = line.replace(/\s+/g, " ").trim();
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  const toMin = (h: number, mi: number, ap: string) => ((h % 12) + (/pm/i.test(ap) ? 12 : 0)) * 60 + mi;
  const h1 = parseInt(m[1],10), mi1 = m[2]?parseInt(m[2],10):0, ap1 = m[3];
  const h2 = parseInt(m[4],10), mi2 = m[5]?parseInt(m[5],10):0, ap2 = m[6];
  const startMin = toMin(h1, mi1, ap1);
  const endMin = toMin(h2, mi2, ap2);
  if (isNaN(startMin) || isNaN(endMin) || endMin <= startMin) return null;
  return { startMin, endMin };
}

function parseDateLine(line: string, targetYM: string): { dateISO: string; weekday: number; isClass: boolean } | null {
  const cleaned = line.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+(September|October|November|December)\s+(\d{1,2})(?:\s+CLASS)?$/i);
  if (!m) return null;
  const weekdayName = m[1], monthName = m[2], dayNum = parseInt(m[3],10);
  const isClass = /CLASS/i.test(cleaned);
  const monthIdx = /september/i.test(monthName)?9:/october/i.test(monthName)?10:/november/i.test(monthName)?11:/december/i.test(monthName)?12:null;
  if (!monthIdx) return null;

  const [yStr, mStr] = targetYM.split("-");
  const year = parseInt(yStr,10), month = parseInt(mStr,10);
  if (month !== monthIdx) return null;

  const dt = DateTime.fromObject({ year, month, day: dayNum });
  if (!dt.isValid) return null;
  return { dateISO: dt.toISODate()!, weekday: dt.weekday, isClass };
}

// Header can be:
//  A) "Weekday, Month Day [CLASS]\n6PM - 7:15PM"
//  B) "6PM - 7:15PM\nWeekday, Month Day [CLASS]"
function parseHeader(rawHeader: string, targetYM: string): ParsedHeader | null {
  const parts = rawHeader.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  const aTime = parseTimeRange(a), bTime = parseTimeRange(b);
  const dateLine = aTime ? b : a;
  const timeLine = aTime ? a : b;
  if (!!aTime === !!bTime) return null;

  const dateInfo = parseDateLine(dateLine, targetYM);
  const timeInfo = parseTimeRange(timeLine);
  if (!dateInfo || !timeInfo) return null;

  return {
    dateISO: dateInfo.dateISO,
    weekday: dateInfo.weekday,
    startMin: timeInfo.startMin,
    endMin: timeInfo.endMin,
    isClass: dateInfo.isClass,
    label: dateInfo.isClass ? "CLASS" : null,
    raw: rawHeader,
  };
}

async function emailForName(name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, " ");
  const [first, ...rest] = base.split(" ");
  const last = rest.join(" ") || "user";
  const candidate = `${first}.${last}`.replace(/\.+/g, ".");
  let email = `${candidate}@alter.local`, n = 1;
  while (await prisma.user.findUnique({ where: { email } })) {
    email = `${candidate}${n}@alter.local`; n++;
  }
  return email;
}

async function main() {
  const csvPath = process.argv[2];
  const targetYM = process.argv[3]; // "2025-10"
  if (!csvPath || !/^\d{4}-\d{2}$/.test(targetYM)) {
    console.error("Usage: npx ts-node --project tsconfig.scripts.json scripts/seedAvailabilityFromCSV.ts <csvPath> <YYYY-MM>");
    process.exit(1);
  }

  const [Y, M] = targetYM.split("-").map(n => parseInt(n,10));
  const monthStart = DateTime.fromObject({ year: Y, month: M, day: 1 });
  const monthEnd28 = DateTime.fromObject({ year: Y, month: M, day: 28 });

  const file = readFileSync(csvPath, "utf8");
  const rows = parse(file, { columns: true, skip_empty_lines: true }) as Row[];
  if (!rows.length) { console.log("No rows in CSV."); return; }

  const headers = Object.keys(rows[0]);
  const tsCol = headers.find(h => /timestamp/i.test(h));
  const nameCol = headers.find(h => /^name$/i.test(h)) || headers.find(h => /name/i.test(h));
  if (!tsCol || !nameCol) { console.error("Missing Timestamp or Name column."); process.exit(1); }

  // Parse all shift headers for target month days 1..28
  const parsedByHeader = new Map<string, ParsedHeader>();
  for (const h of headers) {
    if (h === tsCol || h === nameCol) continue;
    const ph = parseHeader(h, targetYM);
    if (!ph) continue;
    const d = DateTime.fromISO(ph.dateISO);
    if (d < monthStart || d > monthEnd28) continue;
    parsedByHeader.set(h, ph);
  }
  console.log(`Parsed ${parsedByHeader.size} shift columns for ${targetYM} (days 1–28).`);
  if (!parsedByHeader.size) return;

  // Latest submission per name
  const latestByName = new Map<string, Row>();
  for (const row of rows) {
    const who = (row[nameCol] || "").trim();
    if (!who) continue;
    const tsISO = DateTime.fromISO(row[tsCol] || "", { setZone: true });
    const tsMillis = tsISO.isValid ? tsISO.toMillis() : 0;
    const prev = latestByName.get(who);
    const prevMillis = prev ? (DateTime.fromISO(prev[tsCol] || "", { setZone: true }).toMillis() || 0) : -1;
    if (!prev || tsMillis > prevMillis) latestByName.set(who, row);
  }

  // Ensure Month
  const month = await prisma.month.upsert({
    where: { year_month: { year: Y, month: M } },
    update: {},
    create: { year: Y, month: M },
  });

  // Prepare unique (userId, blockId) keys for upsert
  type Pending = { userId: string; blockId: string; everyWeek: boolean };
  const pendingByKey = new Map<string, Pending>();

  for (const [name, row] of latestByName.entries()) {
    let email = await emailForName(name);
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, location: Location.COLLEGE_WEST, rolesJson: ["FACILITATOR"] },
    });

    for (const [h, meta] of parsedByHeader.entries()) {
      const cell = (row[h] ?? "").trim();
      if (!isYes(cell)) continue;

      // Ensure Block exists (merge CLASS onto existing if needed)
      let block = await prisma.block.findFirst({
        where: { day: meta.weekday, startMin: meta.startMin, endMin: meta.endMin },
      });
      if (!block) {
        block = await prisma.block.create({
          data: {
            day: meta.weekday,
            startMin: meta.startMin,
            endMin: meta.endMin,
            isClass: meta.isClass,
            label: meta.label ?? undefined,
            locked: false,
          },
        });
      } else if (meta.isClass && !block.isClass) {
        block = await prisma.block.update({
          where: { id: block.id },
          data: { isClass: true, label: block.label ?? meta.label ?? undefined },
        });
      }

      const key = `${user.id}::${block.id}`;
      if (!pendingByKey.has(key)) {
        pendingByKey.set(key, { userId: user.id, blockId: block.id, everyWeek: false });
      }
    }
  }

  const uniques = Array.from(pendingByKey.values());
  console.log(`Upserting ${uniques.length} availability rows… (SQLite-safe)`);

  // Upsert each availability on compound unique (userId, monthId, blockId)
  for (const a of uniques) {
    await prisma.availability.upsert({
      where: {
        userId_monthId_blockId: {
          userId: a.userId,
          monthId: month.id,
          blockId: a.blockId,
        },
      },
      update: { everyWeek: a.everyWeek },
      create: {
        userId: a.userId,
        monthId: month.id,
        blockId: a.blockId,
        everyWeek: a.everyWeek,
      },
    });
  }

  console.log("✅ Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
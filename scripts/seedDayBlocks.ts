// scripts/seedDayBlocks.ts
/**
 * Seeds weekday-based `block` rows from by-date JSON.
 * The schema has model `block` with fields: day (enum or string), label, startTime, endTime.
 * I detect the proper "day" value at runtime by trying common variants and caching what works.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/seedDayBlocks.ts data/blocks.byDate.first7.json
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = { dateISO: string; startMin: number; endMin: number };

function isRow(x: any): x is Row {
  return (
    x &&
    typeof x.dateISO === "string" &&
    typeof x.startMin === "number" &&
    typeof x.endMin === "number"
  );
}

function toHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function toLabel(startMin: number, endMin: number) {
  return `${toHHMM(startMin)}–${toHHMM(endMin)}`;
}

const JS_WEEK = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
function jsDay(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  return JS_WEEK[d.getDay()];
}

/**
 * Figure out what value the Prisma `block.day` field accepts for a given JS weekday.
 * I try uppercase, Title, short-3, and lowercase. The first that doesn't throw wins and is cached.
 */
const dayCache = new Map<string, string>();
async function resolveDayValueFor(weekdayUpper: string): Promise<string> {
  if (dayCache.has(weekdayUpper)) return dayCache.get(weekdayUpper)!;

  const title = weekdayUpper[0] + weekdayUpper.slice(1).toLowerCase(); // "Wednesday"
  const short3 = weekdayUpper.slice(0, 3); // "WED"
  const candidates = [weekdayUpper, title, short3, weekdayUpper.toLowerCase()];

  for (const cand of candidates) {
    try {
      // Dry-run with impossible times so we don't create anything if it works.
      await prisma.block.updateMany({
        where: { day: cand as any, startTime: "__noop__", endTime: "__noop__" },
        data: { label: "noop" },
      });
      dayCache.set(weekdayUpper, cand);
      return cand;
    } catch (e: any) {
      // If this candidate is invalid for the enum, Prisma throws. Try next.
      continue;
    }
  }

  // As a last resort, try to create and immediately delete a sentinel row to learn the valid value.
  for (const cand of candidates) {
    try {
      const row = await prisma.block.create({
        data: { day: cand as any, startTime: "00:00", endTime: "00:01", label: "__probe__" },
      });
      await prisma.block.delete({ where: { id: row.id } });
      dayCache.set(weekdayUpper, cand);
      return cand;
    } catch (e: any) {
      continue;
    }
  }

  throw new Error(
    `Could not resolve enum/string value for block.day for base weekday=${weekdayUpper}.` +
    ` Check your prisma model for the exact enum values.`
  );
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error("Usage: ts-node scripts/seedDayBlocks.ts <path/to/blocks.byDate.first7.json>");
    process.exit(1);
  }

  const abs = path.resolve(jsonPath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(abs, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON:", e);
    process.exit(1);
  }
  if (!Array.isArray(data)) {
    console.error("JSON must be an array.");
    process.exit(1);
  }

  const rows: Row[] = data.filter(isRow);
  if (rows.length === 0) {
    console.log("No valid rows in JSON. Nothing to seed.");
    return;
  }

  // Convert by-date rows into unique (day, startTime, endTime) combos.
  const seen = new Set<string>();
  const unique: { dayUpper: string; startTime: string; endTime: string; label: string }[] = [];

  for (const r of rows) {
    const dayUpper = jsDay(r.dateISO);
    const startTime = toHHMM(r.startMin);
    const endTime = toHHMM(r.endMin);
    const label = toLabel(r.startMin, r.endMin);
    const key = `${dayUpper}|${startTime}|${endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ dayUpper, startTime, endTime, label });
  }

  let created = 0;
  let updated = 0;

  for (const u of unique) {
    // Resolve the actual value to use for block.day
    const dayValue = await resolveDayValueFor(u.dayUpper);

    // Try update first (idempotent if rows exist)
    const upd = await prisma.block.updateMany({
      where: { day: dayValue as any, startTime: u.startTime, endTime: u.endTime },
      data: { label: u.label },
    });

    if (upd.count > 0) {
      updated += upd.count;
    } else {
      await prisma.block.create({
        data: {
          day: dayValue as any,
          startTime: u.startTime,
          endTime: u.endTime,
          label: u.label,
        },
      });
      created += 1;
    }
  }

  console.log(`Blocks seeded. created=${created}, updated=${updated}, totalUnique=${unique.length}`);
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
// scripts/generateMonth.ts
/**
 * Generates a MonthSchedule (DRAFT) and materializes BlockInstance rows
 * for the given year/month from BlockTemplate (Mon=1 .. Sun=7).
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/generateMonth.ts --year 2025 --month 10 --location default
 */

import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function main() {
  const yearStr = arg("year");
  const monthStr = arg("month");
  const locationName = arg("location", "default");

  if (!yearStr || !monthStr) {
    console.error("Usage: --year YYYY --month M --location default");
    process.exit(1);
  }
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || month < 1 || month > 12) {
    console.error("Invalid year/month.");
    process.exit(1);
  }

  const location = await prisma.location.findUnique({ where: { name: locationName } });
  if (!location) {
    console.error(`Location "${locationName}" not found. Seed templates first.`);
    process.exit(1);
  }

  const templates = await prisma.blockTemplate.findMany({
    where: { locationId: location.id },
    orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
  });
  if (templates.length === 0) {
    console.error("No BlockTemplate rows found. Run seedTemplates.ts first.");
    process.exit(1);
  }

  // Create or reuse MonthSchedule (DRAFT)
  const schedule = await prisma.monthSchedule.upsert({
    where: { locationId_year_month: { locationId: location.id, year, month } },
    update: { status: "DRAFT" },
    create: { locationId: location.id, year, month, status: "DRAFT" },
  });

  // Build all dates in the month (Luxon uses 1=Monday .. 7=Sunday for weekday)
  const first = DateTime.local(year, month, 1);
  const daysInMonth = first.daysInMonth!;
  let created = 0, skipped = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dt = DateTime.local(year, month, day);
    const weekday = dt.weekday; // 1..7 (Mon..Sun)
    const tForDay = templates.filter(t => t.weekday === weekday);
    if (tForDay.length === 0) continue;

    // If this date has an OverrideDay, we skip creating normal instances
    const dateISO = dt.toISODate()!;
    const od = await prisma.overrideDay.findUnique({
      where: { monthScheduleId_dateISO: { monthScheduleId: schedule.id, dateISO } },
    });
    if (od) { skipped += tForDay.length; continue; }

    for (const t of tForDay) {
      // Avoid duplicate instances if script is re-run
      const existing = await prisma.blockInstance.findFirst({
        where: {
          monthScheduleId: schedule.id,
          dateISO,
          startMin: t.startMin,
          endMin: t.endMin,
        },
      });
      if (existing) { skipped++; continue; }

      await prisma.blockInstance.create({
        data: {
          monthScheduleId: schedule.id,
          dateISO,
          startMin: t.startMin,
          endMin: t.endMin,
          label: t.label ?? null,
          locked: false,
        },
      });
      created++;
    }
  }

  console.log(`✅  Month generated (${year}-${String(month).padStart(2, "0")}). instances created=${created}, skipped=${skipped}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
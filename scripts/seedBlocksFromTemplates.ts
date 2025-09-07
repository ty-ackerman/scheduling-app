/* scripts/seedBlocksFromTemplates.ts
   Seeds weekly Block rows from templates JSON (Mon..Sun => 1..7).

   Usage:
   npx ts-node --project tsconfig.scripts.json scripts/seedBlocksFromTemplates.ts data/blocks.templates.json --reset
*/
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

type T = {
  day: number;          // 1..7 (Mon..Sun)
  startMin: number;     // 0..1440
  endMin: number;       // 0..1440, > startMin
  label?: string | null;
  isClass?: boolean;
  locked?: boolean;
};

function isValidTemplate(t: T): string | null {
  if (typeof t.day !== "number") return `bad type for day (${typeof t.day})`;
  if (t.day < 1 || t.day > 7) return `bad day ${t.day} (expected 1..7)`;
  if (!Number.isFinite(t.startMin) || t.startMin < 0 || t.startMin > 1440) return `bad startMin ${t.startMin}`;
  if (!Number.isFinite(t.endMin) || t.endMin < 0 || t.endMin > 1440) return `bad endMin ${t.endMin}`;
  if (t.endMin <= t.startMin) return `endMin <= startMin (${t.endMin} <= ${t.startMin})`;
  return null;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: ts-node scripts/seedBlocksFromTemplates.ts <templates.json> [--reset]");
    process.exit(1);
  }
  const doReset = process.argv.includes("--reset");

  // Sanity: show Prisma models detected at runtime
  // @ts-ignore
  const dmmf = (prisma as any)._runtimeDataModel?.models ?? {};
  console.log("[seeder] prisma models =", Object.keys(dmmf));

  const raw = fs.readFileSync(file, "utf8");
  const items: T[] = JSON.parse(raw);

  console.log(`[seeder] loaded ${items.length} templates`);
  // Quick per-day count pre-validation
  const preCounts = new Map<number, number>();
  for (const t of items) preCounts.set(t.day, (preCounts.get(t.day) ?? 0) + 1);
  console.log("[seeder] templates per day pre-validate:", Array.from(preCounts.entries()).sort((a,b)=>a[0]-b[0]));

  if (doReset) {
    await prisma.block.deleteMany({});
    console.log("[seeder] cleared Block table");
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const t of items) {
    const reason = isValidTemplate(t);
    if (reason) {
      skipped++;
      console.warn(`Skipping invalid template (day=${t.day}, start=${t.startMin}, end=${t.endMin}): ${reason}`);
      continue;
    }

    // Uniqueness for weekly templates is (day,startMin,endMin)
    const existing = await prisma.block.findFirst({
      where: { day: t.day, startMin: t.startMin, endMin: t.endMin },
      select: { id: true },
    });

    if (!existing) {
      await prisma.block.create({
        data: {
          day: t.day,
          startMin: t.startMin,
          endMin: t.endMin,
          label: t.label ?? null,
          isClass: Boolean(t.isClass),
          locked: Boolean(t.locked),
        },
      });
      created++;
    } else {
      await prisma.block.update({
        where: { id: existing.id },
        data: {
          label: t.label ?? null,
          isClass: Boolean(t.isClass),
          locked: Boolean(t.locked),
        },
      });
      updated++;
    }
  }

  const postCounts = await prisma.block.groupBy({
    by: ["day"],
    _count: { _all: true },
    orderBy: { day: "asc" },
  });

  console.log(`✅ Seed complete. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  console.log("[seeder] DB counts by day:", postCounts.map(r => [r.day, r._count._all]));
}

main().finally(() => prisma.$disconnect());
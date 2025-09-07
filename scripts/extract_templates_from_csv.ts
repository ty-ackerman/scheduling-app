/* scripts/seedBlocksFromTemplates.ts
   Seeds weekly Block rows from templates JSON (day 1..7 Mon..Sun).

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
  if (typeof t.day !== "number" || t.day < 1 || t.day > 7) return `bad day ${t.day} (expected 1..7)`;
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

  const raw = fs.readFileSync(file, "utf8");
  const items: T[] = JSON.parse(raw);

  if (doReset) {
    await prisma.block.deleteMany({});
  }

  let created = 0;
  let updated = 0;

  for (const t of items) {
    const err = isValidTemplate(t);
    if (err) {
      console.warn("Skipping invalid template:", { ...t, reason: err });
      continue;
    }

    // Use (day,startMin,endMin) as the uniqueness key for templates.
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

  console.log(`✅ Seed complete. Created: ${created}, Updated: ${updated}`);
}

main().finally(() => prisma.$disconnect());
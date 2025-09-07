// scripts/seedTemplates.ts
/**
 * Seeds Location (default) and BlockTemplate rows from JSON produced by extractTemplates.ts
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/seedTemplates.ts data/blockTemplates.json
 */

import * as fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type TemplateRow = { weekday: number; startMin: number; endMin: number; label?: string | null };

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Provide path to data/blockTemplates.json");
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath, "utf8");
  const templates: TemplateRow[] = JSON.parse(raw);

  // Upsert default location
  const location = await prisma.location.upsert({
    where: { name: "default" },
    update: {},
    create: { name: "default" },
  });

  let created = 0, updated = 0, skipped = 0;

  for (const t of templates) {
    // Enforce sane values
    if (!(t.weekday >= 1 && t.weekday <= 7)) {
      console.warn(`Skipping invalid weekday ${t.weekday}`);
      skipped++; continue;
    }
    if (!(Number.isInteger(t.startMin) && Number.isInteger(t.endMin) && t.endMin > t.startMin)) {
      console.warn(`Skipping invalid range ${t.startMin}–${t.endMin}`);
      skipped++; continue;
    }

    // Upsert on unique (locationId, weekday, startMin, endMin)
    const existing = await prisma.blockTemplate.findFirst({
      where: {
        locationId: location.id,
        weekday: t.weekday,
        startMin: t.startMin,
        endMin: t.endMin,
      },
    });

    if (existing) {
      await prisma.blockTemplate.update({
        where: { id: existing.id },
        data: { label: t.label ?? existing.label ?? null },
      });
      updated++;
    } else {
      await prisma.blockTemplate.create({
        data: {
          locationId: location.id,
          weekday: t.weekday,
          startMin: t.startMin,
          endMin: t.endMin,
          label: t.label ?? null,
          locked: false,
        },
      });
      created++;
    }
  }

  console.log(`✅  Templates seeded. created=${created}, updated=${updated}, skipped=${skipped}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
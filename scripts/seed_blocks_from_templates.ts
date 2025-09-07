/* scripts/seed_blocks_from_templates.ts
   Usage:
   npx ts-node --project tsconfig.scripts.json scripts/seed_blocks_from_templates.ts data/blocks.templates.json
*/
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

type T = { day:number; startMin:number; endMin:number; label?:string|null; isClass?:boolean };

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: ts-node scripts/seed_blocks_from_templates.ts <templates.json>");
    process.exit(1);
  }
  const items: T[] = JSON.parse(fs.readFileSync(file, "utf8"));

  // Optional: wipe existing blocks first (keeps users/availability intact).
  await prisma.block.deleteMany();

  for (const t of items) {
    await prisma.block.create({
      data: {
        day: t.day,
        startMin: t.startMin,
        endMin: t.endMin,
        label: t.label ?? null,
        isClass: Boolean(t.isClass),
        locked: false,
      },
    });
  }
  const count = await prisma.block.count();
  console.log(`Seeded ${count} blocks.`);
}

main().finally(() => prisma.$disconnect());
// scripts/seedBlocks.quick.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // wipe & seed a few weekly template blocks
  await prisma.block.deleteMany();

  const rows = [
    // Monday
    { day: 0, startMin: 8 * 60, endMin: 10 * 60, label: "Morning" },
    { day: 0, startMin: 10 * 60, endMin: 12 * 60, label: "Late Morning" },
    // Tuesday
    { day: 1, startMin: 15 * 60, endMin: 17 * 60 + 30, label: "Afternoon" },
    // Thursday
    { day: 3, startMin: 7 * 60, endMin: 10 * 60, label: "Early" },
  ];

  for (const r of rows) {
    await prisma.block.create({ data: r });
  }
  console.log("Seeded", rows.length, "Block rows");
}

main().finally(() => prisma.$disconnect());
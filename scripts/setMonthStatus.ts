// scripts/setMonthStatus.ts
import { DateTime } from "luxon";

// Use a RELATIVE import so ts-node doesn't need path-alias resolution.
import { prisma } from "../src/lib/db";

type MonthState = "DRAFT" | "FINAL";

async function main() {
  const monthArg = process.argv[2];        // e.g. 2025-10
  const statusArg = (process.argv[3] || "FINAL").toUpperCase() as MonthState;

  if (!monthArg) {
    console.error("Usage: ts-node --project tsconfig.scripts.json scripts/setMonthStatus.ts YYYY-MM [DRAFT|FINAL]");
    process.exit(1);
  }
  if (statusArg !== "DRAFT" && statusArg !== "FINAL") {
    console.error("Status must be DRAFT or FINAL");
    process.exit(1);
  }

  const dt = DateTime.fromFormat(monthArg, "yyyy-LL");
  if (!dt.isValid) {
    console.error("Invalid month. Expected YYYY-MM, e.g. 2025-10");
    process.exit(1);
  }

  // Ensure Month row exists and set status.
  const month = await prisma.month.upsert({
    where: { year_month: { year: dt.year, month: dt.month } },
    create: { year: dt.year, month: dt.month, status: statusArg },
    update: { status: statusArg },
  });

  const pretty = `${month.year}-${String(month.month).padStart(2, "0")}`;
  console.log(`Set month ${pretty} to ${month.status}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });
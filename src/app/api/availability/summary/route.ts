import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";

function parseMonth(m?: string) {
  if (!m) return null;
  const dt = DateTime.fromFormat(m, "yyyy-LL");
  return dt.isValid ? dt : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const monthStr = url.searchParams.get("month") || "";
  const dt = parseMonth(monthStr);
  if (!dt) {
    return NextResponse.json({ error: "Invalid month (YYYY-MM)" }, { status: 400 });
  }

  const month = await prisma.month.findUnique({
    where: { year_month: { year: dt.year, month: dt.month } },
    select: { id: true },
  });

  if (!month) return NextResponse.json({ month: monthStr, counts: {} });

  const grouped = await prisma.availability.groupBy({
    by: ["blockId"],
    where: { monthId: month.id },
    _count: { _all: true },
  });

  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.blockId] = g._count._all;

  return NextResponse.json({ month: monthStr, counts });
}
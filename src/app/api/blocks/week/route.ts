import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";

// NOTE: This endpoint now clamps the returned range to the given (or inferred) month
// and returns the Month status so the client can enforce read-only.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const startStr = url.searchParams.get("start") || "";
  const daysParam = Math.max(1, Math.min(7, parseInt(url.searchParams.get("days") || "7", 10)));
  const monthStr = url.searchParams.get("month") || ""; // optional YYYY-MM

  // Resolve start Monday
  const desired = startStr ? DateTime.fromISO(startStr) : DateTime.local().startOf("week").plus({ days: 1 });
  const startMonday = desired.startOf("week").plus({ days: 1 });

  // Resolve month scope
  const monthDt = monthStr ? DateTime.fromFormat(monthStr, "yyyy-LL") : startMonday;
  const monthStart = monthDt.startOf("month");
  const monthEnd = monthDt.endOf("month");

  // Clamp the week to lie within the month (best-effort)
  let effectiveStart = startMonday;
  if (effectiveStart < monthStart) effectiveStart = monthStart.startOf("week").plus({ days: 1 });
  if (effectiveStart > monthEnd) effectiveStart = monthEnd.startOf("week").plus({ days: 1 });

  // Fetch Month row (may be null)
  const monthRow = await prisma.month.findUnique({
    where: { year_month: { year: effectiveStart.year, month: effectiveStart.month } },
  });

  // Fetch weekly template Blocks (day-of-week based). Date-specific overrides come next step.
  const blocks = await prisma.block.findMany({
    orderBy: [{ day: "asc" }, { startMin: "asc" }],
  });

  // Build days for the requested span, but clamp to the month bounds.
  const days: { dateISO: string; blocks: any[] }[] = [];
  for (let i = 0; i < daysParam; i++) {
    const day = effectiveStart.plus({ days: i });
    if (day < monthStart || day > monthEnd) continue;
    const weekday = day.weekday; // 1..7
    const dayBlocks = blocks
      .filter(b => b.day === weekday)
      .map(b => ({
        id: b.id,
        dateISO: day.toISODate()!,
        startMin: b.startMin,
        endMin: b.endMin,
        locked: b.locked,
        label: b.label,
        isClass: b.isClass,
      }));
    days.push({ dateISO: day.toISODate()!, blocks: dayBlocks });
  }

  return NextResponse.json({
    startISO: effectiveStart.toISODate()!,
    month: monthRow ? { id: monthRow.id, status: monthRow.status, year: monthRow.year, month: monthRow.month } : { status: "DRAFT" },
    days,
  });
}
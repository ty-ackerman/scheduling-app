import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";

// Map JS Date (Luxon) weekday to our Block.day convention (1=Mon..7=Sun)
function isoWeekday(dt: DateTime) {
  // Luxon: Monday=1..Sunday=7 already
  return dt.weekday;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const startISO = url.searchParams.get("start") || ""; // e.g. 2025-10-06 (Monday)
    const days = Math.max(1, Math.min(7, parseInt(url.searchParams.get("days") || "7", 10) || 7));

    const start = DateTime.fromISO(startISO, { zone: "local" });
    if (!start.isValid) {
      return NextResponse.json({ error: "Invalid start date (expected YYYY-MM-DD)" }, { status: 400 });
    }

    // Month context is derived from the week’s Monday (your current convention)
    const monthYear = start.year;
    const monthNum = start.month;

    // Ensure we have the Month row (if not found, we still return counts=0)
    const monthRow = await prisma.month.findUnique({
      where: { year_month: { year: monthYear, month: monthNum } },
    });

    // Build the 7-day window of dates
    const daysOut: { dateISO: string; weekday: number }[] = [];
    for (let i = 0; i < days; i++) {
      const dt = start.plus({ days: i });
      daysOut.push({ dateISO: dt.toISODate()!, weekday: isoWeekday(dt) });
    }

    // Fetch all blocks for those weekdays
    const weekdaySet = Array.from(new Set(daysOut.map(d => d.weekday)));
    const blocks = await prisma.block.findMany({
      where: { day: { in: weekdaySet } },
      select: { id: true, day: true, startMin: true, endMin: true, label: true, locked: true, isClass: true },
      orderBy: [{ day: "asc" }, { startMin: "asc" }],
    });

    // Organize blocks by weekday so we can attach by date
    const byWeekday = new Map<number, typeof blocks>();
    for (const w of weekdaySet) byWeekday.set(w, []);
    for (const b of blocks) {
      const arr = byWeekday.get(b.day);
      if (arr) arr.push(b);
    }

    // Count availability per block for this month (if monthRow exists)
    let counts = new Map<string, number>();
    if (monthRow && blocks.length > 0) {
      const countsRaw = await prisma.availability.groupBy({
        by: ["blockId"],
        where: { monthId: monthRow.id, blockId: { in: blocks.map(b => b.id) } },
        _count: { blockId: true },
      });
      counts = new Map(countsRaw.map(r => [r.blockId, r._count.blockId]));
    }

    // Shape the response as days with blocks+count
    const daysResponse = daysOut.map(d => {
      const bForDay = byWeekday.get(d.weekday) || [];
      return {
        dateISO: d.dateISO,
        blocks: bForDay.map(b => ({
          id: b.id,
          day: b.day,
          startMin: b.startMin,
          endMin: b.endMin,
          label: b.label,
          locked: b.locked,
          isClass: b.isClass,
          count: counts.get(b.id) ?? 0,
        })),
      };
    });

    return NextResponse.json({
      startISO: start.toISODate(),
      days: daysResponse,
      month: { year: monthYear, month: monthNum, exists: !!monthRow },
    });
  } catch (e) {
    console.error("[week-summary] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
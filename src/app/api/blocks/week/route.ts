import { NextResponse } from "next/server";
import {prisma} from "@/lib/db";
import { DateTime } from "luxon";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get("start"); // YYYY-MM-DD
  const daysParam = url.searchParams.get("days");
  const days = Math.max(1, Math.min(14, Number(daysParam ?? 7)));

  const startDt = start ? DateTime.fromISO(start) : DateTime.local().startOf("week").plus({ days: 1 }); // Monday
  if (!startDt.isValid) {
    return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  }

  const dateList = Array.from({ length: days }, (_, i) => startDt.plus({ days: i }));
  const weekdaySet = Array.from(new Set(dateList.map(d => d.weekday))); // 1..7

  const blocks = await prisma.block.findMany({
    where: { day: { in: weekdaySet } },
    orderBy: [{ day: "asc" }, { startMin: "asc" }],
    select: {
      id: true, day: true, startMin: true, endMin: true, label: true, isClass: true, locked: true,
    },
  });

  const grouped = dateList.map(d => ({
    dateISO: d.toISODate()!,
    weekday: d.weekday, // 1..7
    blocks: blocks.filter(b => b.day === d.weekday),
  }));

  return NextResponse.json({
    startISO: startDt.toISODate(),
    days: grouped,
  });
}
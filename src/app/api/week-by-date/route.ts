// src/app/api/week-by-date/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DateTime } from "luxon";

// Helper: yyyy-mm-dd guard
function isISODate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const start = url.searchParams.get("start");
    const daysParam = url.searchParams.get("days");
    const days = Math.max(1, Math.min(14, parseInt(daysParam ?? "7", 10) || 7)); // cap at 14

    if (!isISODate(start)) {
      return NextResponse.json({ error: 'Provide start=YYYY-MM-DD' }, { status: 400 });
    }

    // Build inclusive date list
    const d0 = DateTime.fromISO(start);
    const dates: string[] = [];
    for (let i = 0; i < days; i++) dates.push(d0.plus({ days: i }).toISODate()!);

    // Find (or infer) which MonthSchedule we’re in (location "default")
    const loc = await prisma.location.findUnique({ where: { name: "default" } });
    if (!loc) return NextResponse.json({ error: "Location 'default' not found. Seed templates first." }, { status: 404 });

    // We might cross months; grab schedules for any months touched by the range
    const monthsTouched = Array.from(new Set(dates.map(d => {
      const dt = DateTime.fromISO(d);
      return `${dt.year}-${dt.month}`;
    })));

    const schedules = await prisma.monthSchedule.findMany({
      where: { locationId: loc.id, OR: monthsTouched.map(key => {
        const [y,m] = key.split("-").map(Number);
        return { year: y, month: m };
      })},
      select: { id: true, year: true, month: true },
    });

    if (schedules.length === 0) {
      return NextResponse.json({ error: "No MonthSchedule found for these dates. Run generateMonth.ts." }, { status: 404 });
    }

    const scheduleIds = schedules.map(s => s.id);

    // Fetch all BlockInstances for the requested dates
    const blocks = await prisma.blockInstance.findMany({
      where: {
        monthScheduleId: { in: scheduleIds },
        dateISO: { in: dates },
      },
      orderBy: [{ dateISO: "asc" }, { startMin: "asc" }],
      select: { id: true, dateISO: true, startMin: true, endMin: true, label: true, locked: true },
    });

    // Available counts per blockId (group-by via two queries to keep it SQLite-friendly)
    const avail = await prisma.userAvailability.findMany({
      where: { blockInstanceId: { in: blocks.map(b => b.id) } },
      select: { blockInstanceId: true },
    });
    const availableCounts: Record<string, number> = {};
    for (const a of avail) {
      availableCounts[a.blockInstanceId] = (availableCounts[a.blockInstanceId] ?? 0) + 1;
    }

    // Build days bucket
    const byDate: Record<string, { dateISO: string; blocks: any[] }> = {};
    for (const d of dates) byDate[d] = { dateISO: d, blocks: [] };
    for (const b of blocks) {
      byDate[b.dateISO].blocks.push({
        id: b.id,
        dateISO: b.dateISO,
        startMin: b.startMin,
        endMin: b.endMin,
        label: b.label,
        locked: b.locked,
      });
    }

    const payload = {
      startISO: dates[0],
      days: dates.map(d => byDate[d]),
      myAvailableIds: [],          // (optional) fill from session later
      availableCounts,             // blockId -> number available
    };

    return NextResponse.json(payload);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
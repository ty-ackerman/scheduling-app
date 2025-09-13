import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";

/**
 * GET /api/blocks/week?start=YYYY-MM-DD&days=7
 * Returns the dated blocks for the requested week, plus (optionally) a quick
 * per-datedBlock role tally computed from DayAvailability.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const start = url.searchParams.get("start") || "";
    const days = Math.max(1, Math.min(7, parseInt(url.searchParams.get("days") || "7", 10)));

    const startDt = DateTime.fromISO(start);
    if (!startDt.isValid) {
      return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
    }
    const endDt = startDt.plus({ days });

    // Month status for the header (use the month of the week’s Monday)
    const monthYear = startDt.year;
    const monthNum = startDt.month;
    const monthRow = await prisma.month.findUnique({
      where: { year_month: { year: monthYear, month: monthNum } },
      select: { id: true, status: true },
    });

    // Pull all dated blocks within [start, end)
    const datedBlocks = await prisma.datedBlock.findMany({
      where: {
        dateISO: {
          gte: startDt.toISODate()!,
          lt: endDt.toISODate()!,
        },
      },
      orderBy: [{ dateISO: "asc" }, { startMin: "asc" }],
      select: {
        id: true,
        dateISO: true,
        startMin: true,
        endMin: true,
        label: true,
        isClass: true,
        locked: true,
      },
    });

    // Build day array
    const byDate = new Map<string, any[]>();
    for (const b of datedBlocks) {
      if (!byDate.has(b.dateISO)) byDate.set(b.dateISO, []);
      byDate.get(b.dateISO)!.push(b);
    }

    const daysOut: { dateISO: string; blocks: any[] }[] = [];
    for (let i = 0; i < days; i++) {
      const dISO = startDt.plus({ days: i }).toISODate()!;
      daysOut.push({
        dateISO: dISO,
        blocks: byDate.get(dISO) ?? [],
      });
    }

    // ---- OPTIONAL: role tallies for each datedBlock (Manager view uses /api/availability/summary,
    // but having this here also supports chips on the grid) ----
    // If there are no blocks in range, skip the extra query.
    let tallies: Record<string, { FACILITATOR: number; FRONT_DESK: number; CLEANER: number }> = {};
    if (datedBlocks.length) {
      // DayAvailability has (id, userId, datedBlockId, createdAt, updatedAt)
      const avs = await prisma.dayAvailability.findMany({
        where: { datedBlockId: { in: datedBlocks.map((b) => b.id) } },
        select: {
          datedBlockId: true,
          user: { select: { rolesJson: true } }, // rolesJson: string[]
        },
      });

      tallies = avs.reduce<typeof tallies>((acc, a) => {
        const key = a.datedBlockId;
        if (!acc[key]) acc[key] = { FACILITATOR: 0, FRONT_DESK: 0, CLEANER: 0 };
        const roles: string[] = Array.isArray(a.user?.rolesJson) ? (a.user!.rolesJson as string[]) : [];
        for (const r of roles) {
          if (r === "FACILITATOR" || r === "FRONT_DESK" || r === "CLEANER") {
            acc[key][r] += 1;
          }
        }
        return acc;
      }, {});
    }

    return NextResponse.json({
      startISO: startDt.toISODate(),
      endISO: endDt.toISODate(),
      month: monthRow ? { id: monthRow.id, status: monthRow.status } : null,
      days: daysOut,
      tallies, // keyed by datedBlockId
    });
  } catch (err) {
    console.error("[/api/blocks/week] error:", err);
    // Always return JSON so the client doesn’t hit “Unexpected end of JSON input”
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
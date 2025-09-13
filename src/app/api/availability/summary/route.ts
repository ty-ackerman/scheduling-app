import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/availability/summary?month=YYYY-MM&roles=FACILITATOR,FRONT_DESK,CLEANER
 *
 * Returns: { month: "YYYY-MM", counts: { [datedBlockId]: number } }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || "";
  const rolesParam = searchParams.get("roles") || ""; // CSV or empty
  const rolesFilter = rolesParam
    .split(",")
    .map(s => s.trim())
    .filter(Boolean); // [] means "all roles"

  try {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Bad month format" }, { status: 400 });
    }
    const [yearStr, monStr] = month.split("-");
    const year = Number(yearStr);
    const mon = Number(monStr);

    // Find month row
    const monthRow = await prisma.month.findFirst({
      where: { year, month: mon },
      select: { id: true },
    });
    if (!monthRow) {
      return NextResponse.json({ month, counts: {} }); // no data for this month yet
    }

    // Pull all DayAvailability for DatedBlocks that belong to this month
    // and join the user so we can filter by role(s)
    const rows = await prisma.dayAvailability.findMany({
      where: {
        datedBlock: { monthId: monthRow.id },
      },
      select: {
        datedBlockId: true,
        user: { select: { id: true, rolesJson: true } },
      },
    });

    // Filter by roles if a list was provided
    const wanted = new Set(rolesFilter.map(r => r.toUpperCase()));
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const roles: string[] = Array.isArray(r.user.rolesJson)
        ? r.user.rolesJson
        : typeof r.user.rolesJson === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(r.user.rolesJson);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })()
        : [];

      if (wanted.size > 0) {
        const hasWanted = roles.some(rr => wanted.has(String(rr).toUpperCase()));
        if (!hasWanted) continue;
      }

      counts[r.datedBlockId] = (counts[r.datedBlockId] ?? 0) + 1;
    }

    return NextResponse.json({ month, counts });
  } catch (err) {
    console.error("[summary] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DateTime } from "luxon";

function parseMonthParam(m?: string) {
  if (!m) return null;
  const dt = DateTime.fromFormat(m, "yyyy-LL");
  return dt.isValid ? dt : null;
}

function parseRolesParam(r?: string): string[] | null {
  if (!r) return null;
  const parts = r.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const valid = new Set(["FRONT_DESK","FACILITATOR","CLEANER"]);
  const filtered = parts.filter(p => valid.has(p));
  return filtered.length ? filtered : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const monthStr = url.searchParams.get("month") || "";
  const roles = parseRolesParam(url.searchParams.get("roles") || "");

  const dt = parseMonthParam(monthStr);
  if (!dt) {
    return NextResponse.json({ error: "Invalid or missing month (YYYY-MM)" }, { status: 400 });
  }

  const monthRow = await prisma.month.findUnique({
    where: { year_month: { year: dt.year, month: dt.month } },
    select: { id: true },
  });
  if (!monthRow) {
    return NextResponse.json({ month: monthStr, counts: {} });
  }

  // Fetch all availabilities for the month with user roles; aggregate in app
  const avs = await prisma.availability.findMany({
    where: { monthId: monthRow.id },
    select: {
      blockId: true,
      user: { select: { rolesJson: true } },
    },
  });

  const counts: Record<string, number> = {};
  for (const a of avs) {
    const rolesList: string[] = Array.isArray(a.user.rolesJson) ? a.user.rolesJson : [];
    const include = roles ? rolesList.some(r => roles.includes(String(r).toUpperCase())) : true;
    if (!include) continue;
    counts[a.blockId] = (counts[a.blockId] ?? 0) + 1;
  }

  return NextResponse.json({ month: monthStr, counts });
}
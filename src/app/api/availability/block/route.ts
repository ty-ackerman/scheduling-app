import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
  const blockId = url.searchParams.get("blockId") || "";
  const roles = parseRolesParam(url.searchParams.get("roles") || "");

  if (!blockId) {
    return NextResponse.json({ error: "Missing blockId" }, { status: 400 });
  }
  const dt = parseMonthParam(monthStr);
  if (!dt) {
    return NextResponse.json({ error: "Invalid or missing month (YYYY-MM)" }, { status: 400 });
  }

  // Manager-only drilldown (but keep it simple for now: any signed-in user)
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monthRow = await prisma.month.findUnique({
    where: { year_month: { year: dt.year, month: dt.month } },
    select: { id: true },
  });
  if (!monthRow) {
    return NextResponse.json({ month: monthStr, blockId, users: [] });
  }

  const avs = await prisma.availability.findMany({
    where: { monthId: monthRow.id, blockId },
    select: {
      everyWeek: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          rolesJson: true,
          location: true,
        },
      },
    },
  });

  const users = avs
    .map(a => {
      const rolesList: string[] = Array.isArray(a.user.rolesJson) ? a.user.rolesJson : [];
      return {
        id: a.user.id,
        name: a.user.name || a.user.email,
        email: a.user.email,
        roles: rolesList,
        location: a.user.location, // enum as string
        everyWeek: a.everyWeek,
      };
    })
    .filter(u => {
      if (!roles) return true;
      // keep if user has ANY of the selected roles
      return u.roles.some(r => roles.includes(String(r).toUpperCase()));
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return NextResponse.json({ month: monthStr, blockId, users });
}
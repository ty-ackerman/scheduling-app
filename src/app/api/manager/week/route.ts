// app/api/manager/week/route.ts
// GET: returns { startMonday, lockAt, isLocked } for ?week=YYYY-MM-DD
// POST: MANAGER sets/clears lockAt { week, lockAt: ISO | null }

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import authOptions from "@/../auth.config";
import { prisma } from "@/lib/db";

function isValidWeekISO(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function parseWeekStart(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function isoOrNull(d: Date | null | undefined) {
  return d ? new Date(d).toISOString() : null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "STAFF";
  if (!session?.user || role !== "MANAGER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const weekIso = url.searchParams.get("week");
  if (!isValidWeekISO(weekIso)) {
    return NextResponse.json({ ok: false, error: "Invalid or missing ?week=YYYY-MM-DD" }, { status: 400 });
  }
  const weekStart = parseWeekStart(weekIso!);

  const week = await prisma.week.upsert({
    where: { startMonday: weekStart },
    update: {},
    create: { startMonday: weekStart },
  });

  const isLocked = !!week.lockAt && Date.now() >= new Date(week.lockAt).getTime();

  return NextResponse.json({
    ok: true,
    startMonday: new Date(week.startMonday).toISOString(),
    lockAt: isoOrNull(week.lockAt),
    isLocked,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "STAFF";
  if (!session?.user || role !== "MANAGER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { week, lockAt } = (body ?? {}) as { week?: unknown; lockAt?: unknown };

  if (!isValidWeekISO(week)) {
    return NextResponse.json({ ok: false, error: "Invalid 'week' (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!(lockAt === null || typeof lockAt === "string")) {
    return NextResponse.json({ ok: false, error: "Invalid 'lockAt' (ISO string or null)" }, { status: 400 });
  }

  const weekStart = parseWeekStart(week as string);

  const updated = await prisma.week.upsert({
    where: { startMonday: weekStart },
    create: { startMonday: weekStart, lockAt: lockAt ? new Date(lockAt) : null },
    update: { lockAt: lockAt ? new Date(lockAt) : null },
  });

  const isLocked = !!updated.lockAt && Date.now() >= new Date(updated.lockAt).getTime();

  return NextResponse.json({
    ok: true,
    startMonday: new Date(updated.startMonday).toISOString(),
    lockAt: isoOrNull(updated.lockAt),
    isLocked,
  });
}
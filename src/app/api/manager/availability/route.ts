// app/api/manager/availability/route.ts
// Returns all users' availability for the requested week (MANAGER only).

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import authOptions from "../../../../../auth.config";
import { prisma } from "@/lib/db";

type TimeBlockId = "MORNING" | "AFTERNOON" | "EVENING";
const BLOCKS: TimeBlockId[] = ["MORNING", "AFTERNOON", "EVENING"];

function isValidWeekISO(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseWeekStart(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
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
    return NextResponse.json(
      { ok: false, error: "Invalid or missing ?week=YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const weekStart = parseWeekStart(weekIso!);

  // Ensure the week row exists (unique on startMonday in schema)
  const week = await prisma.week.upsert({
    where: { startMonday: weekStart },
    update: {},
    create: { startMonday: weekStart },
  });

  // Pull all availability rows for this week, joined with user
  const rows = await prisma.availability.findMany({
    where: { weekId: week.id },
    select: {
      blockId: true,
      dayIndex: true,
      available: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  // Group by user
  const byUser = new Map<
    string,
    {
      id: string;
      name: string | null;
      email: string;
      role: string;
      availability: Record<TimeBlockId, boolean[]>;
    }
  >();

  const empty: Record<TimeBlockId, boolean[]> = {
    MORNING: Array(7).fill(false),
    AFTERNOON: Array(7).fill(false),
    EVENING: Array(7).fill(false),
  };

  for (const r of rows) {
    const uid = r.user.id;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        id: uid,
        name: r.user.name,
        email: r.user.email,
        role: r.user.role,
        availability: {
          MORNING: [...empty.MORNING],
          AFTERNOON: [...empty.AFTERNOON],
          EVENING: [...empty.EVENING],
        },
      });
    }
    const rec = byUser.get(uid)!;
    const block = r.blockId as TimeBlockId;
    if (BLOCKS.includes(block) && r.dayIndex >= 0 && r.dayIndex <= 6) {
      rec.availability[block][r.dayIndex] = !!r.available;
    }
  }

  // Build cell counts and name lists
  const counts: Record<TimeBlockId, number[]> = {
    MORNING: Array(7).fill(0),
    AFTERNOON: Array(7).fill(0),
    EVENING: Array(7).fill(0),
  };
  const names: Record<TimeBlockId, string[][]> = {
    MORNING: Array(7).fill(null).map(() => []),
    AFTERNOON: Array(7).fill(null).map(() => []),
    EVENING: Array(7).fill(null).map(() => []),
  };

  for (const u of byUser.values()) {
    for (const block of BLOCKS) {
      for (let d = 0; d < 7; d++) {
        if (u.availability[block][d]) {
          counts[block][d] += 1;
          const label = u.name?.trim() || u.email;
          names[block][d].push(label);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    week: weekIso,
    users: Array.from(byUser.values()),
    counts,
    names,
  });
}
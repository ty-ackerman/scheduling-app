// app/api/manager/assignments/route.ts
// Manager-only endpoints to view candidates and set/clear assignments for a week.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import authOptions from "@/../auth.config";
import { prisma } from "@/lib/db";

type TimeBlock = "MORNING" | "AFTERNOON" | "EVENING";
type ShiftRole = "FRONT_DESK" | "FACILITATOR";
const BLOCKS: TimeBlock[] = ["MORNING", "AFTERNOON", "EVENING"];
const HOURS: Record<TimeBlock, number> = { MORNING: 3, AFTERNOON: 5, EVENING: 4 };

function isValidWeekISO(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function parseWeekStart(iso: string): Date {
  const [y, m, d] = (iso as string).split("-").map((n) => parseInt(n, 10));
  // local midnight; ignoring TZ/DST per Phase 1
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function toISO(d: Date | null | undefined) {
  return d ? new Date(d).toISOString() : null;
}

// --- Guard: if prisma client wasn't regenerated, prisma.assignment will be undefined.
function assertPrismaHasAssignment() {
  const has = (prisma as any)?.assignment?.findMany;
  if (!has) {
    const hint =
      "Prisma client does not have the 'Assignment' model. " +
      "Run: npx prisma format && npx prisma migrate dev --name add_assignments && npx prisma generate (then restart dev).";
    console.error("[assignments API] Missing prisma.assignment. " + hint);
    return NextResponse.json({ ok: false, error: hint }, { status: 500 });
  }
  return null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "STAFF";
  if (!session?.user || role !== "MANAGER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const guard = assertPrismaHasAssignment();
  if (guard) return guard;

  const url = new URL(req.url);
  const weekIso = url.searchParams.get("week");
  const dayParam = url.searchParams.get("day"); // optional 0..6
  const blockParam = url.searchParams.get("block"); // optional MORNING|AFTERNOON|EVENING

  if (!isValidWeekISO(weekIso)) {
    return NextResponse.json({ ok: false, error: "Invalid or missing ?week=YYYY-MM-DD" }, { status: 400 });
  }
  const weekStart = parseWeekStart(weekIso!);

  // Ensure a Week row exists (select lockAt explicitly so TS knows it exists)
  const week = await prisma.week.upsert({
    where: { startMonday: weekStart },
    update: {},
    create: { startMonday: weekStart },
    select: { id: true, startMonday: true, lockAt: true },
  });

  // If day+block provided → return candidates for this single cell
  const hasCellQuery = dayParam !== null && blockParam !== null;
  if (hasCellQuery) {
    const dayIndex = Number(dayParam);
    const blockId = blockParam as TimeBlock;
    if (!(dayIndex >= 0 && dayIndex <= 6 && BLOCKS.includes(blockId))) {
      return NextResponse.json({ ok: false, error: "Invalid 'day' or 'block'" }, { status: 400 });
    }

    // Current assignments for this cell (two roles)
    const existing = await prisma.assignment.findMany({
      where: { weekId: week.id, dayIndex, blockId },
      include: { assignedUser: { select: { id: true, name: true, email: true } } },
    });

    const current: Record<
      ShiftRole,
      { userId: string | null; name: string | null; email: string | null } | null
    > = {
      FRONT_DESK: null,
      FACILITATOR: null,
    };
    for (const row of existing) {
      const entry = row.assignedUser
        ? { userId: row.assignedUser.id, name: row.assignedUser.name, email: row.assignedUser.email }
        : { userId: null, name: null, email: null };
      current[row.role as ShiftRole] = entry;
    }

    // Candidates: users who marked available for this cell
    const rows = await prisma.availability.findMany({
      where: {
        weekId: week.id,
        blockId,
        dayIndex,
        available: true,
        // ← correct relational filter syntax
        user: { is: { role: "STAFF" } },
      },
      select: { user: { select: { id: true, name: true, email: true } } },
    });

    const candidateIds = rows.map((r) => r.user?.id).filter(Boolean) as string[];

    // Compute scheduled hours this week per user (based on current assignments)
    const allAssignments = await prisma.assignment.findMany({
      where: { weekId: week.id, assignedUserId: { not: null } },
      select: { assignedUserId: true, blockId: true },
    });
    const hoursByUser = new Map<string, number>();
    for (const a of allAssignments) {
      const uid = a.assignedUserId as string;
      hoursByUser.set(uid, (hoursByUser.get(uid) ?? 0) + HOURS[a.blockId as TimeBlock]);
    }

    const candidates = candidateIds.length
      ? await prisma.user.findMany({
          where: { id: { in: candidateIds } },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      : [];

    const payload = candidates
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        scheduledHours: hoursByUser.get(u.id) ?? 0,
      }))
      .sort((a, b) => a.scheduledHours - b.scheduledHours);

    return NextResponse.json({
      ok: true,
      week: weekIso,
      dayIndex,
      blockId,
      current,
      candidates: payload,
      lockAt: toISO(week.lockAt),
    });
  }

  // Otherwise return the whole week's assignment map (quick overview)
  const assignments = await prisma.assignment.findMany({
    where: { weekId: week.id },
    include: { assignedUser: { select: { id: true, name: true, email: true } } },
  });

  const map: Record<
    string,
    { role: ShiftRole; userId: string | null; name: string | null; email: string | null }
  > = {};
  for (const a of assignments) {
    const key = `${a.dayIndex}-${a.blockId}-${a.role}`;
    map[key] = {
      role: a.role as ShiftRole,
      userId: a.assignedUser?.id ?? null,
      name: a.assignedUser?.name ?? null,
      email: a.assignedUser?.email ?? null,
    };
  }

  // Also return simple per-user hour totals (for manager context panes)
  const byUser = await prisma.assignment.groupBy({
    by: ["assignedUserId", "blockId"],
    where: { weekId: week.id, assignedUserId: { not: null } },
    _count: { _all: true },
  });
  const hours: Record<string, number> = {};
  for (const g of byUser) {
    const uid = g.assignedUserId as string;
    if (!uid) continue;
    hours[uid] = (hours[uid] ?? 0) + HOURS[g.blockId as TimeBlock] * (g._count._all || 0);
  }

  return NextResponse.json({
    ok: true,
    week: weekIso,
    assignments: map,
    hoursByUser: hours,
    lockAt: toISO(week.lockAt),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "STAFF";
  if (!session?.user || role !== "MANAGER") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const guard = assertPrismaHasAssignment();
  if (guard) return guard;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { week, dayIndex, blockId, role: shiftRole, userId } = body as {
    week: string;
    dayIndex: number;
    blockId: TimeBlock;
    role: ShiftRole;
    userId: string | null; // null = clear
  };

  if (!isValidWeekISO(week)) {
    return NextResponse.json({ ok: false, error: "Invalid 'week' (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!(dayIndex >= 0 && dayIndex <= 6) || !BLOCKS.includes(blockId)) {
    return NextResponse.json({ ok: false, error: "Invalid 'dayIndex' or 'blockId'" }, { status: 400 });
  }
  if (!(shiftRole === "FRONT_DESK" || shiftRole === "FACILITATOR")) {
    return NextResponse.json({ ok: false, error: "Invalid 'role'" }, { status: 400 });
  }

  const weekStart = parseWeekStart(week);
  const weekRec = await prisma.week.upsert({
    where: { startMonday: weekStart },
    update: {},
    create: { startMonday: weekStart },
    select: { id: true }, // only need id here
  });

  // Ensure the row exists then set/clear assignment
  const key = {
    weekId_dayIndex_blockId_role: {
      weekId: weekRec.id,
      dayIndex,
      blockId,
      role: shiftRole,
    },
  };

  await prisma.assignment.upsert({
    where: key,
    update: {},
    create: { weekId: weekRec.id, dayIndex, blockId, role: shiftRole },
  });

  const updated = await prisma.assignment.update({
    where: key,
    data: { assignedUserId: userId ?? null },
    include: { assignedUser: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({
    ok: true,
    assignment: {
      dayIndex: updated.dayIndex,
      blockId: updated.blockId,
      role: updated.role,
      userId: updated.assignedUser?.id ?? null,
      name: updated.assignedUser?.name ?? null,
      email: updated.assignedUser?.email ?? null,
    },
  });
}
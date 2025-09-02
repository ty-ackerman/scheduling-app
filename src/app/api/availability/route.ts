// app/api/availability/route.ts
// Persist per-user weekly availability using Prisma + NextAuth v4.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import authOptions from "../../../../auth.config";
import { prisma } from "@/lib/db";

// ---- Types & utils ----

type TimeBlockId = "MORNING" | "AFTERNOON" | "EVENING";
const BLOCK_IDS: TimeBlockId[] = ["MORNING", "AFTERNOON", "EVENING"];

function isValidWeekISO(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseWeekStart(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  // Treat as local midnight; DST/timezones ignored per Phase 1
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function isAvailabilityPayload(x: unknown): x is Record<TimeBlockId, boolean[]> {
  if (!x || typeof x !== "object") return false;
  const obj = x as Record<string, unknown>;
  return BLOCK_IDS.every(
    (k) =>
      Array.isArray(obj[k]) &&
      (obj[k] as unknown[]).length === 7 &&
      (obj[k] as unknown[]).every((v) => typeof v === "boolean")
  );
}

// ---- GET: /api/availability?week=YYYY-MM-DD ----

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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

  // Ensure user
  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: session.user.name ?? null },
  });

  // Ensure week (startMonday is UNIQUE in schema)
  const week = await prisma.week.upsert({
    where: { startMonday: weekStart },
    update: {},
    create: { startMonday: weekStart },
  });

  const rows = await prisma.availability.findMany({
    where: { userId: user.id, weekId: week.id },
    select: { blockId: true, dayIndex: true, available: true },
  });

  const availability: Record<TimeBlockId, boolean[]> = {
    MORNING: Array(7).fill(false),
    AFTERNOON: Array(7).fill(false),
    EVENING: Array(7).fill(false),
  };

  for (const r of rows) {
    const block = r.blockId as TimeBlockId;
    if (BLOCK_IDS.includes(block) && r.dayIndex >= 0 && r.dayIndex <= 6) {
      availability[block][r.dayIndex] = !!r.available;
    }
  }

  return NextResponse.json({ ok: true, week: weekIso, availability });
}

// ---- POST: /api/availability ----
// Body: { week: 'YYYY-MM-DD', availability: { MORNING:[bool x7], AFTERNOON:[...], EVENING:[...] } }

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { week, availability } = (body ?? {}) as {
    week?: unknown;
    availability?: unknown;
  };

  if (!isValidWeekISO(week)) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing 'week' (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (!isAvailabilityPayload(availability)) {
    return NextResponse.json({ ok: false, error: "Invalid 'availability' payload" }, { status: 400 });
  }

  const weekStart = parseWeekStart(week as string);

  // Ensure user + week
  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email, name: session.user.name ?? null },
  });

  const weekRec = await prisma.week.upsert({
    where: { startMonday: weekStart },
    update: {},
    create: { startMonday: weekStart },
  });

  // Replace all rows for this user/week with incoming payload
  await prisma.availability.deleteMany({
    where: { userId: user.id, weekId: weekRec.id },
  });

  const dataToCreate = BLOCK_IDS.flatMap((blockId) =>
    (availability as Record<TimeBlockId, boolean[]>)[blockId].map((available, dayIndex) => ({
      userId: user.id,
      weekId: weekRec.id,
      blockId,
      dayIndex,
      available,
    }))
  );

  if (dataToCreate.length) {
    await prisma.availability.createMany({ data: dataToCreate });
  }

  return NextResponse.json({ ok: true, saved: dataToCreate.length });
}
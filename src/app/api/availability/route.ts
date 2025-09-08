// src/app/api/availability/route.ts
import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function parseMonthParam(m?: string) {
  if (!m) return null; // expect "YYYY-MM"
  const dt = DateTime.fromFormat(m, "yyyy-LL");
  return dt.isValid ? dt : null;
}

async function ensureMonth(year: number, month: number) {
  let monthRow = await prisma.month.findUnique({ where: { year_month: { year, month } } });
  if (!monthRow) {
    monthRow = await prisma.month.create({ data: { year, month } });
  }
  return monthRow;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const monthStr = url.searchParams.get("month") || ""; // "2025-10"
  const dt = parseMonthParam(monthStr);
  if (!dt) {
    return NextResponse.json({ error: "Invalid or missing month param (expected YYYY-MM)" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const monthRow = await prisma.month.findUnique({
    where: { year_month: { year: dt.year, month: dt.month } },
  });

  if (!monthRow) {
    return NextResponse.json({
      month: monthStr,
      user: { id: user.id, email: user.email, name: user.name ?? null },
      selections: [],
      everyWeekIds: [],
    });
  }

  const avs = await prisma.availability.findMany({
    where: { userId: user.id, monthId: monthRow.id },
    select: { blockId: true, everyWeek: true },
  });

  const selections = avs.map(a => a.blockId);
  const everyWeekIds = avs.filter(a => a.everyWeek).map(a => a.blockId);

  return NextResponse.json({
    month: monthStr,
    user: { id: user.id, email: user.email, name: user.name ?? null },
    selections,
    everyWeekIds,
  });
}

type SavePayload = {
  month: string;           // "YYYY-MM"
  blockIds: string[];      // selected blocks
  everyWeekIds?: string[]; // subset marked "every week"
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: SavePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dt = parseMonthParam(body.month);
  if (!dt) {
    return NextResponse.json({ error: "Invalid or missing month (YYYY-MM)" }, { status: 400 });
  }

  const monthRow = await ensureMonth(dt.year, dt.month);

  const blockIds = Array.isArray(body.blockIds) ? body.blockIds : [];
  const everyWeekSet = new Set<string>(Array.isArray(body.everyWeekIds) ? body.everyWeekIds : []);

  // Verify blocks exist
  const existingBlocks = await prisma.block.findMany({
    where: { id: { in: blockIds } },
    select: { id: true },
  });
  const validIdSet = new Set(existingBlocks.map(b => b.id));
  const finalIds = blockIds.filter(id => validIdSet.has(id));

  await prisma.$transaction(async (tx) => {
    const current = await tx.availability.findMany({
      where: { userId: user.id, monthId: monthRow.id },
      select: { id: true, blockId: true },
    });
    const currentMap = new Map(current.map(a => [a.blockId, a.id]));

    const toDelete = current.filter(a => !finalIds.includes(a.blockId)).map(a => a.id);
    if (toDelete.length) {
      await tx.availability.deleteMany({ where: { id: { in: toDelete } } });
    }

    for (const blockId of finalIds) {
      const existed = currentMap.get(blockId);
      if (existed) {
        await tx.availability.update({
          where: { id: existed },
          data: { everyWeek: everyWeekSet.has(blockId) },
        });
      } else {
        await tx.availability.create({
          data: {
            userId: user.id,
            monthId: monthRow.id,
            blockId,
            everyWeek: everyWeekSet.has(blockId),
          },
        });
      }
    }
  });

  return NextResponse.json({ ok: true, savedCount: finalIds.length });
}
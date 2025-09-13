import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function parseMonthParam(m?: string) {
  if (!m) return null;
  const dt = DateTime.fromFormat(m, "yyyy-LL");
  return dt.isValid ? dt : null;
}

async function ensureMonth(year: number, month: number) {
  let row = await prisma.month.findUnique({ where: { year_month: { year, month } } });
  if (!row) row = await prisma.month.create({ data: { year, month } });
  return row;
}

/** -------- GET: load month selections (date-specific) -------- */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const monthStr = url.searchParams.get("month") || "";
  const dt = parseMonthParam(monthStr);

  console.log("[GET /api/availability] month param =", monthStr);

  if (!dt) {
    return NextResponse.json({ error: "Invalid or missing month (YYYY-MM)" }, { status: 400 });
  }

  // Session is optional here – we still return a shape so UI can render
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  let user: { id: string; email: string } | null = null;

  if (email) {
    const u = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true }
    });
    if (u) user = { id: u.id, email: u.email };
  }

  const monthRow = await prisma.month.findUnique({
    where: { year_month: { year: dt.year, month: dt.month } },
    select: { id: true, status: true },
  });

  if (!monthRow) {
    console.log("[GET] no Month row -> empty selections");
    return NextResponse.json({
      month: monthStr,
      monthStatus: "DRAFT",
      user,
      selections: [],
      everyWeekIds: [],
    });
  }

  // Pull all dated blocks for the month’s visible week range will be done
  // by the client via /api/blocks/week. For availability we only need IDs.
  let selections: string[] = [];
  if (user) {
    const rows = await prisma.dayAvailability.findMany({
      where: {
        userId: user.id,
        datedBlock: { monthId: monthRow.id },
      },
      select: { datedBlockId: true },
    });
    selections = rows.map(r => r.datedBlockId);
  }

  console.log("[GET] monthId:", monthRow.id, "status:", monthRow.status, "user?", !!user, "count:", selections.length);

  return NextResponse.json({
    month: monthStr,
    monthStatus: monthRow.status,
    user,
    selections,
    everyWeekIds: [], // legacy
  });
}

/** Payload from client */
type SavePayload = {
  month: string;               // "YYYY-MM"
  datedBlockIds: string[];     // selected blocks for this month
  everyWeekIds?: string[];     // unused with DatedBlock; kept for compatibility
};

/** -------- POST: save month selections (date-specific) -------- */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let body: SavePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dt = parseMonthParam(body.month);
  if (!dt) return NextResponse.json({ error: "Invalid or missing month (YYYY-MM)" }, { status: 400 });

  const monthRow = await ensureMonth(dt.year, dt.month);
  const requestedIds = Array.isArray(body.datedBlockIds) ? body.datedBlockIds : [];

  console.log("[POST /api/availability] START", {
    user: user.email,
    month: body.month,
    requestedCount: requestedIds.length,
  });

  // Validate IDs — only allow DatedBlocks from this month
  const monthBlocks = await prisma.datedBlock.findMany({
    where: { monthId: monthRow.id, id: { in: requestedIds } },
    select: { id: true },
  });
  const validIdSet = new Set(monthBlocks.map(b => b.id));
  const finalIds = requestedIds.filter(id => validIdSet.has(id));

  console.log("[POST] validated IDs", { finalCount: finalIds.length });

  await prisma.$transaction(async (tx) => {
    // What's currently saved for this user in this month?
    const current = await tx.dayAvailability.findMany({
      where: { userId: user.id, datedBlock: { monthId: monthRow.id } },
      select: { id: true, datedBlockId: true },
    });
    const currentIds = new Set(current.map(r => r.datedBlockId));

    const toDelete = current.filter(r => !finalIds.includes(r.datedBlockId)).map(r => r.id);
    const toAdd = finalIds.filter(id => !currentIds.has(id));

    console.log("[POST] current:", current.length, "toAdd:", toAdd.length, "toDelete:", toDelete.length);

    if (toDelete.length) {
      await tx.dayAvailability.deleteMany({ where: { id: { in: toDelete } } });
      console.log("[POST] deleted rows:", toDelete.length);
    }

    if (toAdd.length) {
      // NOTE: SQLite Prisma doesn’t support `skipDuplicates`, so we rely on
      // @@unique([userId, datedBlockId]) and the pre-filter above.
      await tx.dayAvailability.createMany({
        data: toAdd.map((id) => ({ userId: user.id, datedBlockId: id })),
      });
      console.log("[POST] inserted rows:", toAdd.length);
    }
  });

  console.log("[POST] DONE", { savedCount: finalIds.length });

  // Return server truth so the client can mark “Saved”
  return NextResponse.json({
    ok: true,
    month: body.month,
    selections: finalIds,
    everyWeekIds: [], // legacy
    user: { id: user.id, email: user.email },
  });
}
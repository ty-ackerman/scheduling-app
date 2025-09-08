import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Role = "FRONT_DESK" | "FACILITATOR" | "CLEANER";
type Location = "COLLEGE_WEST" | "LESLIEVILLE";

// Small guards
function isRole(v: unknown): v is Role {
  return v === "FRONT_DESK" || v === "FACILITATOR" || v === "CLEANER";
}
function isLocation(v: unknown): v is Location {
  return v === "COLLEGE_WEST" || v === "LESLIEVILLE";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // rolesJson stores an array of role strings
  let roles: Role[] = [];
  try {
    const raw = user.rolesJson as unknown;
    if (Array.isArray(raw)) {
      roles = raw.filter(isRole);
    }
  } catch {
    roles = [];
  }

  return NextResponse.json({
    email: user.email,
    name: user.name ?? null,
    location: (user.location as Location) ?? "COLLEGE_WEST",
    roles,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof (body as any).name === "string" ? ((body as any).name as string).trim() : user.name ?? "";
  const location: Location = isLocation((body as any).location) ? (body as any).location : user.location as Location;
  const rolesArrayRaw = Array.isArray((body as any).roles) ? (body as any).roles : [];
  const roles: Role[] = rolesArrayRaw.filter(isRole);

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name || null,
        location,
        rolesJson: roles,
      },
      select: { email: true, name: true, location: true, rolesJson: true },
    });

    return NextResponse.json({
      email: updated.email,
      name: updated.name ?? null,
      location: updated.location as Location,
      roles: Array.isArray(updated.rolesJson) ? updated.rolesJson : [],
    });
  } catch (e: any) {
    console.error("[api/profile] update error:", e?.message || e);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
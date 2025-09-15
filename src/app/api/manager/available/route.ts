// src/app/api/manager/available/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";

function parseRolesList(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseRolesJson(jsonish: unknown): string[] {
  try {
    const v = typeof jsonish === "string" ? JSON.parse(jsonish) : jsonish;
    if (Array.isArray(v)) return v.map(String);
  } catch {
    // ignore
  }
  return [];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const datedBlockId = url.searchParams.get("datedBlockId");
  const monthStr = url.searchParams.get("month") ?? undefined;

  // Accept either "roles" (CSV) or "role" (single)
  const rolesParam = url.searchParams.get("roles") || url.searchParams.get("role");
  const filterRoles = parseRolesList(rolesParam);

  if (!datedBlockId) {
    return NextResponse.json({ error: "datedBlockId is required" }, { status: 400 });
  }

  // Find all userIds who opted into this dated block
  const dayAvail = await prisma.dayAvailability.findMany({
    where: { datedBlockId },
    select: { userId: true }
  });

  const userIds = [...new Set(dayAvail.map((d) => d.userId))];
  if (userIds.length === 0) {
    return NextResponse.json({ users: [] }, { status: 200 });
  }

  // Pull users; rolesJson is filtered in JS to be safe
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true, rolesJson: true }
  });

  const filtered = filterRoles.length
    ? users.filter((u) => {
        const roles = parseRolesJson(u.rolesJson);
        return roles.some((r) => filterRoles.includes(r));
      })
    : users;

  return NextResponse.json({
    users: filtered.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email
    })),
    meta: {
      datedBlockId,
      month: monthStr,
      requestedRoles: filterRoles
    }
  });
}
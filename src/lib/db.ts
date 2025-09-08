// src/lib/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query", "error", "warn"].filter(Boolean) as any,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Export both named and default so either import style works
export default prisma;
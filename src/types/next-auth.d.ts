// src/types/next-auth.d.ts
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: "STAFF" | "MANAGER";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "STAFF" | "MANAGER";
  }
}
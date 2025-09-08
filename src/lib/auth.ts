// src/lib/auth.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// NOTE: we’re using the new route handler in app/api/auth/[...nextauth]/route.ts
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" }, // you can switch to "database" later if you prefer
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        // expose token sub as userId
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/api/auth/signin", // NextAuth default page is fine; customize later if needed
  },
};
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db";

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token }) {
      if (token?.email) {
        // Ensure user exists and get role
        const user = await prisma.user.upsert({
          where: { email: token.email },
          update: {},
          create: {
            email: token.email,
            name: typeof token.name === "string" ? token.name : null,
          },
        });
        (token as any).role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = (token as any).role ?? "STAFF";
      }
      return session;
    },
  },
};

export default authOptions;
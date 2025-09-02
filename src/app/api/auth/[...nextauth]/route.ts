// app/api/auth/[...nextauth]/route.ts
// NextAuth v4 App Router handler

import NextAuth from "next-auth";
import authOptions from "@/../auth.config";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
// app/week/page.tsx
// Protects /week: if not logged in, redirect to home page.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import authOptions from "../../../auth.config";
import WeekGrid from "@/components/WeekGrid";

export default async function WeekPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/"); // Not logged in → go to home
  }

  return (
    <div className="surface" style={{ padding: 20 }}>
      <h1 className="text-xl" style={{ fontWeight: 600, marginBottom: 12 }}>
        Week View (Static)
      </h1>
      <p style={{ marginBottom: 16, color: "var(--muted-2)" }}>
        Days × Time Blocks (09:00–12:00, 12:00–17:00, 17:00–21:00)
      </p>
      <WeekGrid />
    </div>
  );
}
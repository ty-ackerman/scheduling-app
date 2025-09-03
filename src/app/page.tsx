// app/page.tsx
// Simple landing page explaining what the app does.

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="surface" style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <h1 className="text-2xl" style={{ fontWeight: 600, marginBottom: 16 }}>
        Welcome to the Scheduling App
      </h1>
      <p style={{ marginBottom: 12, lineHeight: 1.5 }}>
        This tool helps us organize staff availability each week. You’ll log in
        with your Google account, mark when you are available to work, and save
        your choices.
      </p>
      <p style={{ marginBottom: 12, lineHeight: 1.5 }}>
        Managers can then review everyone’s availability, adjust as needed, and
        publish the schedule. Once the schedule is locked, staff can only view
        their assigned shifts.
      </p>
      <p style={{ marginBottom: 20, lineHeight: 1.5 }}>
        To get started, sign in and go to your{" "}
        <Link href="/week" className="link">
          Week View
        </Link>
        .
      </p>
    </main>
  );
}
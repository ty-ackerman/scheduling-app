'use client';
// app/week/page.tsx
// Static Week View page (7 × 3 grid) for Phase 1 demo.
// Uses the WeekGrid component for rendering.

import WeekGrid from "@/components/WeekGrid";

export default function WeekPage() {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Week View (Static)</h2>
        <p className="text-gray-600 text-sm">
          Days × Time Blocks (09:00–12:00, 12:00–17:00, 17:00–21:00)
        </p>
      </header>
      <WeekGrid />
    </section>
  );
}
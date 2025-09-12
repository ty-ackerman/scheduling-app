"use client";

import { DateTime } from "luxon";
import React from "react";

type Props = {
  weekStartISO: string;
  monthStr: string; // YYYY-MM
  readOnly: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisWeek: () => void;
};

export default function WeekHeader({
  weekStartISO,
  monthStr,
  readOnly,
  onPrev,
  onNext,
  onThisWeek,
}: Props) {
  const monthDt = DateTime.fromFormat(monthStr, "yyyy-LL");
  const weekStart = DateTime.fromISO(weekStartISO);

  // Disable prev/next if moving would leave the month
  const prevMonday = weekStart.minus({ weeks: 1 });
  const nextMonday = weekStart.plus({ weeks: 1 });

  const prevDisabled = prevMonday.endOf("week") < monthDt.startOf("month");
  const nextDisabled = nextMonday.startOf("week") > monthDt.endOf("month");

  return (
    <div
      className="surface"
      style={{
        padding: 16,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontWeight: 400, fontSize: 20 }}>
          {readOnly ? "Schedule (Read-only)" : "My Availability — Week (Calendar)"}
        </h1>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Week of <strong>{weekStartISO}</strong> • Month scope: <strong>{monthStr}</strong>
          {readOnly ? " • Final" : " • Draft"}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="pill" style={{ gap: 6 }}>
          <button className="btn btn-quiet" onClick={onPrev} disabled={prevDisabled} title="Previous week">
            ← Prev
          </button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onThisWeek} title="Jump to this week">
            This week
          </button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onNext} disabled={nextDisabled} title="Next week">
            Next →
          </button>
        </div>

        <span
          className="pill"
          style={{
            borderColor: readOnly ? "var(--border-strong)" : "#34d399",
            background: readOnly
              ? "transparent"
              : "color-mix(in oklab, #34d399 12%, transparent)",
            color: readOnly ? "var(--muted)" : "#34d399",
            fontSize: 12,
          }}
        >
          {readOnly ? "Finalized" : "Draft"}
        </span>
      </div>
    </div>
  );
}
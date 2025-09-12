"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import WeekHeader from "./components/WeekHeader";
import { useWeekData } from "./hooks/useWeekData";
import CalendarGrid from "./components/CalendarGrid";

export default function StaffWeekPage() {
  const qs = useSearchParams();
  const router = useRouter();

  // Month scope comes from query (?month=YYYY-MM) or inferred from start.
  const monthQuery = qs.get("month") || "";
  const startISOQuery = qs.get("start") || "";
  const daysParam = Math.max(1, Math.min(7, parseInt(qs.get("days") || "7", 10)));

  const inferredMonth = useMemo(() => {
    const src = startISOQuery || DateTime.local().startOf("week").plus({ days: 1 }).toISODate()!;
    const dt = DateTime.fromISO(src);
    return dt.isValid ? dt.toFormat("yyyy-LL") : DateTime.local().toFormat("yyyy-LL");
  }, [startISOQuery]);

  const monthStr = monthQuery || inferredMonth;

  // Compute this page's weekStart ISO (Monday) but clamped to the month scope.
  const weekStartISO = useMemo(() => {
    const desired = startISOQuery
      ? DateTime.fromISO(startISOQuery)
      : DateTime.local().startOf("week").plus({ days: 1 });
    const monthDt = DateTime.fromFormat(monthStr, "yyyy-LL");

    if (!monthDt.isValid) return desired.toISODate()!;

    // Month bounds
    const monthStart = monthDt.startOf("month");
    const monthEnd = monthDt.endOf("month");

    // Clamp the week's Monday into the month (if outside, snap to closest)
    const monday = desired.startOf("week").plus({ days: 1 });
    if (monday < monthStart) return monthStart.startOf("week").plus({ days: 1 }).toISODate()!;
    if (monday > monthEnd) return monthEnd.startOf("week").plus({ days: 1 }).toISODate()!;
    return monday.toISODate()!;
  }, [startISOQuery, monthStr]);

  // Fetch week data (server now respects month clamp)
  const { week, loading, errorMsg } = useWeekData(weekStartISO, daysParam, monthStr);

  const readOnly = (week?.month?.status ?? "DRAFT") === "FINAL";

  function pushWeek(iso: string) {
    router.push(`/staff/week?start=${encodeURIComponent(iso)}&days=${daysParam}&month=${monthStr}`);
  }
  const onPrev = () => {
    const dt = DateTime.fromISO(weekStartISO).minus({ weeks: 1 });
    pushWeek(dt.toISODate()!);
  };
  const onNext = () => {
    const dt = DateTime.fromISO(weekStartISO).plus({ weeks: 1 });
    pushWeek(dt.toISODate()!);
  };
  const onThisWeek = () => {
    const monday = DateTime.local().startOf("week").plus({ days: 1 });
    const inMonth = DateTime.fromFormat(monthStr, "yyyy-LL");
    const snapped =
      monday < inMonth.startOf("month") ? inMonth.startOf("month") :
      monday > inMonth.endOf("month")   ? inMonth.endOf("month")   : monday;
    pushWeek(snapped.toISODate()!);
  };

  return (
    <div>
      <WeekHeader
        weekStartISO={weekStartISO}
        monthStr={monthStr}
        readOnly={readOnly}
        onPrev={onPrev}
        onNext={onNext}
        onThisWeek={onThisWeek}
      />
      {loading && <div className="surface" style={{ padding: 16 }}>Loading…</div>}
      {errorMsg && <div className="surface" style={{ padding: 16, color: "#ef4444" }}>{errorMsg}</div>}
      {week && (
        <CalendarGrid
          week={week}
          monthStr={monthStr}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
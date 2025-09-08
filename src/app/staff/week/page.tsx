// src/app/staff/week/page.tsx
"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import WeekHeader from "./components/WeekHeader";
import CalendarGrid from "./components/CalendarGrid";
import { useWeekData } from "./hooks/useWeekData";
import { useAvailabilityDraft } from "./hooks/useAvailabilityDraft";
import { mondayISOFrom } from "@/lib/time";

export default function StaffWeekPage() {
  const qs = useSearchParams();
  const router = useRouter();

  const startISOQuery = qs.get("start") || "";
  const daysParam = Math.max(1, Math.min(7, parseInt(qs.get("days") || "7", 10) || 7));
  const weekStartISO = useMemo(() => mondayISOFrom(startISOQuery), [startISOQuery]);

  const { week, monthStr } = useWeekData(weekStartISO, daysParam);

  const {
    availability,
    selectedLocal, setSelectedLocal,
    everyWeekLocal, setEveryWeekLocal,
    dirty, saving, savedFlash, errorMsg, setErrorMsg,
    onResetToServer, onSaveToServer,
  } = useAvailabilityDraft(monthStr);

  function pushWeek(newStartISO: string) {
    router.push(`/staff/week?start=${encodeURIComponent(newStartISO)}&days=${daysParam}`);
  }
  function goPrevWeek() { pushWeek(DateTime.fromISO(weekStartISO).minus({ weeks: 1 }).toISODate()!); }
  function goNextWeek() { pushWeek(DateTime.fromISO(weekStartISO).plus({ weeks: 1 }).toISODate()!); }
  function goThisWeek() { pushWeek(mondayISOFrom()); }

  function toggleBlock(id: string, locked: boolean) {
    if (locked) return;
    setSelectedLocal(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setEveryWeekLocal(prevEW => { const ew = new Set(prevEW); ew.delete(id); return ew; });
      } else { next.add(id); }
      return next;
    });
  }
  function toggleEveryWeek(id: string) {
    setEveryWeekLocal(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <div>
      <WeekHeader
        weekStartISO={weekStartISO}
        monthStr={monthStr}
        dirty={dirty}
        savedFlash={savedFlash}
        errorMsg={errorMsg}
        onPrev={goPrevWeek}
        onNext={goNextWeek}
        onThisWeek={goThisWeek}
        onReset={onResetToServer}
        onSave={onSaveToServer}
        saveDisabled={saving}
      />

      {!week ? (
        <div className="surface" style={{ padding: 16 }}>Loading…</div>
      ) : (
        <CalendarGrid
          week={week}
          selectedLocal={selectedLocal}
          everyWeekLocal={everyWeekLocal}
          toggleBlock={toggleBlock}
          toggleEveryWeek={toggleEveryWeek}
        />
      )}
    </div>
  );
}
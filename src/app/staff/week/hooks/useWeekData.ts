// src/app/staff/week/hooks/useWeekData.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import type { WeekAPI } from "../types";

export function useWeekData(weekStartISO: string, daysParam: number) {
  const [week, setWeek] = useState<WeekAPI | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/blocks/week?start=${encodeURIComponent(weekStartISO)}&days=${daysParam}`, { cache: "no-store" });
        if (!res.ok) {
          const t = await res.text();
          console.error("[useWeekData] fetch failed:", t);
          if (alive) setErrorMsg("Failed to load week blocks.");
          return;
        }
        const data: WeekAPI = await res.json();
        if (alive) setWeek(data);
      } catch (e) {
        console.error(e);
        if (alive) setErrorMsg("Failed to load week blocks.");
      }
    })();
    return () => { alive = false; };
  }, [weekStartISO, daysParam]);

  const monthStr = useMemo(() => {
    const dt = DateTime.fromISO(weekStartISO);
    return dt.isValid ? dt.toFormat("yyyy-LL") : "1970-01";
  }, [weekStartISO]);

  return { week, monthStr, errorMsg, setErrorMsg };
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DateTime } from "luxon";
import WeekGrid from "@/components/WeekGrid";

type Block = {
  id: string; day: number; startMin: number; endMin: number;
  label?: string | null; locked: boolean; isClass: boolean;
};
type WeekAPI = { startISO: string; days: { dateISO: string; blocks: Block[] }[] };

export default function WeekPage() {
  const qs = useSearchParams();
  const router = useRouter();

  const startISO = qs.get("start")
    || DateTime.local().startOf("week").plus({ days: 1 }).toISODate()!;
  const days = Math.max(1, Math.min(7, parseInt(qs.get("days") || "7", 10)));

  const monthStr = useMemo(
    () => DateTime.fromISO(startISO).toFormat("yyyy-LL"),
    [startISO]
  );

  const [week, setWeek] = useState<WeekAPI | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let ok = true;
    (async () => {
      const r = await fetch(`/api/blocks/week?start=${encodeURIComponent(startISO)}&days=${days}`, { cache: "no-store" });
      if (!r.ok) return;
      const data: WeekAPI = await r.json();
      if (ok) setWeek(data);
    })();
    return () => { ok = false; };
  }, [startISO, days]);

  useEffect(() => {
    let ok = true;
    (async () => {
      const r = await fetch(`/api/availability/summary?month=${monthStr}`, { cache: "no-store" });
      const data = r.ok ? await r.json() : { counts: {} };
      if (ok) setCounts(data.counts || {});
    })();
    return () => { ok = false; };
  }, [monthStr]);

  function nav(to: "prev" | "next" | "this") {
    const base = DateTime.fromISO(startISO);
    const dt =
      to === "prev" ? base.minus({ weeks: 1 }) :
      to === "next" ? base.plus({ weeks: 1 }) :
      DateTime.local().startOf("week").plus({ days: 1 });
    router.push(`/week?start=${dt.toISODate()}&days=${days}`);
  }

  if (!week) return <div className="surface" style={{ padding: 16 }}>Loading…</div>;

  return (
    <WeekGrid
      title={`Week view • Month: ${monthStr}`}
      week={week}
      counts={counts}
      onPrev={() => nav("prev")}
      onNext={() => nav("next")}
      onThisWeek={() => nav("this")}
    />
  );
}
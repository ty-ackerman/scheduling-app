"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import WeekHeader from "./components/WeekHeader";
import { useWeekData } from "./hooks/useWeekData";
import CalendarGrid from "./components/CalendarGrid";
import type { AvailabilityAPI } from "./types";

type DraftShape = { selections: string[]; everyWeekIds: string[] };

function lsKey(monthStr: string, email?: string) {
  const who = (email || "anon").toLowerCase();
  return `staffWeekDraft:v2:${who}:${monthStr}`;
}

function setEquals<A>(a: Set<A>, b: Set<A>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export default function StaffWeekPage() {
  const qs = useSearchParams();
  const router = useRouter();

  const startISOQuery = qs.get("start") || "";
  const weekStartISO = useMemo(() => {
    if (startISOQuery) return startISOQuery;
    return DateTime.local().startOf("week").plus({ days: 1 }).toISODate()!;
  }, [startISOQuery]);

  const daysParam = Math.max(1, Math.min(7, parseInt(qs.get("days") || "7", 10)));
  const monthStr = useMemo(() => DateTime.fromISO(weekStartISO).toFormat("yyyy-LL"), [weekStartISO]);

  const { week, loading, errorMsg } = useWeekData(weekStartISO, daysParam);
  const readOnly = (week?.month?.status ?? "DRAFT") === "FINAL";

  // server truth
  const [availability, setAvailability] = useState<AvailabilityAPI | null>(null);

  // local draft
  const [selectedLocal, setSelectedLocal] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  /** Load availability + hydrate draft */
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/availability?month=${encodeURIComponent(monthStr)}`, { cache: "no-store" });
      let data: AvailabilityAPI = { month: monthStr, selections: [], everyWeekIds: [] };
      if (res.ok) data = await res.json();

      if (!alive) return;
      setAvailability(data);

      const key = lsKey(monthStr, data.user?.email);
      const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;

      if (raw) {
        try {
          const draft: DraftShape = JSON.parse(raw);
          const sel = new Set(draft.selections ?? []);
          setSelectedLocal(sel);
          const serverSel = new Set(data.selections ?? []);
          setDirty(!setEquals(sel, serverSel));
          return;
        } catch {
          /* fall through to server truth */
        }
      }
      const sel = new Set(data.selections ?? []);
      setSelectedLocal(sel);
      setDirty(false);
    })();
    return () => { alive = false; };
  }, [monthStr]);

  /** Persist draft + recompute dirty vs server */
  useEffect(() => {
    if (!availability) return;
    const key = lsKey(monthStr, availability.user?.email);
    const payload: DraftShape = { selections: Array.from(selectedLocal), everyWeekIds: [] };
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch {}
    const serverSel = new Set(availability.selections ?? []);
    setDirty(!setEquals(selectedLocal, serverSel));
  }, [selectedLocal, availability, monthStr]);

  /** Week nav */
  function pushWeek(iso: string) {
    router.push(`/staff/week?start=${encodeURIComponent(iso)}&days=${daysParam}`);
  }
  const onPrev = () => pushWeek(DateTime.fromISO(weekStartISO).minus({ weeks: 1 }).toISODate()!);
  const onNext = () => pushWeek(DateTime.fromISO(weekStartISO).plus({ weeks: 1 }).toISODate()!);
  const onThisWeek = () => pushWeek(DateTime.local().startOf("week").plus({ days: 1 }).toISODate()!);

  /** Block toggle */
  function toggleBlock(id: string) {
    if (readOnly) return;
    setSelectedLocal(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /** Save / Reset */
  async function onSave() {
    if (!availability) return;
    setSaving(true);
    const body = {
      month: monthStr,
      datedBlockIds: Array.from(selectedLocal),
      everyWeekIds: [] as string[],
    };
    const res = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setSaving(false);
      return;
    }

    const srv: AvailabilityAPI = await res.json();
    // Align server truth
    setAvailability(srv);
    setSelectedLocal(new Set(srv.selections ?? []));

    const key = lsKey(monthStr, availability.user?.email);
    try { localStorage.setItem(key, JSON.stringify({ selections: srv.selections ?? [], everyWeekIds: [] })); } catch {}

    setDirty(false);
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  function onReset() {
    if (!availability) return;
    const sel = new Set(availability.selections ?? []);
    setSelectedLocal(sel);
    const key = lsKey(monthStr, availability.user?.email);
    try { localStorage.removeItem(key); } catch {}
    setDirty(false);
  }

  return (
    <div>
      <WeekHeader
        weekStartISO={weekStartISO}
        monthStr={monthStr}
        readOnly={readOnly}
        onPrev={onPrev}
        onNext={onNext}
        onThisWeek={onThisWeek}
        dirty={dirty}
        saving={saving}
        errorMsg={errorMsg}
        onReset={onReset}
        onSave={onSave}
        statusLabel={
          savedFlash ? "Saved" : (readOnly ? "Final" : "Draft")
        }
      />

      {loading && <div className="surface" style={{ padding: 16 }}>Loading…</div>}
      {errorMsg && <div className="surface" style={{ padding: 16, color: "#ef4444" }}>{errorMsg}</div>}
      {week && (
        <CalendarGrid
          week={week}
          monthStr={monthStr}
          readOnly={readOnly}
          selectedLocal={selectedLocal}
          onToggleBlock={toggleBlock}
        />
      )}
    </div>
  );
}
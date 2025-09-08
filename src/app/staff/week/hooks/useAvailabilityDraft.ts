// src/app/staff/week/hooks/useAvailabilityDraft.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import type { AvailabilityAPI, DraftShape } from "../types";

function setEquals<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** LocalStorage key (scoped to user + month to avoid cross-account drafts) */
function lsKey(monthStr: string, email?: string) {
  const who = (email || "anon").toLowerCase();
  return `staffWeekDraft:v1:${who}:${monthStr}`;
}

export function useAvailabilityDraft(monthStr: string) {
  const [availability, setAvailability] = useState<AvailabilityAPI | null>(null);
  const [selectedLocal, setSelectedLocal] = useState<Set<string>>(new Set());
  const [everyWeekLocal, setEveryWeekLocal] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // load from server, hydrate from LS if present
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/availability?month=${encodeURIComponent(monthStr)}`, { cache: "no-store" });
        let data: AvailabilityAPI;
        if (!res.ok) {
          if (res.status === 401) {
            data = { month: monthStr, selections: [], everyWeekIds: [] };
          } else {
            const t = await res.text();
            console.warn("[useAvailabilityDraft] non-200:", res.status, t);
            data = { month: monthStr, selections: [], everyWeekIds: [] };
          }
        } else {
          data = await res.json();
        }
        if (!alive) return;

        setAvailability(data);

        const key = lsKey(monthStr, data.user?.email);
        const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;

        if (raw) {
          try {
            const draft = JSON.parse(raw) as DraftShape;
            const sel = new Set(draft.selections ?? []);
            const ew = new Set(draft.everyWeekIds ?? []);
            setSelectedLocal(sel);
            setEveryWeekLocal(ew);
            const serverSel = new Set(data.selections ?? []);
            const serverEw = new Set(data.everyWeekIds ?? []);
            setDirty(!setEquals(sel, serverSel) || !setEquals(ew, serverEw));
          } catch {
            const sel = new Set(data.selections ?? []);
            const ew = new Set(data.everyWeekIds ?? []);
            setSelectedLocal(sel);
            setEveryWeekLocal(ew);
            setDirty(false);
          }
        } else {
          const sel = new Set(data.selections ?? []);
          const ew = new Set(data.everyWeekIds ?? []);
          setSelectedLocal(sel);
          setEveryWeekLocal(ew);
          setDirty(false);
        }
      } catch (e) {
        console.warn(e);
        if (!alive) return;
        setAvailability({ month: monthStr, selections: [], everyWeekIds: [] });
        setSelectedLocal(new Set());
        setEveryWeekLocal(new Set());
        setDirty(false);
      }
    })();
    return () => { alive = false; };
  }, [monthStr]);

  // persist to LS + recompute dirty
  useEffect(() => {
    if (!availability) return;
    const key = lsKey(monthStr, availability.user?.email);
    const draft: DraftShape = {
      selections: Array.from(selectedLocal),
      everyWeekIds: Array.from(everyWeekLocal),
    };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch { /* ignore */ }

    const serverSel = new Set(availability.selections ?? []);
    const serverEw = new Set(availability.everyWeekIds ?? []);
    setDirty(!setEquals(selectedLocal, serverSel) || !setEquals(everyWeekLocal, serverEw));
  }, [selectedLocal, everyWeekLocal, availability, monthStr]);

  function onResetToServer() {
    if (!availability) return;
    const sel = new Set(availability.selections ?? []);
    const ew = new Set(availability.everyWeekIds ?? []);
    setSelectedLocal(sel);
    setEveryWeekLocal(ew);
    setDirty(false);
    const key = lsKey(monthStr, availability.user?.email);
    try { localStorage.removeItem(key); } catch {}
  }

  async function onSaveToServer() {
    if (!availability) return;
    setSaving(true);
    setErrorMsg(null);
    setSavedFlash(false);

    const blockIds = Array.from(selectedLocal);
    const everyWeekIds = Array.from(everyWeekLocal);

    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthStr, blockIds, everyWeekIds }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[useAvailabilityDraft] save failed:", res.status, text);
        setErrorMsg(res.status === 401 ? "You are signed out. Please sign in and try again." : "Failed to save changes.");
        setSaving(false);
        return;
      }

      setAvailability({
        month: monthStr,
        selections: blockIds,
        everyWeekIds,
        user: availability.user,
      });

      const key = lsKey(monthStr, availability.user?.email);
      try { localStorage.setItem(key, JSON.stringify({ selections: blockIds, everyWeekIds })); } catch {}

      setDirty(false);
      setSaving(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to save changes.");
      setSaving(false);
    }
  }

  return {
    availability,
    selectedLocal, setSelectedLocal,
    everyWeekLocal, setEveryWeekLocal,
    dirty, saving, savedFlash, errorMsg, setErrorMsg,
    onResetToServer, onSaveToServer,
  };
}
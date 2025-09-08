"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DateTime } from "luxon";

/** ----- Types from APIs ----- */
type Block = {
  id: string;
  day: number;         // 1..7 (Mon..Sun)
  startMin: number;    // minutes from 00:00
  endMin: number;      // minutes from 00:00
  label?: string | null;
  locked: boolean;
  isClass: boolean;
};

type WeekAPI = {
  startISO: string; // week start date (Mon) e.g., 2025-10-06
  days: { dateISO: string; blocks: Block[] }[];
};

type AvailabilityAPI = {
  month: string;        // "YYYY-MM"
  selections: string[]; // blockIds
  everyWeekIds: string[];
  user?: { id: string; email: string; name?: string | null };
};

/** ----- Helpers ----- */
const HOUR_STEP_MIN = 60;

function minsToHHMM(mins: number) {
  const dt = DateTime.fromObject({ hour: Math.floor(mins / 60), minute: mins % 60 });
  return dt.toFormat("h:mm a");
}

function formatRange(startMin: number, endMin: number) {
  return `${minsToHHMM(startMin)} – ${minsToHHMM(endMin)}`;
}

function setEquals<A>(a: Set<A>, b: Set<A>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** LocalStorage key (scoped to user + month to avoid cross-account drafts) */
function lsKey(monthStr: string, email?: string) {
  const who = (email || "anon").toLowerCase();
  return `staffWeekDraft:v1:${who}:${monthStr}`;
}

type DraftShape = {
  selections: string[];
  everyWeekIds: string[];
};

export default function StaffWeekCalendarWithLocalDraftAndSave() {
  const qs = useSearchParams();
  const startISO = qs.get("start") || "2025-10-06";
  const daysParam = Math.max(1, Math.min(7, parseInt(qs.get("days") || "7", 10) || 7));

  const monthStr = useMemo(() => {
    const dt = DateTime.fromISO(startISO);
    return dt.isValid ? dt.toFormat("yyyy-LL") : "2025-10";
  }, [startISO]);

  const [week, setWeek] = useState<WeekAPI | null>(null);
  const [availability, setAvailability] = useState<AvailabilityAPI | null>(null);

  // Local draft state
  const [selectedLocal, setSelectedLocal] = useState<Set<string>>(new Set());
  const [everyWeekLocal, setEveryWeekLocal] = useState<Set<string>>(new Set());

  // UI flags
  const [dirty, setDirty] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  /** Load week blocks */
  useEffect(() => {
    let alive = true;
    (async () => {
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/blocks/week?start=${encodeURIComponent(startISO)}&days=${daysParam}`, { cache: "no-store" });
        if (!res.ok) {
          const t = await res.text();
          console.error("[staff/week] blocks fetch failed:", t);
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
  }, [startISO, daysParam]);

  /** Load availability (server truth), hydrate from LS draft if present */
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
            console.warn("[staff/week] availability fetch non-200:", res.status, t);
            data = { month: monthStr, selections: [], everyWeekIds: [] };
          }
        } else {
          data = await res.json();
        }

        if (!alive) return;

        setAvailability(data);

        // If we have a draft in LS, prefer it for the local state
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
            // Bad JSON → fall back to server truth
            const sel = new Set(data.selections ?? []);
            const ew = new Set(data.everyWeekIds ?? []);
            setSelectedLocal(sel);
            setEveryWeekLocal(ew);
            setDirty(false);
          }
        } else {
          // No draft → use server truth
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

  /** Persist draft to LS whenever local changes occur */
  useEffect(() => {
    if (!availability) return;
    const key = lsKey(monthStr, availability.user?.email);
    const draft: DraftShape = {
      selections: Array.from(selectedLocal),
      everyWeekIds: Array.from(everyWeekLocal),
    };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* ignore quota issues */
    }

    // Update dirty flag vs server truth
    const serverSel = new Set(availability.selections ?? []);
    const serverEw = new Set(availability.everyWeekIds ?? []);
    setDirty(!setEquals(selectedLocal, serverSel) || !setEquals(everyWeekLocal, serverEw));
  }, [selectedLocal, everyWeekLocal, availability, monthStr]);

  /** Build vertical time axis from all blocks in the week */
  const timeline = useMemo<number[]>(() => {
    if (!week) return [];
    const times = new Set<number>();
    for (const d of week.days) {
      for (const b of d.blocks) {
        times.add(b.startMin);
        times.add(b.endMin);
      }
    }
    const arr = Array.from(times).sort((a, b) => a - b);
    const minTime = arr[0] ?? 7 * 60;
    const maxTime = arr[arr.length - 1] ?? 22 * 60;
    const startHour = Math.floor(minTime / 60) * 60;
    const endHour = Math.ceil(maxTime / 60) * 60;
    const out: number[] = [];
    for (let t = startHour; t <= endHour; t += HOUR_STEP_MIN) out.push(t);
    return out;
  }, [week]);

  /** Local-only interactions */
  function toggleBlock(id: string, locked: boolean) {
    if (locked) return;
    setSelectedLocal(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setEveryWeekLocal(prevEW => {
          const ew = new Set(prevEW);
          ew.delete(id);
          return ew;
        });
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleEveryWeek(id: string) {
    setEveryWeekLocal(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onResetToServer() {
    if (!availability) return;
    const sel = new Set(availability.selections ?? []);
    const ew = new Set(availability.everyWeekIds ?? []);
    setSelectedLocal(sel);
    setEveryWeekLocal(ew);
    setDirty(false);
    const key = lsKey(monthStr, availability.user?.email);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
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
        body: JSON.stringify({
          month: monthStr,
          blockIds,
          everyWeekIds,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[staff/week] save failed:", res.status, text);
        setErrorMsg(res.status === 401 ? "You are signed out. Please sign in and try again." : "Failed to save changes.");
        setSaving(false);
        return;
      }

      // Success → align server truth and local draft
      setAvailability({
        month: monthStr,
        selections: blockIds,
        everyWeekIds,
        user: availability.user,
      });
      const key = lsKey(monthStr, availability.user?.email);
      try {
        localStorage.setItem(key, JSON.stringify({ selections: blockIds, everyWeekIds }));
      } catch { /* ignore */ }

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

  return (
    <div>
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
          <h1 style={{ margin: 0, fontWeight: 400, fontSize: 20 }}>My Availability — Week (Calendar)</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Month: <strong>{monthStr}</strong>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dirty ? (
            <span
              className="pill"
              style={{
                borderColor: "#ef4444",
                background: "color-mix(in oklab, #ef4444 10%, transparent)",
                color: "#ef4444",
                fontSize: 12,
              }}
              title="Local draft differs from what’s on the server"
            >
              Unsaved changes
            </span>
          ) : savedFlash ? (
            <span
              className="pill"
              style={{
                borderColor: "#34d399",
                background: "color-mix(in oklab, #34d399 12%, transparent)",
                color: "#34d399",
                fontSize: 12,
              }}
            >
              Saved
            </span>
          ) : (
            <span
              className="pill"
              style={{
                borderColor: "var(--border-strong)",
                background: "transparent",
                color: "var(--muted)",
                fontSize: 12,
              }}
            >
              Up to date
            </span>
          )}

          {errorMsg && (
            <span
              className="pill"
              style={{
                borderColor: "#ef4444",
                background: "color-mix(in oklab, #ef4444 10%, transparent)",
                color: "#ef4444",
                fontSize: 12,
              }}
              title={errorMsg}
            >
              {errorMsg}
            </span>
          )}

          <button className="btn" onClick={onResetToServer} disabled={!dirty || saving} title="Discard local draft">
            Reset
          </button>

          <button
            className="btn btn-primary"
            onClick={onSaveToServer}
            disabled={!dirty || saving}
            title={dirty ? "Save changes to server" : "No changes to save"}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {!week ? (
        <div className="surface" style={{ padding: 16 }}>Loading…</div>
      ) : (
        <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
          {/* Header row: Time + 7 days */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "80px repeat(7, 1fr)",
              borderBottom: "1px solid var(--border)",
              background: "var(--card)",
            }}
          >
            <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>Time</div>
            {week.days.map((d) => {
              const label = DateTime.fromISO(d.dateISO).toFormat("ccc MM/dd");
              return (
                <div key={d.dateISO} style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
                  {label}
                </div>
              );
            })}
          </div>

          {/* Body grid: time column + 7 day columns */}
          <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", position: "relative" }}>
            {/* Time rail */}
            <div style={{ borderRight: "1px solid var(--border)" }}>
              {timeline.map((t, i) => (
                <div
                  key={t}
                  style={{
                    height: 64, // 1h = 64px
                    borderBottom: "1px solid var(--border)",
                    fontSize: 11,
                    color: "var(--muted)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "flex-end",
                    paddingRight: 8,
                    paddingTop: 6,
                    background: i % 2 ? "var(--hover)" : "transparent",
                  }}
                >
                  {DateTime.fromObject({ hour: Math.floor(t / 60), minute: 0 }).toFormat("HH:mm")}
                </div>
              ))}
            </div>

            {/* Seven day columns */}
            {week.days.map((d) => {
              const firstTick = timeline[0] ?? 7 * 60;

              return (
                <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
                  {/* Hour stripes */}
                  {timeline.map((t, i) => (
                    <div key={t} style={{ height: 64, borderBottom: "1px solid var(--border)", background: i % 2 ? "var(--hover)" : "transparent" }} />
                  ))}

                  {/* Absolute layer with blocks */}
                  <div style={{ position: "absolute", inset: 0, padding: "6px 8px" }}>
                    {d.blocks.map((b) => {
                      const topPx = ((b.startMin - firstTick) / HOUR_STEP_MIN) * 64 + 2; // +2 for breathing room
                      const heightPx = Math.max(24, ((b.endMin - b.startMin) / HOUR_STEP_MIN) * 64 - 8); // min height + spacing

                      const isSelected = selectedLocal.has(b.id);
                      const isEvery = everyWeekLocal.has(b.id);

                      const baseBg = b.locked ? "rgba(148,163,184,0.20)" : "rgba(59,130,246,0.14)"; // gray/blue
                      const baseBorder = b.locked ? "rgba(148,163,184,0.55)" : "rgba(59,130,246,0.55)";

                      return (
                        <button
                          key={b.id}
                          type="button"
                          disabled={b.locked}
                          onClick={(e) => {
                            // Ignore clicks from the inner "Every week" control
                            const target = e.target as HTMLElement;
                            if (target.closest("[data-ew-toggle]")) return;
                            toggleBlock(b.id, b.locked);
                          }}
                          className="surface"
                          style={{
                            position: "absolute",
                            left: 8,
                            right: 8,
                            top: topPx,
                            height: heightPx,
                            borderRadius: 10,
                            padding: "10px 12px",
                            background: baseBg,
                            border: `1px solid ${baseBorder}`,
                            boxShadow: "0 6px 10px rgba(0,0,0,0.06)",
                            backdropFilter: "saturate(120%) blur(2px)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            cursor: b.locked ? "not-allowed" : "pointer",
                            textAlign: "left",
                          }}
                          title={formatRange(b.startMin, b.endMin)}
                        >
                          <div style={{ fontSize: 12, fontWeight: 400 }}>
                            {formatRange(b.startMin, b.endMin)}
                            {b.label ? <span style={{ marginLeft: 8, color: "var(--muted)" }}>• {b.label}</span> : null}
                            {b.isClass ? <span style={{ marginLeft: 8, color: "var(--muted-2)", fontSize: 11 }}>(Class)</span> : null}
                            {b.locked ? <span style={{ marginLeft: 8, color: "var(--muted-2)", fontSize: 11 }}>(Locked)</span> : null}
                          </div>

                          {/* Chips + Every-week control */}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {isSelected && (
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  background: "var(--ok-bg)",
                                  color: "var(--ok-fg)",
                                  fontSize: 11,
                                  border: "1px solid color-mix(in oklab, var(--ok-fg) 20%, transparent)",
                                }}
                              >
                                Selected
                              </span>
                            )}

                            {isSelected && (
                              <label
                                data-ew-toggle
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: 11,
                                  color: "var(--muted)",
                                  cursor: "pointer",
                                  userSelect: "none",
                                }}
                              >
                                <input
                                  data-ew-toggle
                                  type="checkbox"
                                  checked={isEvery}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleEveryWeek(b.id);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                  }}
                                  style={{ cursor: "pointer" }}
                                  aria-label="Every week"
                                />
                                Every week
                              </label>
                            )}

                            {!isSelected && (
                              <span style={{ fontSize: 11, color: "var(--muted-2)" }}>Tap to select</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
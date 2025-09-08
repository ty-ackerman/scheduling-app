"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DateTime } from "luxon";

type ApiWeek = {
  startISO: string;
  days: { dateISO: string; weekday: number; blocks: Block[] }[];
};
type Block = {
  id: string;
  day: number;
  startMin: number;
  endMin: number;
  label: string | null;
  locked: boolean;
  isClass: boolean;
};

type AvailGet = {
  month: string; // "YYYY-MM"
  user: { id: string; email: string; name: string | null };
  selections: string[];
  everyWeekIds: string[];
};

const HOUR_PX = 80;
const BLOCK_GAP_PX = 45;
const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 22 * 60;

function fmt24(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function to12h(mins: number) {
  const dt = DateTime.fromObject({ hour: Math.floor(mins / 60), minute: mins % 60 });
  return dt.toFormat("h:mm a").replace(":00", "");
}
function monthFromISO(startISO: string) {
  const d = DateTime.fromISO(startISO);
  return d.toFormat("yyyy-LL");
}
function classNames(...xs: (string | undefined | false)[]) {
  return xs.filter(Boolean).join(" ");
}

export default function StaffWeekPage() {
  const qs = useSearchParams();
  const startISO = qs.get("start") || "2025-10-06"; // default to Oct 6 for your dataset
  const days = Math.max(1, Math.min(7, Number(qs.get("days") || 7)));
  const [week, setWeek] = useState<ApiWeek | null>(null);
  const [server, setServer] = useState<AvailGet | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [every, setEvery] = useState<Set<string>>(new Set());

  const [status, setStatus] =
    useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");

  const monthKey = useMemo(() => {
    const m = monthFromISO(startISO); // "2025-10"
    const uid = server?.user?.id ?? "unknown";
    return `avail:${uid}:${m}`;
  }, [startISO, server?.user?.id]);

  // Load week blocks and server availability
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStatus("idle");
        const [wRes, aRes] = await Promise.all([
          fetch(`/api/blocks/week?start=${encodeURIComponent(startISO)}&days=${days}`, { cache: "no-store" }),
          fetch(`/api/availability?month=${encodeURIComponent(monthFromISO(startISO))}`, { cache: "no-store" }),
        ]);
        if (!wRes.ok) throw new Error(await wRes.text());
        if (!aRes.ok) throw new Error(await aRes.text());
        const w: ApiWeek = await wRes.json();
        const a: AvailGet = await aRes.json();
        if (!alive) return;
        setWeek(w);
        setServer(a);

        // Build valid ids set from this view
        const valid = new Set<string>(
          w.days.flatMap(d => d.blocks.map(b => b.id))
        );

        // Merge: prefer localStorage for this user+month if present; sanitize against valid ids
        const raw = localStorage.getItem(`avail:${a.user.id}:${a.month}`);
        let local: { sel: string[]; ev: string[] } | null = null;
        try { local = raw ? JSON.parse(raw) : null; } catch { local = null; }

        const selFrom = local?.sel ?? a.selections ?? [];
        const evFrom = local?.ev ?? a.everyWeekIds ?? [];

        const cleanedSel = selFrom.filter(id => valid.has(id));
        const cleanedEv = evFrom.filter(id => valid.has(id) && cleanedSel.includes(id));

        setSelected(new Set(cleanedSel));
        setEvery(new Set(cleanedEv));

        const serverSet = new Set(a.selections);
        const serverEvery = new Set(a.everyWeekIds);
        const sameSel = cleanedSel.length === serverSet.size && cleanedSel.every(id => serverSet.has(id));
        const sameEv = cleanedEv.length === serverEvery.size && cleanedEv.every(id => serverEvery.has(id));

        setStatus(sameSel && sameEv ? "idle" : "dirty");

        // If LS had stale ids, rewrite
        if (local && (!sameSel || !sameEv)) {
          localStorage.setItem(`avail:${a.user.id}:${a.month}`, JSON.stringify({ sel: cleanedSel, ev: cleanedEv }));
        }
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    })();
    return () => { alive = false; };
  }, [startISO, days]);

  const validIds = useMemo(() => new Set(week?.days.flatMap(d => d.blocks.map(b => b.id)) ?? []), [week]);

  function toggle(id: string) {
    if (!validIds.has(id)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setEvery(ev => {
          const ne = new Set(ev);
          ne.delete(id);
          return ne;
        });
      } else {
        next.add(id);
      }
      setStatus("dirty");
      return next;
    });
  }

  function toggleEvery(id: string) {
    if (!validIds.has(id) || !selected.has(id)) return;
    setEvery(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setStatus("dirty");
      return next;
    });
  }

  async function onSave() {
    if (!server) return;
    setStatus("saving");
    const blockIds = Array.from(selected).filter(id => validIds.has(id));
    const everyWeekIds = Array.from(every).filter(id => selected.has(id) && validIds.has(id));
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: server.month,
          blockIds,
          everyWeekIds,
        }),
      });
      if (!res.ok) {
        console.error("Save failed:", await res.text());
        setStatus("error");
        return;
      }
      // Sync LS to saved state
      localStorage.setItem(`avail:${server.user.id}:${server.month}`, JSON.stringify({ sel: blockIds, ev: everyWeekIds }));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1200);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  function onResetToServer() {
    if (!server || !week) return;
    const valid = new Set<string>(week.days.flatMap(d => d.blocks.map(b => b.id)));
    const cleanedSel = (server.selections ?? []).filter(id => valid.has(id));
    const cleanedEv = (server.everyWeekIds ?? []).filter(id => valid.has(id) && cleanedSel.includes(id));
    setSelected(new Set(cleanedSel));
    setEvery(new Set(cleanedEv));
    localStorage.removeItem(`avail:${server.user.id}:${server.month}`);
    setStatus("idle");
  }

  // Timeline ticks
  const ticks: number[] = [];
  for (let t = DAY_START_MIN; t <= DAY_END_MIN; t += 60) ticks.push(t);

  const saveBtnClass = classNames(
    "btn",
    status === "dirty" && "btn",
    status === "saved" && "btn",
    status === "saving" && "btn",
  );

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>My Availability</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onResetToServer}>Reset to server</button>
          <button className={saveBtnClass} onClick={onSave} disabled={status === "saving"}>
            {status === "dirty" && "Save (unsaved changes)"}
            {status === "saving" && "Saving…"}
            {status === "saved" && "Saved"}
            {(status === "idle" || status === "error") && "Save"}
          </button>
        </div>
      </div>

      {!week ? (
        <div>Loading…</div>
      ) : (
        <>
          <div style={{ color: "var(--muted)", marginBottom: 10 }}>
            Week of {DateTime.fromISO(week.startISO).toFormat("ccc MMM dd")} • Month {monthFromISO(week.startISO)}
          </div>

          <div className="surface" style={{ overflow: "hidden", borderRadius: 12 }}>
            {/* header */}
            <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${week.days.length}, 1fr)`, borderBottom: "1px solid var(--border)" }}>
              <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>Time</div>
              {week.days.map(d => (
                <div key={d.dateISO} style={{ padding: "10px 12px", textAlign: "center", fontSize: 12 }}>
                  {DateTime.fromISO(d.dateISO).toFormat("ccc MM/dd")}
                </div>
              ))}
            </div>

            {/* body */}
            <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${week.days.length}, 1fr)` }}>
              {/* time column */}
              <div style={{ borderRight: "1px solid var(--border)" }}>
                {ticks.map(t => (
                  <div key={t} style={{
                    height: HOUR_PX,
                    borderBottom: "1px solid var(--border)",
                    fontSize: 12, color: "var(--muted)",
                    display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                    paddingRight: 8, paddingTop: 6
                  }}>
                    {fmt24(t)}
                  </div>
                ))}
              </div>

              {/* day columns */}
              {week.days.map(d => (
                <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
                  {/* grid rows */}
                  {ticks.map((t, i) => (
                    <div key={t} style={{
                      height: HOUR_PX,
                      borderBottom: "1px solid var(--border)",
                      background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent",
                    }} />
                  ))}

                  {/* blocks */}
                  <div style={{ position: "absolute", inset: 0, padding: "0 10px" }}>
                    {d.blocks.map(b => {
                      const topBase = ((b.startMin - DAY_START_MIN) / 60) * HOUR_PX;
                      let heightPx = ((b.endMin - b.startMin) / 60) * HOUR_PX;
                      const topPx = topBase + BLOCK_GAP_PX / 2;
                      heightPx = Math.max(24, heightPx - BLOCK_GAP_PX);

                      const isOn = selected.has(b.id);
                      const isEvery = every.has(b.id);

                      return (
                        <div
                          key={b.id}
                          style={{
                            position: "absolute",
                            left: 10, right: 10, top: topPx, height: heightPx,
                            borderRadius: 16,
                            border: "1px solid rgba(80,150,255,0.55)",
                            background: isOn
                              ? "linear-gradient(180deg, rgba(16,185,129,0.30), rgba(5,150,105,0.30))"
                              : "linear-gradient(180deg, rgba(40,90,150,0.55), rgba(20,50,95,0.55))",
                            boxShadow: "0 10px 22px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
                            padding: "12px 14px",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            cursor: b.locked ? "not-allowed" : "pointer",
                            filter: b.locked ? "grayscale(0.4) opacity(0.7)" : "none",
                          }}
                          onClick={() => { if (!b.locked) toggle(b.id); }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>
                              {to12h(b.startMin)}–{to12h(b.endMin)}
                            </div>
                            {b.isClass && (
                              <span style={{
                                border: "1px solid rgba(255,255,255,0.5)",
                                borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 600,
                                background: "rgba(255,255,255,0.06)",
                              }}>
                                CLASS
                              </span>
                            )}
                          </div>

                          {/* Every week switch (only visible when selected) */}
                          {isOn && (
                            <label
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, marginTop: 8, userSelect: "none" }}
                            >
                              <input
                                type="checkbox"
                                checked={isEvery}
                                onChange={() => toggleEvery(b.id)}
                              />
                              Every week this month
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
            Tip: Click a block to mark Available. When selected, you can mark “Every week this month”.
          </div>
        </>
      )}
    </div>
  );
}
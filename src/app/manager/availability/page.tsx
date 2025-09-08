"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";

/** Types returned by /api/availability/week-summary */
type BlockSummary = {
  id: string;
  day: number; // 1..7
  startMin: number;
  endMin: number;
  label?: string | null;
  locked: boolean;
  isClass: boolean;
  count: number; // # of users available
};
type WeekSummary = {
  startISO: string;
  days: { dateISO: string; blocks: BlockSummary[] }[];
  month: { year: number; month: number; exists: boolean };
};

const HOUR_STEP_MIN = 60;

function minsToHHMM(mins: number) {
  const dt = DateTime.fromObject({ hour: Math.floor(mins / 60), minute: mins % 60 });
  return dt.toFormat("h:mm a");
}
function formatRange(startMin: number, endMin: number) {
  return `${minsToHHMM(startMin)} – ${minsToHHMM(endMin)}`;
}

export default function ManagerAvailabilityWeek() {
  const qs = useSearchParams();
  const router = useRouter();

  const startISOQuery = qs.get("start") || "";
  const daysParam = Math.max(1, Math.min(7, parseInt(qs.get("days") || "7", 10) || 7));

  // Default to current Monday
  const weekStartISO = useMemo(() => {
    if (startISOQuery) return startISOQuery;
    const monday = DateTime.local().startOf("week").plus({ days: 1 }); // Luxon Sunday=1, so +1 to get Monday
    return monday.toISODate()!;
  }, [startISOQuery]);

  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setErrorMsg(null);
      try {
        const res = await fetch(
          `/api/availability/week-summary?start=${encodeURIComponent(weekStartISO)}&days=${daysParam}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const t = await res.text();
          console.error("[manager/availability] fetch failed:", res.status, t);
          if (alive) setErrorMsg("Failed to load availability summary.");
          return;
        }
        const data: WeekSummary = await res.json();
        if (alive) setWeek(data);
      } catch (e) {
        console.error(e);
        if (alive) setErrorMsg("Failed to load availability summary.");
      }
    })();
    return () => { alive = false; };
  }, [weekStartISO, daysParam]);

  // Build vertical hourly timeline based on all blocks in the week
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

  /** Week navigation */
  function pushWeek(newStartISO: string) {
    router.push(`/manager/availability?start=${encodeURIComponent(newStartISO)}&days=${daysParam}`);
  }
  function goPrevWeek() {
    const dt = DateTime.fromISO(weekStartISO).minus({ weeks: 1 });
    pushWeek(dt.toISODate()!);
  }
  function goNextWeek() {
    const dt = DateTime.fromISO(weekStartISO).plus({ weeks: 1 });
    pushWeek(dt.toISODate()!);
  }
  function goThisWeek() {
    const monday = DateTime.local().startOf("week").plus({ days: 1 });
    pushWeek(monday.toISODate()!);
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
          <h1 style={{ margin: 0, fontWeight: 400, fontSize: 20 }}>Manager — Week Availability Overview</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Week of <strong>{weekStartISO}</strong>
          </div>
        </div>

        <div className="pill" style={{ gap: 6 }}>
          <button className="btn btn-quiet" onClick={goPrevWeek} title="Previous week">← Prev</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={goThisWeek} title="Jump to this week">This week</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={goNextWeek} title="Next week">Next →</button>
        </div>
      </div>

      {errorMsg ? (
        <div className="surface" style={{ padding: 16, color: "var(--warn-fg)", background: "var(--warn-bg)" }}>
          {errorMsg}
        </div>
      ) : !week ? (
        <div className="surface" style={{ padding: 16 }}>Loading…</div>
      ) : (
        <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
          {/* Header: Time + 7 day columns */}
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

          {/* Body grid */}
          <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", position: "relative" }}>
            {/* Time rail */}
            <div style={{ borderRight: "1px solid var(--border)" }}>
              {timeline.map((t, i) => (
                <div
                  key={t}
                  style={{
                    height: 64,
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

            {/* 7 day columns */}
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
                      const topPx = ((b.startMin - firstTick) / HOUR_STEP_MIN) * 64 + 2;
                      const heightPx = Math.max(24, ((b.endMin - b.startMin) / HOUR_STEP_MIN) * 64 - 8);

                      // Colors: red for 0, blue/green for >0, grey if locked
                      const isEmpty = b.count === 0;
                      const bg = b.locked
                        ? "rgba(148,163,184,0.20)"
                        : isEmpty
                          ? "rgba(244,63,94,0.16)" // red-ish
                          : "rgba(59,130,246,0.14)"; // blue-ish
                      const border = b.locked
                        ? "rgba(148,163,184,0.55)"
                        : isEmpty
                          ? "rgba(244,63,94,0.55)"
                          : "rgba(59,130,246,0.55)";

                      return (
                        <div
                          key={b.id}
                          className="surface"
                          style={{
                            position: "absolute",
                            left: 8,
                            right: 8,
                            top: topPx,
                            height: heightPx,
                            borderRadius: 10,
                            padding: "10px 12px",
                            background: bg,
                            border: `1px solid ${border}`,
                            boxShadow: "0 6px 10px rgba(0,0,0,0.06)",
                            backdropFilter: "saturate(120%) blur(2px)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
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
                          <div style={{ fontSize: 12, color: isEmpty ? "#ef4444" : "var(--muted)" }}>
                            {b.count} {b.count === 1 ? "available" : "available"}
                          </div>
                        </div>
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
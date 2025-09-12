"use client";

import React, { useMemo } from "react";
import { DateTime } from "luxon";

export type WeekGridBlock = {
  id: string;
  startMin: number;
  endMin: number;
  label?: string | null;
  locked: boolean;
  isClass: boolean;
};

export type WeekGridDay = {
  dateISO: string;
  blocks: WeekGridBlock[];
};

type Props = {
  days: WeekGridDay[];
  // default counts (used when 0 or 1 role selected)
  counts: Record<string, number>;
  // when >1 roles selected, render lanes:
  selectedRoles?: string[]; // e.g. ["FACILITATOR","FRONT_DESK"]
  countsByRole?: Record<string, Record<string, number>>; // role -> blockId -> count
  onBlockClick?: (block: WeekGridBlock & { dateISO: string }, roleOverride?: string) => void;
};

const HOUR_STEP = 60;

export default function WeekGrid({ days, counts, selectedRoles = [], countsByRole = {}, onBlockClick }: Props) {
  const timeline = useMemo(() => {
    const times = new Set<number>();
    for (const d of days) for (const b of d.blocks) { times.add(b.startMin); times.add(b.endMin); }
    const arr = Array.from(times).sort((a, b) => a - b);
    const min = arr[0] ?? 7 * 60;
    const max = arr[arr.length - 1] ?? 22 * 60;
    const start = Math.floor(min / 60) * 60;
    const end = Math.ceil(max / 60) * 60;
    const out: number[] = [];
    for (let t = start; t <= end; t += HOUR_STEP) out.push(t);
    return out;
  }, [days]);

  const multiRole = selectedRoles.length > 1;
  const laneCount = Math.max(1, selectedRoles.length);

  return (
    <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
      {/* header */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>Time</div>
        {days.map(d => (
          <div key={d.dateISO} style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
            {DateTime.fromISO(d.dateISO).toFormat("ccc MM/dd")}
          </div>
        ))}
      </div>

      {/* body */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", position: "relative" }}>
        {/* time rail */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
          {timeline.map((t, i) => (
            <div key={t} style={{
              height: 64, borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--muted)",
              display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 8, paddingTop: 6,
              background: i % 2 ? "var(--hover)" : "transparent",
            }}>
              {DateTime.fromObject({ hour: Math.floor(t / 60), minute: 0 }).toFormat("HH:mm")}
            </div>
          ))}
        </div>

        {/* day columns */}
        {days.map(d => {
          const firstTick = timeline[0] ?? 7 * 60;
          return (
            <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
              {timeline.map((t, i) => (
                <div key={t} style={{ height: 64, borderBottom: "1px solid var(--border)", background: i % 2 ? "var(--hover)" : "transparent" }} />
              ))}
              <div style={{ position: "absolute", inset: 0, padding: "6px 8px" }}>
                {d.blocks.map(b => {
                  const top = ((b.startMin - firstTick) / HOUR_STEP) * 64 + 2;
                  const height = Math.max(24, ((b.endMin - b.startMin) / HOUR_STEP) * 64 - 8);

                  // Single-lane (0 or 1 role selected) → draw full-width
                  if (!multiRole) {
                    const count = counts[b.id] ?? 0;
                    const bg = b.locked ? "rgba(148,163,184,0.20)" : count > 0 ? "rgba(16,185,129,0.18)" : "rgba(59,130,246,0.14)";
                    const border = b.locked ? "rgba(148,163,184,0.55)" : count > 0 ? "rgba(16,185,129,0.55)" : "rgba(59,130,246,0.55)";
                    return (
                      <button
                        key={b.id}
                        className="surface"
                        onClick={() => onBlockClick?.({ ...b, dateISO: d.dateISO })}
                        title={`${fmt(b.startMin)}–${fmt(b.endMin)}`}
                        style={{
                          position: "absolute", left: 8, right: 8, top, height,
                          borderRadius: 10, padding: "10px 12px",
                          background: bg, border: `1px solid ${border}`,
                          boxShadow: "0 6px 10px rgba(0,0,0,0.06)",
                          textAlign: "left", cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: 12 }}>
                          {fmt(b.startMin)} – {fmt(b.endMin)} {b.label ? <span style={{ color: "var(--muted)" }}>• {b.label}</span> : null}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{count} available</div>
                      </button>
                    );
                  }

                  // Multi-lane (>=2 roles): split horizontal space equally
                  const gapPx = 6;
                  const totalPadLeft = 8;
                  const totalPadRight = 8;
                  const innerWidth = `calc(100% - ${totalPadLeft + totalPadRight}px)`;
                  const laneWidthCalc = `calc((${innerWidth} - ${(laneCount - 1) * gapPx}px) / ${laneCount})`;

                  return (
                    <div key={b.id} style={{ position: "absolute", left: 8, right: 8, top, height, display: "flex", gap: gapPx }}>
                      {selectedRoles.map((role, idx) => {
                        const roleCounts = countsByRole[role] || {};
                        const count = roleCounts[b.id] ?? 0;
                        const bg = b.locked ? "rgba(148,163,184,0.20)" : count > 0 ? "rgba(16,185,129,0.18)" : "rgba(59,130,246,0.14)";
                        const border = b.locked ? "rgba(148,163,184,0.55)" : count > 0 ? "rgba(16,185,129,0.55)" : "rgba(59,130,246,0.55)";

                        return (
                          <button
                            key={role + "-" + b.id}
                            className="surface"
                            onClick={() => onBlockClick?.({ ...b, dateISO: d.dateISO }, role)}
                            title={`${role.replace("_"," ")} • ${fmt(b.startMin)}–${fmt(b.endMin)}`}
                            style={{
                              width: laneWidthCalc,
                              borderRadius: 10, padding: "10px 12px",
                              background: bg, border: `1px solid ${border}`,
                              boxShadow: "0 6px 10px rgba(0,0,0,0.06)",
                              textAlign: "left", cursor: "pointer",
                              display: "flex", flexDirection: "column", justifyContent: "space-between",
                            }}
                          >
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{role.replace("_"," ")}</div>
                            <div style={{ fontSize: 12 }}>
                              {fmt(b.startMin)} – {fmt(b.endMin)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{count} available</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmt(mins: number) {
  return DateTime.fromObject({ hour: Math.floor(mins / 60), minute: mins % 60 }).toFormat("h:mm a");
}
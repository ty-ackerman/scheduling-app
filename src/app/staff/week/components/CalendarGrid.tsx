// src/app/staff/week/components/CalendarGrid.tsx
"use client";

import { DateTime } from "luxon";
import type { Block, WeekAPI } from "../types";
import { HOUR_STEP_MIN, formatRange } from "@/lib/time";
import { useMemo } from "react";

type Props = {
  week: WeekAPI;
  selectedLocal: Set<string>;
  everyWeekLocal: Set<string>;
  toggleBlock: (id: string, locked: boolean) => void;
  toggleEveryWeek: (id: string) => void;
};

export default function CalendarGrid({
  week, selectedLocal, everyWeekLocal, toggleBlock, toggleEveryWeek
}: Props) {

  const timeline = useMemo<number[]>(() => {
    const times = new Set<number>();
    for (const d of week.days) for (const b of d.blocks) {
      times.add(b.startMin); times.add(b.endMin);
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

  return (
    <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
      {/* header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "80px repeat(7, 1fr)",
        borderBottom: "1px solid var(--border)",
        background: "var(--card)",
      }}>
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

      {/* body */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", position: "relative" }}>
        {/* time rail */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
          {timeline.map((t, i) => (
            <div key={t} style={{
              height: 64,
              borderBottom: "1px solid var(--border)",
              fontSize: 11, color: "var(--muted)",
              display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
              paddingRight: 8, paddingTop: 6,
              background: i % 2 ? "var(--hover)" : "transparent",
            }}>
              {DateTime.fromObject({ hour: Math.floor(t / 60), minute: 0 }).toFormat("HH:mm")}
            </div>
          ))}
        </div>

        {/* days */}
        {week.days.map((d) => {
          const firstTick = timeline[0] ?? 7 * 60;

          return (
            <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
              {timeline.map((t, i) => (
                <div key={t} style={{
                  height: 64,
                  borderBottom: "1px solid var(--border)",
                  background: i % 2 ? "var(--hover)" : "transparent"
                }} />
              ))}

              <div style={{ position: "absolute", inset: 0, padding: "6px 8px" }}>
                {d.blocks.map((b) => (
                  <BlockCard
                    key={b.id}
                    b={b}
                    firstTick={firstTick}
                    isSelected={selectedLocal.has(b.id)}
                    isEveryWeek={everyWeekLocal.has(b.id)}
                    onToggle={() => toggleBlock(b.id, b.locked)}
                    onToggleEvery={() => toggleEveryWeek(b.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BlockCard({
  b, firstTick, isSelected, isEveryWeek, onToggle, onToggleEvery
}: {
  b: Block;
  firstTick: number;
  isSelected: boolean;
  isEveryWeek: boolean;
  onToggle: () => void;
  onToggleEvery: () => void;
}) {
  const topPx = ((b.startMin - firstTick) / HOUR_STEP_MIN) * 64 + 2;
  const heightPx = Math.max(24, ((b.endMin - b.startMin) / HOUR_STEP_MIN) * 64 - 8);
  const baseBg = b.locked ? "rgba(148,163,184,0.20)" : "rgba(59,130,246,0.14)";
  const baseBorder = b.locked ? "rgba(148,163,184,0.55)" : "rgba(59,130,246,0.55)";

  return (
    <button
      type="button"
      disabled={b.locked}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-ew-toggle]")) return;
        onToggle();
      }}
      className="surface"
      style={{
        position: "absolute",
        left: 8, right: 8, top: topPx, height: heightPx,
        borderRadius: 10, padding: "10px 12px",
        background: baseBg, border: `1px solid ${baseBorder}`,
        boxShadow: "0 6px 10px rgba(0,0,0,0.06)",
        backdropFilter: "saturate(120%) blur(2px)",
        display: "flex", flexDirection: "column", gap: 6,
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {isSelected && (
          <span
            style={{
              padding: "2px 8px", borderRadius: 999,
              background: "var(--ok-bg)", color: "var(--ok-fg)", fontSize: 11,
              border: "1px solid color-mix(in oklab, var(--ok-fg) 20%, transparent)",
            }}
          >
            Selected
          </span>
        )}

        {isSelected ? (
          <label
            data-ew-toggle
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11, color: "var(--muted)", cursor: "pointer", userSelect: "none",
            }}
          >
            <input
              data-ew-toggle
              type="checkbox"
              checked={isEveryWeek}
              onChange={(e) => { e.stopPropagation(); onToggleEvery(); }}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: "pointer" }}
              aria-label="Every week"
            />
            Every week
          </label>
        ) : (
          <span style={{ fontSize: 11, color: "var(--muted-2)" }}>Tap to select</span>
        )}
      </div>
    </button>
  );
}
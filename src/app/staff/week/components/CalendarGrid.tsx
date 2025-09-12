"use client";

import { DateTime } from "luxon";
import type { WeekAPI, Block } from "../types";

type Props = {
  week: WeekAPI;
  monthStr: string;
  readOnly: boolean;

  /** Optional when readOnly. If omitted, the grid renders as view-only safely. */
  selected?: Set<string>;
  everyWeek?: Set<string>;
  onToggleBlock?: (id: string, locked: boolean) => void;
  onToggleEvery?: (id: string) => void;
};

const HOUR_PX = 64;
const HOUR_STEP_MIN = 60;

function minsToLabel(mins: number) {
  const dt = DateTime.fromObject({ hour: Math.floor(mins / 60), minute: mins % 60 });
  return dt.toFormat("h:mm a");
}

function rangeLabel(b: Block) {
  return `${minsToLabel(b.startMin)} – ${minsToLabel(b.endMin)}`;
}

export default function CalendarGrid({
  week,
  monthStr,
  readOnly,
  selected,
  everyWeek,
  onToggleBlock,
  onToggleEvery,
}: Props) {
  // Safe defaults so `.has()` never explodes in view-only mode.
  const selectedLocal = selected ?? new Set<string>();
  const everyWeekLocal = everyWeek ?? new Set<string>();
  const toggleBlock = onToggleBlock ?? (() => {});
  const toggleEvery = onToggleEvery ?? (() => {});

  // Build vertical time rail
  const allTimes = Array.from(
    new Set(week.days.flatMap((d) => d.blocks.flatMap((b) => [b.startMin, b.endMin])))
  ).sort((a, b) => a - b);
  const firstTick = allTimes[0] ?? 7 * 60;
  const lastTick = allTimes[allTimes.length - 1] ?? 22 * 60;
  const startHour = Math.floor(firstTick / 60) * 60;
  const endHour = Math.ceil(lastTick / 60) * 60;
  const ticks: number[] = [];
  for (let t = startHour; t <= endHour; t += HOUR_STEP_MIN) ticks.push(t);

  return (
    <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px repeat(7, 1fr)",
          borderBottom: "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>
          Week of {DateTime.fromISO(week.startISO).toFormat("yyyy-LL-dd")} • Month: {monthStr}
        </div>
        {week.days.map((d) => (
          <div
            key={d.dateISO}
            style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}
          >
            {DateTime.fromISO(d.dateISO).toFormat("ccc MM/dd")}
          </div>
        ))}
      </div>

      {/* Body grid */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", position: "relative" }}>
        {/* Time rail */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
          {ticks.map((t, i) => (
            <div
              key={t}
              style={{
                height: HOUR_PX,
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
              {DateTime.fromObject({ hour: Math.floor(t / 60) }).toFormat("HH:00")}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {week.days.map((d) => (
          <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
            {/* stripes */}
            {ticks.map((t, i) => (
              <div
                key={t}
                style={{ height: HOUR_PX, borderBottom: "1px solid var(--border)", background: i % 2 ? "var(--hover)" : "transparent" }}
              />
            ))}
            {/* blocks */}
            <div style={{ position: "absolute", inset: 0, padding: "6px 8px" }}>
              {d.blocks.map((b) => {
                const top = ((b.startMin - firstTick) / HOUR_STEP_MIN) * HOUR_PX + 2;
                const h = Math.max(24, ((b.endMin - b.startMin) / HOUR_STEP_MIN) * HOUR_PX - 8);
                const isSel = selectedLocal.has(b.id);
                const isEvery = everyWeekLocal.has(b.id);

                const baseBg = b.locked ? "rgba(148,163,184,0.20)" : "rgba(59,130,246,0.14)";
                const baseBorder = b.locked ? "rgba(148,163,184,0.55)" : "rgba(59,130,246,0.55)";

                return (
                  <button
                    key={b.id}
                    type="button"
                    className="surface"
                    disabled={b.locked || readOnly}
                    title={rangeLabel(b)}
                    onClick={(e) => {
                      // Ignore clicks from the inner “Every week” checkbox
                      if ((e.target as HTMLElement).closest("[data-ew-toggle]")) return;
                      toggleBlock(b.id, !!b.locked);
                    }}
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 8,
                      top,
                      height: h,
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: baseBg,
                      border: `1px solid ${baseBorder}`,
                      boxShadow: "0 6px 10px rgba(0,0,0,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      cursor: b.locked || readOnly ? "default" : "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 400 }}>
                      {rangeLabel(b)}
                      {b.label ? <span style={{ marginLeft: 8, color: "var(--muted)" }}>• {b.label}</span> : null}
                      {b.isClass ? <span style={{ marginLeft: 8, color: "var(--muted-2)", fontSize: 11 }}>(Class)</span> : null}
                      {b.locked ? <span style={{ marginLeft: 8, color: "var(--muted-2)", fontSize: 11 }}>(Locked)</span> : null}
                    </div>

                    {/* Chips + Every-week */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {isSel && (
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

                      {isSel && !readOnly && (
                        <label
                          data-ew-toggle
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", cursor: "pointer" }}
                        >
                          <input
                            data-ew-toggle
                            type="checkbox"
                            checked={isEvery}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleEvery(b.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: "pointer" }}
                            aria-label="Every week"
                          />
                          Every week
                        </label>
                      )}

                      {!isSel && !readOnly && <span style={{ fontSize: 11, color: "var(--muted-2)" }}>Tap to select</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
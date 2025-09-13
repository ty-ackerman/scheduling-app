"use client";

import { useMemo } from "react";
import { DateTime } from "luxon";

/** ----- Types kept local to this component ----- */
type Block = {
  id: string;
  startMin: number;
  endMin: number;
  label?: string | null;
  isClass?: boolean;
  locked?: boolean;
};

type WeekAPI = {
  month?: { status?: "DRAFT" | "FINAL" };
  days: { dateISO: string; blocks: Block[] }[];
};

const HOUR_PX = 64;
const STEP_MIN = 60;

function minsToHHMM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const dt = DateTime.fromObject({ hour: h, minute: m });
  return dt.toFormat("h:mm a");
}

function rangeLabel(a: number, b: number) {
  return `${minsToHHMM(a)} – ${minsToHHMM(b)}`;
}

function buildTimeline(week: WeekAPI) {
  const set = new Set<number>();
  for (const d of week.days) for (const b of d.blocks) {
    set.add(b.startMin); set.add(b.endMin);
  }
  const arr = Array.from(set).sort((a, b) => a - b);
  const start = (arr[0] ?? 7 * 60);
  const end = (arr[arr.length - 1] ?? 22 * 60);
  const startHour = Math.floor(start / 60) * 60;
  const endHour = Math.ceil(end / 60) * 60;
  const out: number[] = [];
  for (let t = startHour; t <= endHour; t += STEP_MIN) out.push(t);
  return out;
}

export default function CalendarGrid(props: {
  week: WeekAPI;
  monthStr: string;
  readOnly: boolean;
  selectedLocal?: Set<string>;
  onToggleBlock: (id: string) => void;
}) {
  const { week, readOnly, selectedLocal, onToggleBlock } = props;

  // defend against undefined set
  const selected = selectedLocal ?? new Set<string>();

  const timeline = useMemo(() => buildTimeline(week), [week]);
  const firstTick = timeline[0] ?? 7 * 60;

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
        <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>Time</div>
        {week.days.map((d) => (
          <div
            key={d.dateISO}
            style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}
          >
            {DateTime.fromISO(d.dateISO).toFormat("ccc MM/dd")}
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", position: "relative" }}>
        {/* Time rail */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
          {timeline.map((t, i) => (
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
              {DateTime.fromObject({ hour: Math.floor(t / 60), minute: 0 }).toFormat("HH:mm")}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {week.days.map((d) => (
          <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
            {/* Hour stripes */}
            {timeline.map((t, i) => (
              <div
                key={t}
                style={{ height: HOUR_PX, borderBottom: "1px solid var(--border)", background: i % 2 ? "var(--hover)" : "transparent" }}
              />
            ))}

            {/* Blocks */}
            <div style={{ position: "absolute", inset: 0, padding: "6px 8px" }}>
              {d.blocks.map((b) => {
                const top = ((b.startMin - firstTick) / STEP_MIN) * HOUR_PX + 2;
                const h = Math.max(24, ((b.endMin - b.startMin) / STEP_MIN) * HOUR_PX - 8);
                const isSelected = selected.has(b.id);
                const disabled = readOnly || !!b.locked;

                const baseBg = disabled ? "rgba(148,163,184,0.20)" : "rgba(59,130,246,0.14)";
                const baseBorder = disabled ? "rgba(148,163,184,0.55)" : "rgba(59,130,246,0.55)";
                const selBg = "color-mix(in oklab, #22c55e 14%, transparent)";
                const selBorder = "color-mix(in oklab, #22c55e 55%, transparent)";

                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggleBlock(b.id)}
                    className="surface"
                    style={{
                      position: "absolute",
                      left: 8,
                      right: 8,
                      top,
                      height: h,
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: isSelected ? selBg : baseBg,
                      border: `1px solid ${isSelected ? selBorder : baseBorder}`,
                      boxShadow: "0 6px 10px rgba(0,0,0,0.06)",
                      backdropFilter: "saturate(120%) blur(2px)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      cursor: disabled ? "not-allowed" : "pointer",
                      textAlign: "left",
                    }}
                    title={rangeLabel(b.startMin, b.endMin)}
                  >
                    <div style={{ fontSize: 12, fontWeight: 400 }}>
                      {rangeLabel(b.startMin, b.endMin)}
                      {b.label ? <span style={{ marginLeft: 8, color: "var(--muted)" }}>• {b.label}</span> : null}
                      {b.isClass ? <span style={{ marginLeft: 8, color: "var(--muted-2)", fontSize: 11 }}>(Class)</span> : null}
                      {b.locked ? <span style={{ marginLeft: 8, color: "var(--muted-2)", fontSize: 11 }}>(Locked)</span> : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {isSelected ? (
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
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--muted-2)" }}>
                          {disabled ? "Locked" : "Tap to select"}
                        </span>
                      )}
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
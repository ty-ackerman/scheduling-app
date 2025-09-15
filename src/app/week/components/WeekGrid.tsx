"use client";

import { DateTime } from "luxon";

export type GridBlock = {
  id: string;        // DatedBlock.id
  dateISO: string;
  startMin: number;
  endMin: number;
  label?: string | null;
  isClass?: boolean;
  count?: number;
};

type Props = {
  days: { dateISO: string; blocks: GridBlock[] }[];
  onBlockClick?: (b: GridBlock) => void;
};

const HOUR = 60;
const H_PX = 64;

const hh = (m: number) =>
  DateTime.fromObject({ hour: Math.floor(m / 60), minute: 0 }).toFormat("HH:mm");
const toHuman = (m: number) =>
  DateTime.fromObject({ hour: Math.floor(m / 60), minute: m % 60 }).toFormat("h:mm a");
const range = (s: number, e: number) => `${toHuman(s)} – ${toHuman(e)}`;

export default function WeekGrid({ days, onBlockClick }: Props) {
  console.log("[Grid] MOUNT days=", days.map(d => ({ date: d.dateISO, n: d.blocks.length })));

  const allTimes = Array.from(
    new Set(days.flatMap((d) => d.blocks.flatMap((b) => [b.startMin, b.endMin])))
  ).sort((a, b) => a - b);

  const start = Math.floor((allTimes[0] ?? 7 * HOUR) / HOUR) * HOUR;
  const end = Math.ceil((allTimes[allTimes.length - 1] ?? 22 * HOUR) / HOUR) * HOUR;
  const ticks: number[] = [];
  for (let t = start; t <= end; t += HOUR) ticks.push(t);

  return (
    <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
      {/* header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px repeat(7, 1fr)",
          borderBottom: "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>Time</div>
        {days.map((d) => (
          <div
            key={d.dateISO}
            style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}
          >
            {DateTime.fromISO(d.dateISO).toFormat("ccc MM/dd")}
          </div>
        ))}
      </div>

      {/* body */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px repeat(7, 1fr)",
          position: "relative",
        }}
      >
        {/* time rail */}
        <div style={{ borderRight: "1px solid var(--border)" }}>
          {ticks.map((t, i) => (
            <div
              key={t}
              style={{
                height: H_PX,
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                color: "var(--muted)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                paddingRight: 8,
                paddingTop: 6,
                background: i % 2 ? "var(--hover)" : "transparent",
                pointerEvents: "none", // ⛔️ rail is non-interactive
              }}
            >
              {hh(t)}
            </div>
          ))}
        </div>

        {/* 7 day columns */}
        {days.map((d) => {
          const firstTick = ticks[0] ?? 7 * HOUR;

          return (
            <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
              {/* hour stripes (non-interactive) */}
              {ticks.map((t, i) => (
                <div
                  key={t}
                  style={{
                    height: H_PX,
                    borderBottom: "1px solid var(--border)",
                    background: i % 2 ? "var(--hover)" : "transparent",
                    pointerEvents: "none", // ⛔️ prevent intercepting clicks
                  }}
                />
              ))}

              {/* absolute layer that holds buttons; make layer itself ignore events */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  padding: "6px 8px",
                  pointerEvents: "none", // ⛔️ container doesn't grab events
                }}
              >
                {d.blocks.map((b) => {
                  const top = ((b.startMin - firstTick) / HOUR) * H_PX + 2;
                  const h = Math.max(24, ((b.endMin - b.startMin) / HOUR) * H_PX - 8);

                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        console.log("[Grid] CLICK → onBlockClick", {
                          id: b.id,
                          dateISO: d.dateISO,
                          startMin: b.startMin,
                          endMin: b.endMin,
                        });
                        onBlockClick?.({ ...b, dateISO: d.dateISO });
                      }}
                      className="surface"
                      style={{
                        position: "absolute",
                        left: 8,
                        right: 8,
                        top,
                        height: h,
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: "rgba(59,130,246,0.14)",
                        border: "1px solid rgba(59,130,246,0.55)",
                        boxShadow: "0 6px 10px rgba(0,0,0,0.06)",
                        textAlign: "left",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        zIndex: 2,              // ✅ sit above stripes
                        pointerEvents: "auto",  // ✅ button is clickable even if parent ignores
                        cursor: "pointer",
                      }}
                      title={range(b.startMin, b.endMin)}
                      data-test="calendar-block"
                    >
                      <div style={{ fontSize: 12, fontWeight: 500 }}>
                        {range(b.startMin, b.endMin)}
                      </div>
                      <div style={{ marginTop: "auto", fontSize: 11, color: "var(--muted)" }}>
                        {typeof b.count === "number" ? `${b.count} available` : ""}
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
  );
}
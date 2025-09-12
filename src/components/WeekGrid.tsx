"use client";

import { DateTime } from "luxon";

type Block = {
  id: string; day: number; startMin: number; endMin: number;
  label?: string | null; locked: boolean; isClass: boolean;
};
type WeekAPI = { startISO: string; days: { dateISO: string; blocks: Block[] }[] };

type Props = {
  title?: string;
  week: WeekAPI;
  counts: Record<string, number>;
  onPrev(): void; onNext(): void; onThisWeek(): void;
};

const H = 64; // 1h px height

function hhmm(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return DateTime.fromObject({ hour: h, minute: m }).toFormat("h:mm");
}

export default function WeekGrid({ title = "Week view", week, counts, onPrev, onNext, onThisWeek }: Props) {
  // time rail from visible blocks
  const times = Array.from(
    new Set(
      week.days.flatMap(d => d.blocks.flatMap(b => [b.startMin, b.endMin]))
    )
  ).sort((a, b) => a - b);
  const first = (times[0] ?? 7 * 60);
  const last  = (times[times.length - 1] ?? 21 * 60);
  const startHour = Math.floor(first / 60) * 60;
  const endHour   = Math.ceil(last / 60) * 60;
  const rail: number[] = [];
  for (let t = startHour; t <= endHour; t += 60) rail.push(t);

  return (
    <div className="surface" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 400 }}>{title}</h2>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>
            Week of {DateTime.fromISO(week.startISO).toFormat("yyyy-LL-dd")}
          </div>
        </div>
        <div className="pill" style={{ gap: 6 }}>
          <button className="btn btn-quiet" onClick={onPrev}>← Prev</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onThisWeek}>This week</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onNext}>Next →</button>
        </div>
      </div>

      <div className="surface" style={{ padding: 0, overflow: "hidden" }}>
        {/* header */}
        <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)" }}>Time</div>
          {week.days.map(d => (
            <div key={d.dateISO} style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
              {DateTime.fromISO(d.dateISO).toFormat("ccc MM/dd")}
            </div>
          ))}
        </div>

        {/* body */}
        <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", position: "relative" }}>
          {/* time rail */}
          <div style={{ borderRight: "1px solid var(--border)" }}>
            {rail.map((t, i) => (
              <div key={t} style={{
                height: H, borderBottom: "1px solid var(--border)",
                fontSize: 11, color: "var(--muted)",
                display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                paddingRight: 8, paddingTop: 6, background: i % 2 ? "var(--hover)" : "transparent"
              }}>
                {DateTime.fromObject({ hour: Math.floor(t / 60) }).toFormat("HH:00")}
              </div>
            ))}
          </div>

          {/* days */}
          {week.days.map(d => (
            <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
              {rail.map((t, i) => (
                <div key={t} style={{ height: H, borderBottom: "1px solid var(--border)", background: i % 2 ? "var(--hover)" : "transparent" }} />
              ))}

              {/* blocks */}
              <div style={{ position: "absolute", inset: 0, padding: "6px 8px" }}>
                {d.blocks.map(b => {
                  const top = ((b.startMin - startHour) / 60) * H + 2;
                  const height = Math.max(24, ((b.endMin - b.startMin) / 60) * H - 8);
                  const n = counts[b.id] ?? 0;
                  const hasAvail = n > 0;
                  const bg = hasAvail ? "rgba(16,185,129,0.18)" : "rgba(59,130,246,0.14)";
                  const border = hasAvail ? "rgba(16,185,129,0.55)" : "rgba(59,130,246,0.55)";

                  return (
                    <div key={b.id}
                      className="surface"
                      style={{
                        position: "absolute", left: 8, right: 8, top, height,
                        borderRadius: 10, padding: "10px 12px",
                        background: bg, border: `1px solid ${border}`,
                        boxShadow: "0 6px 10px rgba(0,0,0,0.06)", backdropFilter: "saturate(120%) blur(2px)"
                      }}>
                      <div style={{ fontSize: 12 }}>
                        {hhmm(b.startMin)}–{hhmm(b.endMin)}
                        {b.isClass && <span style={{ marginLeft: 8, color: "var(--muted-2)", fontSize: 11 }}>(Class)</span>}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                        {n} available
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
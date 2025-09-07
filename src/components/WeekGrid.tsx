"use client";

import React from "react";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db"; // server-side loader lives in the page; this file is client-only for rendering

type Block = {
  id: string;
  day: number;       // 1..7
  startMin: number;
  endMin: number;
  label: string | null;
  locked: boolean;
  isClass: boolean;  // <-- NEW
};

type Props = {
  weekStartISO: string;           // Monday ISO date e.g. "2025-10-06"
  days: Array<{ dateISO: string; blocks: Block[] }>;
};

const ROW_HEIGHT = 64; // px per hour
const GAP = 8;         // vertical spacing between adjacent blocks

function fmtRange(minA: number, minB: number) {
  const s = DateTime.fromObject({ hour: Math.floor(minA / 60), minute: minA % 60 }).toFormat("HH:mm");
  const e = DateTime.fromObject({ hour: Math.floor(minB / 60), minute: minB % 60 }).toFormat("HH:mm");
  return `${s}–${e}`;
}

export default function WeekGrid({ weekStartISO, days }: Props) {
  // Build vertical timeline from the earliest start / latest end in the week
  const allTimes = Array.from(
    new Set(
      days.flatMap(d => d.blocks.flatMap(b => [b.startMin, b.endMin]))
    )
  ).sort((a, b) => a - b);

  const minTime = allTimes[0] ?? 7 * 60;
  const maxTime = allTimes[allTimes.length - 1] ?? 22 * 60;

  const timeline: number[] = [];
  for (let t = Math.floor(minTime / 60) * 60; t <= Math.ceil(maxTime / 60) * 60; t += 60) {
    timeline.push(t);
  }

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 500, marginBottom: 16 }}>Week by Date</h1>

      <div className="surface" style={{ overflow: "hidden" }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px repeat(7, 1fr)",
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ padding: "12px 8px", fontSize: 12, color: "var(--muted)" }}>Time</div>
          {days.map((d) => {
            const label = DateTime.fromISO(d.dateISO).toFormat("ccc MM/dd");
            return (
              <div key={d.dateISO} style={{ padding: "12px 12px", textAlign: "center", fontSize: 12 }}>
                {label}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "80px repeat(7, 1fr)", position: "relative" }}>
          {/* Time column */}
          <div style={{ borderRight: "1px solid var(--border)" }}>
            {timeline.map((t) => (
              <div
                key={t}
                style={{
                  height: ROW_HEIGHT,
                  borderBottom: "1px solid var(--border)",
                  fontSize: 12,
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-end",
                  paddingRight: 8,
                  paddingTop: 6,
                }}
              >
                {DateTime.fromObject({ hour: Math.floor(t / 60), minute: 0 }).toFormat("HH:mm")}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => (
            <div key={d.dateISO} style={{ position: "relative", borderRight: "1px solid var(--border)", padding: "0 10px" }}>
              {/* background rows */}
              {timeline.map((t, i) => (
                <div key={t} style={{
                  height: ROW_HEIGHT,
                  borderBottom: "1px solid",
                  borderColor: i % 2 ? "var(--border)" : "color-mix(in oklab, var(--border) 60%, transparent)",
                }} />
              ))}

              {/* blocks */}
              <div style={{ position: "absolute", inset: 0 }}>
                {d.blocks.map(b => {
                  const top = ((b.startMin - timeline[0]) / 60) * ROW_HEIGHT + GAP / 2;
                  const height = Math.max(1, (b.endMin - b.startMin) / 60) * ROW_HEIGHT - GAP;

                  const border = b.isClass ? "#fb923c" : "#f59e0b"; // orange-ish if CLASS, softer otherwise
                  const bg = "color-mix(in oklab, var(--fg) 6%, transparent)";

                  return (
                    <div
                      key={b.id}
                      className="cal-block"
                      style={{
                        position: "absolute",
                        left: 12,
                        right: 12,
                        top,
                        height,
                        borderRadius: 12,
                        border: `1px solid ${border}`,
                        background: bg,
                        boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
                        padding: "10px 12px",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: border }}>
                        {fmtRange(b.startMin, b.endMin)}
                        {b.isClass && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: border, opacity: 0.9 }}>CLASS</span>}
                      </div>
                      {b.label && <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted-2)" }}>{b.label}</div>}
                      {b.locked && <div style={{ marginTop: 4, fontSize: 10, color: "var(--muted)" }}>Locked</div>}
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
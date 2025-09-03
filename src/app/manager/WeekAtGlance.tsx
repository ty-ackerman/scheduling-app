'use client';
// WeekAtGlance.tsx
// Calendar-style "week at a glance" for managers:
// - Shows per-cell counts of available people
// - 0 = highlighted as empty; >0 = green badge with tooltip of names

import { useEffect, useMemo, useState } from "react";
import {
  DAY_LABELS,
  ALL_TIME_BLOCKS,
  formatBlockLabel,
  type TimeBlockId,
} from "@/lib/timeblocks";

type Counts = Record<TimeBlockId, number[]>;
type Names = Record<TimeBlockId, string[][]>;

type ApiResponse = {
  ok: boolean;
  week: string;
  users: { id: string; name: string | null; email: string; role: string; availability: Record<TimeBlockId, boolean[]> }[];
  counts: Counts;
  names: Names;
};

function mondayOfCurrentWeekISO(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0..Sun=6
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function WeekAtGlance() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const weekISO = useMemo(mondayOfCurrentWeekISO, []);

  useEffect(() => {
    const run = async () => {
      setErr(null);
      try {
        const res = await fetch(`/api/manager/availability?week=${weekISO}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ApiResponse;
        setData(json);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load");
      }
    };
    run();
  }, [weekISO]);

  return (
    <section className="surface" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h2 className="text-lg" style={{ fontWeight: 600, marginBottom: 4 }}>Week at a Glance</h2>
          <p style={{ color: "var(--muted-2)", fontSize: 13 }}>
            Week starting: <span style={{ color: "var(--fg)" }}>{weekISO}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--muted)" }}>
          <span className="pill" style={{ gap: 6, padding: "4px 8px" }}>
            <span
              style={{
                display: "inline-block",
                minWidth: 18,
                height: 18,
                borderRadius: 6,
                background: "#059669",
              }}
            />
            Available
          </span>
          <span className="pill" style={{ gap: 6, padding: "4px 8px" }}>
            <span
              style={{
                display: "inline-block",
                minWidth: 18,
                height: 18,
                borderRadius: 6,
                background: "transparent",
                border: "2px dashed var(--border-strong)",
              }}
            />
            No one
          </span>
        </div>
      </div>

      {err && (
        <div className="surface" style={{ padding: 12, borderColor: "var(--border-strong)", color: "var(--warn-fg)", marginBottom: 12 }}>
          Error: {err}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: "left", minWidth: 160 }}>Time Block</th>
              {DAY_LABELS.map((d) => (
                <th key={d} style={{ textAlign: "left", minWidth: 120 }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_TIME_BLOCKS.map((block) => (
              <tr key={block.id}>
                <th style={{ padding: 12, whiteSpace: "nowrap" }}>{formatBlockLabel(block.id)}</th>

                {DAY_LABELS.map((_, dayIdx) => {
                  const count = data?.counts?.[block.id]?.[dayIdx] ?? 0;
                  const people = data?.names?.[block.id]?.[dayIdx] ?? [];
                  const hasAny = count > 0;

                  return (
                    <td key={`${block.id}-${dayIdx}`} style={{ padding: 12 }}>
                      <button
                        type="button"
                        className="btn cell"
                        title={people.length ? people.join(", ") : "No one yet"}
                        style={{
                          // unifying size through .cell; color by state:
                          background: hasAny ? "#059669" : "var(--card)",
                          borderColor: hasAny ? "#059669" : "var(--border-strong)",
                          color: hasAny ? "#fff" : "var(--muted)",
                          display: "inline-flex",
                          gap: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                        }}
                        // Future: onClick could open a side panel with the names and quick-assign UI
                      >
                        {hasAny ? (
                          <>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 24,
                                height: 24,
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.2)",
                                fontWeight: 600,
                              }}
                              aria-label="Available count"
                            >
                              {count}
                            </span>
                            <span style={{ fontWeight: 500 }}>Available</span>
                          </>
                        ) : (
                          <span style={{ opacity: 0.9 }}>No one</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="surface" style={{ marginTop: 12, padding: 12 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Showing {data.users.length} staff who have saved availability for this week.
          </div>
        </div>
      )}
    </section>
  );
}
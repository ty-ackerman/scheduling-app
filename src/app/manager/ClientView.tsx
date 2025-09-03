'use client';
// Manager View — matches minimalist styling

import { useEffect, useMemo, useState } from "react";
import {
  DAY_LABELS,
  ALL_TIME_BLOCKS,
  formatBlockLabel,
  type TimeBlockId,
} from "@/lib/timeblocks";

type AvailabilityState = Record<TimeBlockId, boolean[]>;
const STORAGE_KEY = "availability:v1";

function isAvailabilityState(v: unknown): v is AvailabilityState {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  const keys: TimeBlockId[] = ["MORNING", "AFTERNOON", "EVENING"];
  return keys.every(
    (k) =>
      Array.isArray(obj[k]) &&
      (obj[k] as unknown[]).length === 7 &&
      (obj[k] as unknown[]).every((x) => typeof x === "boolean")
  );
}

function loadFromStorage(): AvailabilityState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isAvailabilityState(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export default function ClientView() {
  const [state, setState] = useState<AvailabilityState | null>(null);

  useEffect(() => { setState(loadFromStorage()); }, []);

  const unfilled = useMemo(() => {
    if (!state) return [];
    const rows: { dayIdx: number; dayLabel: string; blockId: TimeBlockId; blockLabel: string }[] = [];
    for (const block of ALL_TIME_BLOCKS) {
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const available = state[block.id][dayIdx];
        if (!available) {
          rows.push({
            dayIdx,
            dayLabel: DAY_LABELS[dayIdx],
            blockId: block.id,
            blockLabel: formatBlockLabel(block.id),
          });
        }
      }
    }
    return rows;
  }, [state]);

  return (
    <section className="surface" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <h2 className="text-lg font-semibold" style={{ marginBottom: 4 }}>Manager View</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Listing cells with no availability set. Will evolve to multi-user & requirements.
          </p>
        </div>
        <a href="/week" className="btn btn-quiet">Go to Week View</a>
      </div>

      {!state && (
        <div className="surface" style={{ padding: 12, borderColor: "var(--border-strong)" }}>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No local availability found. Open <a href="/week" className="link">Week View</a> and toggle a few cells.
          </p>
        </div>
      )}

      {state && (
        <>
          <div className="surface" style={{ padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div>Total cells: <strong>{7 * ALL_TIME_BLOCKS.length}</strong></div>
              <div>Unfilled: <strong>{unfilled.length}</strong></div>
              <div>Filled: <strong>{7 * ALL_TIME_BLOCKS.length - unfilled.length}</strong></div>
            </div>
          </div>

          <div className="surface" style={{ overflow: "hidden" }}>
            <div style={{ borderBottom: "1px solid var(--border)", padding: 12, fontWeight: 600 }}>Unfilled</div>
            {unfilled.length === 0 ? (
              <div style={{ padding: 12, color: "var(--ok-fg)" }}>No unfilled cells</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {unfilled.map((row, i) => (
                  <li key={`${row.dayIdx}-${row.blockId}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, borderTop: "1px solid var(--border)" }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{row.dayLabel}</span>
                      <span style={{ color: "var(--muted)", margin: "0 8px" }}>·</span>
                      <span>{row.blockLabel}</span>
                    </div>
                    <a className="btn btn-quiet" href="/week" title="Set availability">Set</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
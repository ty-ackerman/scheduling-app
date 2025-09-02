'use client';
// app/manager/page.tsx
// Minimal Manager View for Phase 1 demo.
// Reads the same localStorage availability as WeekGrid and lists “unfilled” cells
// (cells where no availability is set). This is a placeholder heuristic until we
// have real multi-user data and staffing requirements.

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

export default function ManagerPage() {
  const [state, setState] = useState<AvailabilityState | null>(null);

  useEffect(() => {
    setState(loadFromStorage());
  }, []);

  const unfilled = useMemo(() => {
    if (!state) return [];
    const rows: { dayIdx: number; dayLabel: string; blockId: TimeBlockId; blockLabel: string }[] =
      [];
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
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">Manager View (Demo)</h2>
        <p className="text-gray-600 text-sm">
          Listing “unfilled” cells where availability is not set. This will
          evolve into a multi-user, requirement-aware view in later steps.
        </p>
      </header>

      {/* If no local availability yet */}
      {!state && (
        <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          No local availability found. Go to{" "}
          <a href="/week" className="underline">Week View</a> and toggle a few
          cells, then return here.
        </div>
      )}

      {/* Summary */}
      {state && (
        <div className="rounded border p-3 text-sm flex items-center justify-between">
          <div>
            Total cells: <span className="font-medium">{7 * ALL_TIME_BLOCKS.length}</span>
          </div>
          <div>
            Unfilled: <span className="font-medium">{unfilled.length}</span>
          </div>
          <div>
            Filled:{" "}
            <span className="font-medium">
              {7 * ALL_TIME_BLOCKS.length - unfilled.length}
            </span>
          </div>
        </div>
      )}

      {/* Unfilled list */}
      {state && (
        <div className="rounded border">
          <div className="border-b p-3 font-medium">Unfilled</div>
          {unfilled.length === 0 ? (
            <div className="p-3 text-sm text-green-700">No unfilled cells 🎉</div>
          ) : (
            <ul className="divide-y">
              {unfilled.map((row, i) => (
                <li key={`${row.dayIdx}-${row.blockId}-${i}`} className="p-3 text-sm flex items-center justify-between">
                  <div>
                    <span className="font-medium">{row.dayLabel}</span>{" "}
                    <span className="text-gray-600">·</span>{" "}
                    <span>{row.blockLabel}</span>
                  </div>
                  <a
                    href="/week"
                    className="text-xs underline"
                    title="Go to Week View to set availability"
                  >
                    set availability
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
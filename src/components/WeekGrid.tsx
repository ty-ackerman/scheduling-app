'use client';
// WeekGrid.tsx
// Interactive 7 × 3 grid (days × time blocks) for Phase 1 demo.
// Persists availability to localStorage so it survives refreshes.

import { useEffect, useState } from "react";
import {
  DAY_LABELS,
  ALL_TIME_BLOCKS,
  formatBlockLabel,
  type TimeBlockId,
} from "@/lib/timeblocks";

// ---- Types ----

type AvailabilityState = Record<
  TimeBlockId,
  // index by day 0..6 (Mon..Sun) -> boolean
  boolean[]
>;

// ---- Constants ----

const STORAGE_KEY = "availability:v1";

// ---- Helpers ----

const createEmptyState = (): AvailabilityState => ({
  MORNING: Array(7).fill(false),
  AFTERNOON: Array(7).fill(false),
  EVENING: Array(7).fill(false),
});

function isAvailabilityState(v: unknown): v is AvailabilityState {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  const keys: TimeBlockId[] = ["MORNING", "AFTERNOON", "EVENING"];
  return keys.every((k) =>
    Array.isArray(obj[k]) &&
    (obj[k] as unknown[]).length === 7 &&
    (obj[k] as unknown[]).every((x) => typeof x === "boolean")
  );
}

function loadFromStorage(): AvailabilityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw);
    if (isAvailabilityState(parsed)) return parsed;
    return createEmptyState();
  } catch {
    return createEmptyState();
  }
}

// ---- Component ----

export default function WeekGrid() {
  const [state, setState] = useState<AvailabilityState>(createEmptyState());

  // On mount, hydrate from localStorage
  useEffect(() => {
    setState(loadFromStorage());
  }, []);

  // Persist whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage errors for now
    }
  }, [state]);

  const toggle = (dayIndex: number, blockId: TimeBlockId) => {
    setState((prev) => {
      const next: AvailabilityState = {
        MORNING: [...prev.MORNING],
        AFTERNOON: [...prev.AFTERNOON],
        EVENING: [...prev.EVENING],
      };
      next[blockId][dayIndex] = !next[blockId][dayIndex];
      return next;
    });
  };

  const resetAll = () => setState(createEmptyState());

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded border px-3 py-1 text-xs hover:bg-gray-50"
          onClick={resetAll}
        >
          Reset all
        </button>
      </div>
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white p-3 text-left font-semibold border-b border-gray-300">
              Time Block
            </th>
            {DAY_LABELS.map((day) => (
              <th
                key={day}
                className="p-3 text-left font-semibold border-b border-gray-300"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_TIME_BLOCKS.map((block) => (
            <tr key={block.id} className="odd:bg-gray-50">
              <th className="sticky left-0 z-10 bg-white p-3 text-left font-medium border-b border-gray-200 whitespace-nowrap">
                {formatBlockLabel(block.id)}
              </th>

              {DAY_LABELS.map((_, dayIdx) => {
                const isOn = state[block.id][dayIdx];
                return (
                  <td
                    key={`${dayIdx}-${block.id}`}
                    className="p-3 align-top border-b border-gray-200"
                  >
                    <button
                      type="button"
                      aria-pressed={isOn}
                      onClick={() => toggle(dayIdx, block.id)}
                      className={[
                        "w-full h-10 rounded border text-xs transition-colors",
                        isOn
                          ? "bg-green-100 border-green-400 text-green-700"
                          : "border-dashed border-gray-300 hover:border-gray-400",
                      ].join(" ")}
                      title={
                        isOn
                          ? "Click to mark unavailable"
                          : "Click to mark available"
                      }
                    >
                      {isOn ? "Available" : "—"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
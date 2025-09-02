'use client';
// WeekGrid.tsx
// Interactive 7 × 3 grid (days × time blocks) for Phase 1 demo.
// Client-side only: state resets on page refresh.

import { useState } from "react";
import {
  DAY_LABELS,
  ALL_TIME_BLOCKS,
  formatBlockLabel,
  type TimeBlockId,
} from "@/lib/timeblocks";

type AvailabilityState = Record<
  TimeBlockId,
  // index by day 0..6 (Mon..Sun) -> boolean
  boolean[]
>;

const createEmptyState = (): AvailabilityState => ({
  MORNING: Array(7).fill(false),
  AFTERNOON: Array(7).fill(false),
  EVENING: Array(7).fill(false),
});

export default function WeekGrid() {
  const [state, setState] = useState<AvailabilityState>(createEmptyState());

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

  return (
    <div className="overflow-x-auto">
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
'use client';
// WeekGrid.tsx
// Interactive 7 × 3 grid (days × time blocks) for Phase 1 demo.
// Persists availability to localStorage and (if signed in) syncs with /api/availability.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  DAY_LABELS,
  ALL_TIME_BLOCKS,
  formatBlockLabel,
  type TimeBlockId,
} from "@/lib/timeblocks";

// ---- Types ----

type AvailabilityState = Record<TimeBlockId, boolean[]>;
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  return keys.every(
    (k) =>
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

function mondayOfCurrentWeekISO(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---- Component ----

export default function WeekGrid() {
  const { data: session, status } = useSession();
  const [state, setState] = useState<AvailabilityState>(createEmptyState());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hydrate from localStorage immediately
  useEffect(() => {
    setState(loadFromStorage());
  }, []);

  // If signed in, fetch server state for this week and merge (server takes precedence)
  useEffect(() => {
    const fetchServer = async () => {
      if (status !== "authenticated") return;
      try {
        const res = await fetch(`/api/availability?week=${mondayOfCurrentWeekISO()}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json?.availability && isAvailabilityState(json.availability)) {
            setState(json.availability);
          }
        }
      } catch {
        // ignore fetch errors for now
      }
    };
    fetchServer();
  }, [status]);

  // Always persist to localStorage on state change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
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

  const saveToServer = async () => {
    setSaveStatus('saving');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week: mondayOfCurrentWeekISO(),
          availability: state,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch (e: unknown) {
      setSaveStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm text-gray-600">
          Week starting: <span className="font-medium">{mondayOfCurrentWeekISO()}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1 text-xs hover:bg-gray-50"
            onClick={resetAll}
          >
            Reset all
          </button>
          <button
            type="button"
            onClick={saveToServer}
            disabled={saveStatus === 'saving' || status !== "authenticated"}
            className="rounded border px-3 py-1 text-xs bg-black text-white disabled:opacity-60"
            title={status !== "authenticated" ? "Sign in to save to server" : "Save to database"}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save to server'}
          </button>
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-700">Saved!</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-700">Error: {errorMsg}</span>
          )}
        </div>
      </div>

      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white p-3 text-left font-semibold border-b border-gray-300">
              Time Block
            </th>
            {DAY_LABELS.map((day) => (
              <th key={day} className="p-3 text-left font-semibold border-b border-gray-300">
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
                  <td key={`${dayIdx}-${block.id}`} className="p-3 align-top border-b border-gray-200">
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
                      title={isOn ? "Click to mark unavailable" : "Click to mark available"}
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
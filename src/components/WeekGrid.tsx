'use client';
// WeekGrid.tsx — minimalist, high-contrast UI with clean cards and buttons.
// Still: localStorage persistence + server sync when signed in.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  DAY_LABELS,
  ALL_TIME_BLOCKS,
  formatBlockLabel,
  type TimeBlockId,
} from "@/lib/timeblocks";

type AvailabilityState = Record<TimeBlockId, boolean[]>;
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STORAGE_KEY = "availability:v1";

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

export default function WeekGrid() {
  const { data: session, status } = useSession();
  const [state, setState] = useState<AvailabilityState>(createEmptyState());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hydrate from localStorage immediately
  useEffect(() => { setState(loadFromStorage()); }, []);

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
      } catch { /* ignore */ }
    };
    fetchServer();
  }, [status]);

  // Always persist to localStorage on state change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
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
      setTimeout(() => setSaveStatus('idle'), 1400);
    } catch (e: unknown) {
      setSaveStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <section className="surface" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <h2 className="text-lg font-semibold" style={{ marginBottom: 4 }}>Week View</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Days × Time Blocks (09:00–12:00, 12:00–17:00, 17:00–21:00)
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-quiet" onClick={resetAll}>Reset all</button>
          <button
            className="btn btn-primary"
            onClick={saveToServer}
            disabled={saveStatus === 'saving' || status !== "authenticated"}
            title={status !== "authenticated" ? "Sign in to save to server" : "Save to database"}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ color: "var(--muted-2)", fontSize: 13 }}>
          Week starting: <span style={{ color: "var(--fg)", fontWeight: 600 }}>{mondayOfCurrentWeekISO()}</span>
        </div>
        <div style={{ minHeight: 18 }}>
          {saveStatus === 'saved' && <span style={{ color: "var(--ok-fg)", fontSize: 12 }}>Saved</span>}
          {saveStatus === 'error' && <span style={{ color: "var(--warn-fg)", fontSize: 12 }}>Error: {errorMsg}</span>}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: "left", minWidth: 140 }}>Time Block</th>
              {DAY_LABELS.map((d) => (
                <th key={d} style={{ textAlign: "left", minWidth: 80 }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_TIME_BLOCKS.map((block) => (
              <tr key={block.id}>
                <th style={{ padding: 12, whiteSpace: "nowrap" }}>{formatBlockLabel(block.id)}</th>
                {DAY_LABELS.map((_, dayIdx) => {
                  const isOn = state[block.id][dayIdx];
                  return (
                    <td key={`${dayIdx}-${block.id}`}>
                      <button
                        type="button"
                        aria-pressed={isOn}
                        onClick={() => toggle(dayIdx, block.id)}
                        className={`btn cell ${isOn ? "cell--on" : ""}`}
                        title={isOn ? "Click to mark unavailable" : "Click to mark available"}
                      >
                        {isOn ? "Available" : "Set"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
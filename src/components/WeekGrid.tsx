'use client';
// WeekGrid.tsx — cleaner save UX with right-aligned save/status button.
// - Removed "Reset all".
// - Save button reflects state: "Save changes" / "Saving…" / "Up to date" / disabled when not signed in.
// - Detects if local state matches what's saved in DB and shows "Up to date" when identical.

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  DAY_LABELS,
  ALL_TIME_BLOCKS,
  formatBlockLabel,
  type TimeBlockId,
} from "@/lib/timeblocks";

type AvailabilityState = Record<TimeBlockId, boolean[]>;
type SaveStatus = "idle" | "saving" | "saved" | "error";
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
  const day = (now.getDay() + 6) % 7; // Mon=0..Sun=6
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

  // Local editable state
  const [state, setState] = useState<AvailabilityState>(createEmptyState());

  // Last known server snapshot for this week (to compare)
  const [serverState, setServerState] = useState<AvailabilityState | null>(null);
  const [serverLoaded, setServerLoaded] = useState(false);

  // Save UX
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hydrate from localStorage immediately (so the UI is responsive)
  useEffect(() => {
    setState(loadFromStorage());
  }, []);

  // If signed in, fetch server state for this week and use it as the source of truth
  useEffect(() => {
    const fetchServer = async () => {
      if (status !== "authenticated") {
        setServerLoaded(true);
        setServerState(null);
        return;
      }
      try {
        const res = await fetch(`/api/availability?week=${mondayOfCurrentWeekISO()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.availability && isAvailabilityState(json.availability)) {
            setServerState(json.availability);
            setState(json.availability); // take server as current truth
          }
        }
      } catch {
        // ignore
      } finally {
        setServerLoaded(true);
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

  // Dirty detection (only meaningful once server has loaded)
  const isDirty = useMemo(() => {
    if (!serverLoaded) return false;
    if (!serverState) {
      // No server copy (e.g., not signed in) — show Save if there's any availability set
      const anyTrue =
        state.MORNING.some(Boolean) ||
        state.AFTERNOON.some(Boolean) ||
        state.EVENING.some(Boolean);
      return anyTrue;
    }
    return JSON.stringify(state) !== JSON.stringify(serverState);
  }, [serverLoaded, serverState, state]);

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

  const saveToServer = async () => {
    if (status !== "authenticated") return;
    setSaveStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: mondayOfCurrentWeekISO(),
          availability: state,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      setServerState(state); // now DB matches local
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1200);
    } catch (e: unknown) {
      setSaveStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    }
  };

  // Save button label & disabled state
  const saveLabel = useMemo(() => {
    if (saveStatus === "saving") return "Saving…";
    if (status !== "authenticated") return "Sign in to save";
    if (!serverLoaded) return "Loading…";
    if (isDirty) return "Save changes";
    return "Up to date";
  }, [saveStatus, status, serverLoaded, isDirty]);

  const saveDisabled =
    saveStatus === "saving" ||
    status !== "authenticated" ||
    !serverLoaded ||
    !isDirty;

  return (
    <div className="overflow-x-auto">
      {/* Header row with right-aligned save/status button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div>
          <h2 className="text-2xl" style={{ fontWeight: 600, marginBottom: 6 }}>
            Week View
          </h2>
          <p style={{ color: "var(--muted-2)", fontSize: 13 }}>
            Days × Time Blocks (09:00–12:00, 12:00–17:00, 17:00–21:00)
          </p>

          {/* Due date status will be shown here in the next step */}
          {/* Example: "Due by Tue, 11:59 PM" / "Due in 3 hours" / "Locked by manager" */}
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={saveToServer}
            disabled={saveDisabled}
            className={`btn ${saveDisabled ? "btn-quiet" : "btn-primary"}`}
            title={status !== "authenticated" ? "Sign in to save to server" : undefined}
            style={{ whiteSpace: "nowrap" }}
          >
            {saveLabel}
          </button>
          {saveStatus === "error" && (
            <span className="text-xs" style={{ color: "var(--warn-fg)" }}>
              Error: {errorMsg}
            </span>
          )}
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ textAlign: "left", minWidth: 140 }}>Time Block</th>
            {DAY_LABELS.map((day) => (
              <th key={day} style={{ textAlign: "left", minWidth: 88 }}>
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_TIME_BLOCKS.map((block) => (
            <tr key={block.id}>
              <th style={{ padding: 12, whiteSpace: "nowrap" }}>
                {formatBlockLabel(block.id)}
              </th>

              {DAY_LABELS.map((_, dayIdx) => {
                const isOn = state[block.id][dayIdx];
                return (
                  <td key={`${dayIdx}-${block.id}`} style={{ padding: 10 }}>
                    <button
                      type="button"
                      aria-pressed={isOn}
                      onClick={() => toggle(dayIdx, block.id)}
                      className={`btn cell ${isOn ? "cell--on" : ""}`}
                      title={isOn ? "Click to mark unavailable" : "Click to mark available"}
                    >
                      {isOn ? "Available" : "Unavailable"}
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
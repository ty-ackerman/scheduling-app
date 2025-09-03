'use client';
// WeekGrid.tsx — staff week view with deadline badge colors.
// - Tomorrow → orange, Today → red, Locked → grey, Future → green.

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
type GetResp = {
  ok: boolean;
  week: string;
  availability: AvailabilityState;
  lockAt: string | null;
  isLocked: boolean;
};

const STORAGE_KEY = "availability:v1";

const emptyState = (): AvailabilityState => ({
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

function loadLocal(): AvailabilityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (isAvailabilityState(parsed)) return parsed;
    return emptyState();
  } catch {
    return emptyState();
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

/** Map deadline to label + semantic state for coloring. */
function formatDue(lockAtISO: string | null): {
  label: string;
  state: "none" | "future" | "tomorrow" | "today" | "locked";
} {
  if (!lockAtISO) return { label: "No deadline set", state: "none" };

  const now = Date.now();
  const ts = new Date(lockAtISO).getTime();
  if (now >= ts) return { label: "Locked by manager", state: "locked" };

  const diffMs = ts - now;
  const mins = Math.round(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const minutesOnly = mins % 60;

  const lockDate = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = lockDate.toDateString() === today.toDateString();
  const isTomorrow = lockDate.toDateString() === tomorrow.toDateString();

  const timeStr = lockDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (mins < 60) return { label: `Due in ${mins} minute${mins === 1 ? "" : "s"}`, state: "today" };
  if (sameDay)
    return {
      label: `Due in ${hours} hour${hours === 1 ? "" : "s"}${minutesOnly ? ` ${minutesOnly} min` : ""}`,
      state: "today",
    };
  if (isTomorrow) return { label: `Due tomorrow at ${timeStr}`, state: "tomorrow" };

  const dateStr = lockDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return { label: `Due by ${dateStr} at ${timeStr}`, state: "future" };
}

/** Return colors for the badge given the semantic state. */
function badgeColors(state: "none" | "future" | "tomorrow" | "today" | "locked") {
  switch (state) {
    case "today": {
      const fg = "#ef4444"; // red-500
      return { bg: "rgba(239,68,68,0.15)", border: fg, fg };
    }
    case "tomorrow": {
      const fg = "#f59e0b"; // amber-500
      return { bg: "rgba(245,158,11,0.18)", border: fg, fg };
    }
    case "locked": {
      const fg = "#9CA3AF"; // gray-400
      return { bg: "rgba(156,163,175,0.18)", border: fg, fg };
    }
    case "future": {
      const fg = "#10b981"; // emerald-500
      return { bg: "rgba(16,185,129,0.18)", border: fg, fg };
    }
    case "none":
    default: {
      const fg = "var(--muted)";
      return { bg: "transparent", border: "var(--border)", fg };
    }
  }
}

export default function WeekGrid() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role ?? "STAFF";
  const isManager = role === "MANAGER";

  // Local editable state
  const [state, setState] = useState<AvailabilityState>(emptyState());

  // Server snapshot & lock info
  const [serverState, setServerState] = useState<AvailabilityState | null>(null);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  // Save UX
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hydrate from localStorage immediately (so the UI is responsive)
  useEffect(() => {
    setState(loadLocal());
  }, []);

  // Fetch server state for this week when signed in
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
          const json: GetResp = await res.json();
          if (json?.availability && isAvailabilityState(json.availability)) {
            setServerState(json.availability);
            setState(json.availability); // take server as truth
          }
          setLockAt(json.lockAt ?? null);
          setIsLocked(!!json.isLocked);
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
      const anyTrue = state.MORNING.some(Boolean) || state.AFTERNOON.some(Boolean) || state.EVENING.some(Boolean);
      return anyTrue;
    }
    return JSON.stringify(state) !== JSON.stringify(serverState);
  }, [serverLoaded, serverState, state]);

  const toggle = (dayIndex: number, blockId: TimeBlockId) => {
    if (isLocked && !isManager) return; // read-only for staff after lock
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
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
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
    if (isLocked && !isManager) return "Locked";
    if (isDirty) return "Save changes";
    return "Up to date";
  }, [saveStatus, status, serverLoaded, isDirty, isLocked, isManager]);

  const saveDisabled =
    saveStatus === "saving" ||
    status !== "authenticated" ||
    !serverLoaded ||
    (!isDirty && !(isLocked && !isManager)) ||
    (isLocked && !isManager);

  const due = formatDue(lockAt);
  const colors = badgeColors(due.state);

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
          <p style={{ color: "var(--muted-2)", fontSize: 13, marginBottom: 8 }}>
            Days × Time Blocks (09:00–12:00, 12:00–17:00, 17:00–21:00)
          </p>

          {/* Due banner */}
          <div
            className="pill"
            style={{
              gap: 8,
              padding: "6px 10px",
              background: colors.bg,
              borderColor: colors.border,
              color: colors.fg,
              fontSize: 12,
            }}
            aria-live="polite"
          >
            {due.label}
          </div>
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
                      title={
                        isLocked && !isManager
                          ? "Locked by manager"
                          : isOn
                          ? "Click to mark unavailable"
                          : "Click to mark available"
                      }
                      disabled={isLocked && !isManager}
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
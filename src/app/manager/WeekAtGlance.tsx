'use client';
// WeekAtGlance.tsx — manager view with deadline badge colors + simple picker button.
// Adds a small link to the new Assign Shifts page.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  lockAt: string | null;
  isLocked: boolean;
};

type WeekMeta = {
  ok: boolean;
  startMonday: string;
  lockAt: string | null;
  isLocked: boolean;
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

// Same mapping as staff view
function formatDue(lockAtISO: string | null): {
  label: string;
  state: "none" | "future" | "tomorrow" | "today" | "locked";
} {
  if (!lockAtISO) return { label: "No deadline set", state: "none" };

  const now = Date.now();
  const ts = new Date(lockAtISO).getTime();
  if (now >= ts) return { label: "Locked", state: "locked" };

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

function badgeColors(state: "none" | "future" | "tomorrow" | "today" | "locked") {
  switch (state) {
    case "today": {
      const fg = "#ef4444";
      return { bg: "rgba(239,68,68,0.15)", border: fg, fg };
    }
    case "tomorrow": {
      const fg = "#f59e0b";
      return { bg: "rgba(245,158,11,0.18)", border: fg, fg };
    }
    case "locked": {
      const fg = "#9CA3AF";
      return { bg: "rgba(156,163,175,0.18)", border: fg, fg };
    }
    case "future": {
      const fg = "#10b981";
      return { bg: "rgba(16,185,129,0.18)", border: fg, fg };
    }
    case "none":
    default: {
      const fg = "var(--muted)";
      return { bg: "transparent", border: "var(--border)", fg };
    }
  }
}

export default function WeekAtGlance() {
  const weekISO = useMemo(mondayOfCurrentWeekISO, []);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // lock controls
  const [meta, setMeta] = useState<WeekMeta | null>(null);
  const [pendingISO, setPendingISO] = useState<string>(""); // ISO string to POST
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const run = async () => {
      setErr(null);
      try {
        const [a, m] = await Promise.all([
          fetch(`/api/manager/availability?week=${weekISO}`, { cache: "no-store" }),
          fetch(`/api/manager/week?week=${weekISO}`, { cache: "no-store" }),
        ]);
        if (!a.ok) throw new Error(`Availability HTTP ${a.status}`);
        if (!m.ok) throw new Error(`Week HTTP ${m.status}`);
        const aj = (await a.json()) as ApiResponse;
        const mj = (await m.json()) as WeekMeta;
        setData(aj);
        setMeta(mj);
        setPendingISO(mj.lockAt ?? "");
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load");
      }
    };
    run();
  }, [weekISO]);

  const due = formatDue(meta?.lockAt ?? null);
  const colors = badgeColors(due.state);

  // Open the native picker from a button
  const openPicker = () => {
    const el = hiddenInputRef.current;
    if (!el) return;
    if (pendingISO) {
      const dt = new Date(pendingISO);
      el.value = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    } else {
      el.value = "";
    }
    // @ts-expect-error showPicker may exist
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  const setLock = async () => {
    setErr(null);
    try {
      const res = await fetch("/api/manager/week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week: weekISO, lockAt: pendingISO || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const mj = (await res.json()) as WeekMeta;
      setMeta(mj);
      const a = await fetch(`/api/manager/availability?week=${weekISO}`, { cache: "no-store" });
      if (a.ok) setData((await a.json()) as ApiResponse);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save deadline");
    }
  };

  return (
    <section className="surface" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h2 className="text-lg" style={{ fontWeight: 600, marginBottom: 4 }}>Week at a Glance</h2>
            <Link href="/manager/assign" className="btn btn-quiet" title="Assign Front Desk & Facilitator">
              Assign shifts →
            </Link>
          </div>
          <p style={{ color: "var(--muted-2)", fontSize: 13, marginBottom: 8 }}>
            Week starting: <span style={{ color: "var(--fg)" }}>{weekISO}</span>
          </p>

          {/* due banner with new colors */}
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

        {/* lock controls */}
        <div className="surface" style={{ padding: 12, minWidth: 320 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Set due date</div>

          {/* Hidden datetime-local input (used only to show the native picker) */}
          <input
            ref={hiddenInputRef}
            type="datetime-local"
            onChange={(e) => {
              const val = e.currentTarget.value;
              if (!val) {
                setPendingISO("");
                return;
              }
              const local = new Date(val);
              setPendingISO(local.toISOString());
            }}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
            aria-hidden="true"
            tabIndex={-1}
          />

          {/* Picker trigger + current selection */}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={openPicker} style={{ flex: 1 }}>
              {pendingISO
                ? new Date(pendingISO).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Choose deadline…"}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setPendingISO("")} title="Clear deadline selection">
              Clear
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={setLock} title="Save deadline">
              {pendingISO ? "Save deadline" : "Remove deadline"}
            </button>
          </div>

          {err && <div style={{ color: "var(--warn-fg)", fontSize: 12, marginTop: 6 }}>Error: {err}</div>}
        </div>
      </div>

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
                          background: hasAny ? "#059669" : "var(--card)",
                          borderColor: hasAny ? "#059669" : "var(--border-strong)",
                          color: hasAny ? "#fff" : "var(--muted)",
                          display: "inline-flex",
                          gap: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                        }}
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
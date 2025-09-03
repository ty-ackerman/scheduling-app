'use client';
// /manager/assign — Assign one Front Desk + one Facilitator per block.
// - Grid shows two small slots per cell.
// - Selecting a slot shows a right-side panel with candidates filtered by availability.
// - Candidates sorted by lowest scheduled hours this week (helps balance).
// - Assign or Clear updates immediately via API.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DAY_LABELS,
  ALL_TIME_BLOCKS,
  formatBlockLabel,
  type TimeBlockId,
} from "@/lib/timeblocks";

type TimeBlock = "MORNING" | "AFTERNOON" | "EVENING";
type ShiftRole = "FRONT_DESK" | "FACILITATOR";

type AssignMap = Record<
  string,
  { role: ShiftRole; userId: string | null; name: string | null; email: string | null }
>;
type HoursByUser = Record<string, number>;

type CellInfo = {
  ok: boolean;
  week: string;
  dayIndex: number;
  blockId: TimeBlock;
  current: Record<ShiftRole, { userId: string | null; name: string | null; email: string | null } | null>;
  candidates: { id: string; name: string | null; email: string; scheduledHours: number }[];
  lockAt: string | null;
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

function badge(text: string, tone: "ok" | "warn" | "quiet" = "ok") {
  const styles =
    tone === "ok"
      ? { bg: "var(--ok-bg)", fg: "var(--ok-fg)", border: "var(--ok-fg)" }
      : tone === "warn"
      ? { bg: "var(--warn-bg)", fg: "var(--warn-fg)", border: "var(--warn-fg)" }
      : { bg: "transparent", fg: "var(--muted)", border: "var(--border)" };
  return (
    <span
      className="pill"
      style={{
        padding: "4px 8px",
        fontSize: 12,
        background: styles.bg,
        color: styles.fg,
        borderColor: styles.border,
      }}
    >
      {text}
    </span>
  );
}

export default function AssignPage() {
  const weekISO = useMemo(mondayOfCurrentWeekISO, []);
  const [assignments, setAssignments] = useState<AssignMap>({});
  const [hoursByUser, setHoursByUser] = useState<HoursByUser>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Selection state for the right panel
  const [sel, setSel] = useState<{ dayIndex: number; blockId: TimeBlock; role: ShiftRole } | null>(null);
  const [cellData, setCellData] = useState<CellInfo | null>(null);
  const [cellLoading, setCellLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/manager/assignments?week=${weekISO}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        setAssignments(j.assignments || {});
        setHoursByUser(j.hoursByUser || {});
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [weekISO]);

  const openCell = async (dayIndex: number, blockId: TimeBlock, role: ShiftRole) => {
    setSel({ dayIndex, blockId, role });
    setCellLoading(true);
    setCellData(null);
    try {
      const res = await fetch(`/api/manager/assignments?week=${weekISO}&day=${dayIndex}&block=${blockId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j: CellInfo = await res.json();
      setCellData(j);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load candidates");
    } finally {
      setCellLoading(false);
    }
  };

  const submitAssign = async (userId: string | null) => {
    if (!sel) return;
    try {
      const res = await fetch("/api/manager/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: weekISO,
          dayIndex: sel.dayIndex,
          blockId: sel.blockId,
          role: sel.role,
          userId, // null clears
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();

      // Update local assignment map
      const key = `${sel.dayIndex}-${sel.blockId}-${sel.role}`;
      setAssignments((prev) => ({
        ...prev,
        [key]: {
          role: sel.role,
          userId: j.assignment.userId,
          name: j.assignment.name,
          email: j.assignment.email,
        },
      }));

      // Refresh sidebar candidates (hours may have changed)
      await openCell(sel.dayIndex, sel.blockId, sel.role);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save assignment");
    }
  };

  const readName = (u: { name: string | null; email: string | null } | null) =>
    (u?.name?.trim() || u?.email || "—");

  return (
    <main className="surface" style={{ padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 className="text-xl" style={{ fontWeight: 600 }}>Assign Shifts</h1>
          {badge("One Front Desk + one Facilitator per block", "quiet")}
        </div>
        <div style={{ display: "inline-flex", gap: 8 }}>
          <Link href="/manager" className="btn btn-quiet">Back to Manager</Link>
          <Link href="/week" className="btn btn-quiet">View as Staff</Link>
        </div>
      </header>

      {loading ? (
        <div style={{ color: "var(--muted)" }}>Loading…</div>
      ) : err ? (
        <div style={{ color: "var(--warn-fg)" }}>Error: {err}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
          {/* Left: grid */}
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left", minWidth: 160 }}>Time Block</th>
                  {DAY_LABELS.map((d) => (
                    <th key={d} style={{ textAlign: "left", minWidth: 140 }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_TIME_BLOCKS.map((block) => (
                  <tr key={block.id}>
                    <th style={{ padding: 12, whiteSpace: "nowrap" }}>{formatBlockLabel(block.id)}</th>
                    {DAY_LABELS.map((_, dayIdx) => {
                      const fdKey = `${dayIdx}-${block.id}-FRONT_DESK`;
                      const faKey = `${dayIdx}-${block.id}-FACILITATOR`;
                      const fd = assignments[fdKey] || null;
                      const fa = assignments[faKey] || null;

                      return (
                        <td key={`${block.id}-${dayIdx}`} style={{ padding: 10 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                            <button
                              type="button"
                              className="btn cell"
                              onClick={() => openCell(dayIdx, block.id as TimeBlock, "FRONT_DESK")}
                              title="Assign Front Desk"
                              style={{ justifyContent: "space-between" }}
                            >
                              <span style={{ fontSize: 12, opacity: 0.85 }}>Front Desk</span>
                              <span style={{ fontWeight: 600 }}>
                                {fd?.name || fd?.email || "Set"}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="btn cell"
                              onClick={() => openCell(dayIdx, block.id as TimeBlock, "FACILITATOR")}
                              title="Assign Facilitator"
                              style={{ justifyContent: "space-between" }}
                            >
                              <span style={{ fontSize: 12, opacity: 0.85 }}>Facilitator</span>
                              <span style={{ fontWeight: 600 }}>
                                {fa?.name || fa?.email || "Set"}
                              </span>
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right: candidate panel */}
          <aside className="surface" style={{ padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Details</div>
            {!sel ? (
              <div style={{ color: "var(--muted)" }}>
                Select a cell (Front Desk or Facilitator) to see candidates.
              </div>
            ) : cellLoading ? (
              <div style={{ color: "var(--muted)" }}>Loading candidates…</div>
            ) : cellData ? (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {DAY_LABELS[sel.dayIndex]} • {formatBlockLabel(sel.blockId as TimeBlockId)} • <strong>{sel.role.replace("_", " ")}</strong>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Current:{" "}
                    <span style={{ fontWeight: 600 }}>
                      {readName(
                        cellData.current[sel.role] ?? null
                      )}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => submitAssign(null)}
                    title="Clear assignment"
                  >
                    Clear
                  </button>
                </div>

                <div style={{ fontWeight: 600, margin: "8px 0" }}>Candidates</div>
                {cellData.candidates.length === 0 ? (
                  <div style={{ color: "var(--muted)" }}>No available candidates for this slot.</div>
                ) : (
                  <ul style={{ display: "grid", gap: 8 }}>
                    {cellData.candidates.map((c) => (
                      <li key={c.id}>
                        <div
                          className="surface"
                          style={{
                            padding: 10,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{c.name || c.email}</div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                              Scheduled this week: {c.scheduledHours}h
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => submitAssign(c.id)}
                          >
                            Assign
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div style={{ color: "var(--muted)" }}>No data.</div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
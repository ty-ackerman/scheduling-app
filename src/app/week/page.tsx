"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import WeekGrid from "@/components/WeekGrid";
import RoleChips, { RoleMode } from "./components/RoleChips";
import BlockDrawer from "./components/BlockDrawer";

type Block = {
  id: string;
  startMin: number;
  endMin: number;
  label?: string | null;
  locked: boolean;
  isClass: boolean;
};
type WeekAPI = {
  startISO: string;
  days: { dateISO: string; blocks: Block[] }[];
  month?: { year: number; month: number; status: "DRAFT" | "FINAL" };
};

const ALL_ROLES = ["FACILITATOR", "FRONT_DESK", "CLEANER"] as const;

export default function WeekPage() {
  const qs = useSearchParams();
  const router = useRouter();
  const startISOQuery = qs.get("start") || "";
  const daysParam = Math.max(1, Math.min(7, parseInt(qs.get("days") || "7", 10)));

  const weekStartISO = useMemo(() => {
    if (startISOQuery) return startISOQuery;
    return DateTime.local().startOf("week").plus({ days: 1 }).toISODate()!;
  }, [startISOQuery]);

  const monthStr = useMemo(() => DateTime.fromISO(weekStartISO).toFormat("yyyy-LL"), [weekStartISO]);

  const [week, setWeek] = useState<WeekAPI | null>(null);

  // counts for “All” (no filter)
  const [countsAll, setCountsAll] = useState<Record<string, number>>({});
  // per-role counts
  const [countsByRole, setCountsByRole] = useState<Record<string, Record<string, number>>>({});

  // NEW: radio-style role mode (one active at all times)
  const [roleMode, setRoleMode] = useState<RoleMode>("ALL");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBlock, setDrawerBlock] = useState<(Block & { dateISO: string }) | undefined>(undefined);
  const [drawerRoles, setDrawerRoles] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/blocks/week?start=${encodeURIComponent(weekStartISO)}&days=${daysParam}`, { cache: "no-store" });
      const data: WeekAPI = await res.json();
      if (!alive) return;
      setWeek(data);
    })();
    return () => { alive = false; };
  }, [weekStartISO, daysParam]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // all
      const resAll = await fetch(`/api/availability/summary?month=${monthStr}`, { cache: "no-store" });
      const jsonAll = await resAll.json();

      // per role
      const roleEntries = await Promise.all(
        ALL_ROLES.map(async (r) => {
          const res = await fetch(`/api/availability/summary?month=${monthStr}&roles=${r}`, { cache: "no-store" });
          const j = await res.json();
          return [r, j.counts || {}] as const;
        })
      );

      if (!alive) return;
      setCountsAll(jsonAll.counts || {});
      const map: Record<string, Record<string, number>> = {};
      for (const [r, c] of roleEntries) map[r] = c;
      setCountsByRole(map);
    })();
    return () => { alive = false; };
  }, [monthStr]);

  function pushWeek(iso: string) {
    router.push(`/week?start=${encodeURIComponent(iso)}&days=${daysParam}`);
  }
  const onPrev = () => pushWeek(DateTime.fromISO(weekStartISO).minus({ weeks: 1 }).toISODate()!);
  const onNext = () => pushWeek(DateTime.fromISO(weekStartISO).plus({ weeks: 1 }).toISODate()!);
  const onThis = () => pushWeek(DateTime.local().startOf("week").plus({ days: 1 }).toISODate()!);

  // derive props for grid from roleMode
  const selectedRoles = roleMode === "ALL" ? ["FACILITATOR", "FRONT_DESK", "CLEANER"] : [];
  const counts =
    roleMode === "ALL"
      ? countsAll
      : countsByRole[roleMode] ?? {};

  return (
    <div>
      {/* Toolbar */}
      <div className="surface" style={{ padding: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 4 }}>Manager Week View</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Week of <strong>{weekStartISO}</strong> • Month: <strong>{monthStr}</strong></div>
        </div>
        <div className="pill" style={{ gap: 6 }}>
          <button className="btn btn-quiet" onClick={onPrev}>← Prev</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onThis}>This week</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onNext}>Next →</button>
        </div>
      </div>

      {/* Role selector (radio-style) */}
      <div style={{ marginBottom: 12 }}>
        <RoleChips value={roleMode} onChange={setRoleMode} />
      </div>

      {/* Grid */}
      {week ? (
        <WeekGrid
          days={week.days}
          counts={counts}
          selectedRoles={selectedRoles}          // -> [] when single role; 3 roles when “All”
          countsByRole={countsByRole}
          onBlockClick={(blk, roleOverride) => {
            // Drawer roles: if single role mode, use that; if ALL, use clicked lane role (if provided)
            const rolesForDrawer =
              roleMode === "ALL"
                ? (roleOverride ? [roleOverride] : ["FACILITATOR", "FRONT_DESK", "CLEANER"])
                : [roleMode];
            setDrawerRoles(rolesForDrawer);
            setDrawerBlock(blk);
            setDrawerOpen(true);
          }}
        />
      ) : (
        <div className="surface" style={{ padding: 16 }}>Loading…</div>
      )}

      {/* Drawer */}
      <BlockDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        block={drawerBlock}
        monthStr={monthStr}
        selectedRoles={drawerRoles}
      />
    </div>
  );
}
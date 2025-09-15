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

  const monthStr = useMemo(
    () => DateTime.fromISO(weekStartISO).toFormat("yyyy-LL"),
    [weekStartISO]
  );

  const [week, setWeek] = useState<WeekAPI | null>(null);

  // counts for “All”
  const [countsAll, setCountsAll] = useState<Record<string, number>>({});
  // per-role counts
  const [countsByRole, setCountsByRole] = useState<Record<string, Record<string, number>>>({});

  // One mode always selected (radio style)
  const [roleMode, setRoleMode] = useState<RoleMode>("ALL");

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBlock, setDrawerBlock] = useState<(Block & { dateISO: string }) | undefined>(undefined);
  const [drawerRoles, setDrawerRoles] = useState<string[]>([]);

  // Load week grid
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(
        `/api/blocks/week?start=${encodeURIComponent(weekStartISO)}&days=${daysParam}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        console.error("[/week] blocks failed", res.status, await res.text());
        return;
      }
      const data: WeekAPI = await res.json();
      if (!alive) return;
      setWeek(data);
    })();
    return () => {
      alive = false;
    };
  }, [weekStartISO, daysParam]);

  // Load counts for All + per-role
  useEffect(() => {
    let alive = true;
    (async () => {
      const resAll = await fetch(`/api/availability/summary?month=${monthStr}`, { cache: "no-store" });
      const jsonAll = resAll.ok ? await resAll.json() : { counts: {} };

      const rolePairs = await Promise.all(
        ALL_ROLES.map(async (r) => {
          const res = await fetch(`/api/availability/summary?month=${monthStr}&roles=${r}`, { cache: "no-store" });
          const j = res.ok ? await res.json() : { counts: {} };
          return [r, j.counts || {}] as const;
        })
      );

      if (!alive) return;
      setCountsAll(jsonAll.counts || {});
      const map: Record<string, Record<string, number>> = {};
      for (const [r, c] of rolePairs) map[r] = c;
      setCountsByRole(map);
    })();
    return () => {
      alive = false;
    };
  }, [monthStr]);

  function pushWeek(iso: string) {
    router.push(`/week?start=${encodeURIComponent(iso)}&days=${daysParam}`);
  }
  const onPrev = () => pushWeek(DateTime.fromISO(weekStartISO).minus({ weeks: 1 }).toISODate()!);
  const onNext = () => pushWeek(DateTime.fromISO(weekStartISO).plus({ weeks: 1 }).toISODate()!);
  const onThis = () => pushWeek(DateTime.local().startOf("week").plus({ days: 1 }).toISODate()!);

  // Derive what we show based on mode
  const selectedRoles =
    roleMode === "ALL" ? ["FACILITATOR", "FRONT_DESK", "CLEANER"] : [roleMode];
  const counts = roleMode === "ALL" ? countsAll : (countsByRole[roleMode] ?? {});

  return (
    <div>
      {/* Toolbar */}
      <div
        className="surface"
        style={{
          padding: 12,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 4 }}>
            Manager Week View
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Week of <strong>{weekStartISO}</strong> • Month: <strong>{monthStr}</strong>
          </div>
        </div>
        <div className="pill" style={{ gap: 6 }}>
          <button className="btn btn-quiet" onClick={onPrev}>
            ← Prev
          </button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onThis}>
            This week
          </button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onNext}>
            Next →
          </button>
        </div>
      </div>

      {/* Role selector */}
      <div style={{ marginBottom: 12 }}>
        <RoleChips value={roleMode} onChange={setRoleMode} />
      </div>

      {/* Grid */}
      {week ? (
        <WeekGrid
          days={week.days}
          counts={counts}
          onBlockClick={(blk) => {
            // Which roles should the drawer use?
            const rolesForDrawer =
              roleMode === "ALL" ? ["FACILITATOR", "FRONT_DESK", "CLEANER"] : [roleMode];
            setDrawerRoles(rolesForDrawer);
            setDrawerBlock(blk as any); // blk already contains dateISO, startMin, endMin, id
            setDrawerOpen(true);
          }}
        />
      ) : (
        <div className="surface" style={{ padding: 16 }}>
          Loading…
        </div>
      )}

      {/* Drawer */}
      <BlockDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        block={
          drawerBlock
            ? {
              id: drawerBlock.id,
              dateISO: (drawerBlock as any).dateISO,
              startMin: drawerBlock.startMin,
              endMin: drawerBlock.endMin,
            }
            : undefined
        }
        monthStr={monthStr}
        selectedRoles={drawerRoles}
      />
    </div>
  );
}
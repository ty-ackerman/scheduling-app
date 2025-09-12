"use client";

import React, { useEffect, useState } from "react";
import { DateTime } from "luxon";
import type { WeekGridBlock } from "@/components/WeekGrid";

type UserRow = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  location: string; // enum string
  everyWeek: boolean;
};

type BlockDrill = {
  month: string;
  blockId: string;
  users: UserRow[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  block?: WeekGridBlock & { dateISO: string };
  monthStr: string;
  selectedRoles: string[]; // filter
};

export default function BlockDrawer({ open, onClose, block, monthStr, selectedRoles }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UserRow[]>([]);

  useEffect(() => {
    let alive = true;
    if (!open || !block) return;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams({ month: monthStr, blockId: block.id });
      if (selectedRoles.length) params.set("roles", selectedRoles.join(","));
      const res = await fetch(`/api/availability/block?${params.toString()}`, { cache: "no-store" });
      const data: BlockDrill = await res.json();
      if (!alive) return;
      setRows(data.users || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, block?.id, monthStr, selectedRoles]);

  if (!open || !block) return null;

  const label = `${DateTime.fromISO(block.dateISO).toFormat("ccc MM/dd")} • ${fmt(block.startMin)}–${fmt(block.endMin)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="surface"
      style={{
        position: "fixed",
        top: 72,
        right: 16,
        bottom: 16,
        width: 360,
        padding: 16,
        zIndex: 60,
        boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 400 }}>{label}</h3>
        <button className="btn" onClick={onClose}>Close</button>
      </div>

      {loading ? (
        <div style={{ color: "var(--muted)" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "var(--muted)" }}>No one available yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map(u => (
            <div key={u.id} className="surface" style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13 }}>{u.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {u.roles.join(", ")} • {u.location}
                </div>
              </div>
              {u.everyWeek && (
                <span className="pill" style={{ fontSize: 10, color: "var(--ok-fg)", borderColor: "color-mix(in oklab, var(--ok-fg) 30%, transparent)" }}>
                  Every week
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmt(mins: number) {
  return DateTime.fromObject({ hour: Math.floor(mins / 60), minute: mins % 60 }).toFormat("h:mm a");
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";

export type DrawerUser = { id: string; name: string | null; email: string | null };

export type DrawerBlock = {
  id: string;       // DatedBlock.id
  dateISO: string;
  startMin: number;
  endMin: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  block?: DrawerBlock;
  monthStr: string;           // "YYYY-MM"
  selectedRoles: string[];    // e.g. ["FACILITATOR"] or ["FACILITATOR","CLEANER"]
};

const fmt = (m: number) =>
  DateTime.fromObject({ hour: Math.floor(m / 60), minute: m % 60 }).toFormat("h:mm a");

export default function BlockDrawer({ open, onClose, block, monthStr, selectedRoles }: Props) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<DrawerUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    if (!block) return "";
    return `${DateTime.fromISO(block.dateISO).toFormat("ccc MM/dd")} • ${fmt(block.startMin)}–${fmt(block.endMin)}`;
  }, [block]);

  useEffect(() => {
    if (!open || !block) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setUsers([]);
      setError(null);

      try {
        const url = new URL("/api/manager/available", window.location.origin);
        url.searchParams.set("datedBlockId", block.id);
        url.searchParams.set("month", monthStr);

        // pass roles both as single (for legacy) and csv (for new)
        if (selectedRoles.length === 1) {
          url.searchParams.set("role", selectedRoles[0]); // legacy
        }
        url.searchParams.set("roles", selectedRoles.join(",")); // new
        url.searchParams.set("debug", "1");

        console.log("[Drawer] FETCH", url.toString());
        const res = await fetch(url.toString(), { cache: "no-store" });
        const text = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(text);
        } catch {
          console.warn("[Drawer] non-JSON response:", text);
        }
        console.log("[Drawer] STATUS", res.status, "DATA", data);

        if (!alive) return;

        if (!res.ok) {
          setError(data?.error || `HTTP ${res.status}`);
          return;
        }
        setUsers(Array.isArray(data?.users) ? data.users : []);
      } catch (e) {
        console.error("[Drawer] fetch error", e);
        if (alive) setError("Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, block?.id, monthStr, selectedRoles]);

  if (!open || !block) return null;

  return (
    <aside
      style={{
        position: "fixed",
        top: 72,
        right: 16,
        bottom: 16,
        width: 360,
        padding: 16,
        borderRadius: 12,
        background: "var(--card)",
        border: "1px solid var(--border)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        zIndex: 9999,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <button className="btn btn-quiet" onClick={onClose}>Close</button>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : error ? (
        <div style={{ color: "#ef4444" }}>{error}</div>
      ) : users.length === 0 ? (
        <div>No one available yet.</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
          {users.map((u) => (
            <li key={u.id} className="pill" style={{ fontSize: 13 }}>
              {u.name ?? u.email ?? "Unnamed"}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
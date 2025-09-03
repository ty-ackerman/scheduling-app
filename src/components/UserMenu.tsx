'use client';

import { useSession, signIn, signOut } from "next-auth/react";

export default function UserMenu() {
  const { data, status } = useSession();

  if (status === "loading") {
    return <span style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</span>;
  }

  if (!data?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("google")}
        className="btn btn-quiet"
        aria-label="Sign in"
      >
        Sign in
      </button>
    );
  }

  const label = data.user.name ?? data.user.email ?? "User";
  const role = (data.user as any).role ?? "STAFF";
  const isManager = role === "MANAGER";
  const initial = (label?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <div className="pill" aria-label="Account">
        <span className="avatar" aria-hidden>{initial}</span>
        <span className="text-sm" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span
          className="role-chip"
          style={{
            borderColor: isManager ? "#10b981" : "var(--border-strong)",
            color: isManager ? "#34d399" : "var(--muted)",
            background: isManager ? "var(--ok-bg)" : "transparent",
          }}
          title={isManager ? "Manager" : "Staff"}
        >
          {isManager ? "MANAGER" : "STAFF"}
        </span>
      </div>
      <button
        type="button"
        onClick={() => signOut()}
        className="btn btn-quiet"
        aria-label="Sign out"
      >
        Sign out
      </button>
    </div>
  );
}
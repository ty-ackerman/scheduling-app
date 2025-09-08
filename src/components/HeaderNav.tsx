"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

export default function HeaderNav() {
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const user = session?.user;
  const initial = (user?.name || user?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="navbar">
      <div className="container nav-row">
        <Link className="brand" href="/" aria-label="Home">
          <span className="brand-dot" aria-hidden="true" />
          Scheduling App
        </Link>

        <nav className="nav-links" aria-label="Primary">
          <Link className="nav-link" href="/week">Week View</Link>
          {mounted && user && <Link className="nav-link" href="/profile">Profile</Link>}
          {/* Manager-only links would be conditionally added here once we add a manager flag */}
        </nav>

        <div className="nav-right">
          {!mounted ? (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</span>
          ) : user ? (
            <div className="pill" style={{ gap: 10 }}>
              <span className="avatar" aria-hidden="true">{initial}</span>
              <span style={{ fontSize: 12 }}>{user.name || user.email}</span>
              <button className="btn btn-quiet" onClick={() => signOut()} style={{ height: 28 }}>
                Sign out
              </button>
            </div>
          ) : (
            <button className="btn" onClick={() => signIn("google")}>
              Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
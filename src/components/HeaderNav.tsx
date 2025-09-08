// src/components/HeaderNav.tsx
"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

export default function HeaderNav() {
  const { data: session, status } = useSession();

  const userName =
    (session?.user?.name || session?.user?.email || "Account")
      .toString()
      .trim();

  // First initial + last name style
  const avatarText = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p, i) => (i === 0 ? p[0] : p))
    .join(" ")
    .toUpperCase();

  return (
    <header className="navbar">
      <div className="container nav-row">
        <Link href="/" className="brand">
          <span className="brand-dot" />
          <span>Scheduling App</span>
        </Link>

        <nav className="nav-links">
          <Link href="/week-by-date?start=2025-10-06&days=7" className="nav-link">
            Week View
          </Link>
          {/* Show staff view when signed in */}
          {status === "authenticated" && (
            <Link
              href="/staff/week?start=2025-10-06&days=7"
              className="nav-link"
            >
              My availability
            </Link>
          )}
          {/* Manager link placeholder (hide for now if you haven’t re-added roles) */}
          {/* <Link href="/manager" className="nav-link">Manager</Link> */}
        </nav>

        <div className="nav-right">
          {status === "authenticated" ? (
            <>
              <div className="pill">
                <span className="avatar" aria-hidden>
                  {avatarText[0] ?? "U"}
                </span>
                <span>{userName}</span>
                {/* simple role chip placeholder */}
                <span className="role-chip">STAFF</span>
              </div>
              <button
                className="btn btn-quiet"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => signIn("google")}
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
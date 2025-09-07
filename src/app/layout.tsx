// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Scheduling App",
  description: "Simple scheduling app",
  // (avoids themeColor warning)
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="navbar">
          <div className="container nav-row">
            <Link href="/" className="brand" aria-label="Home">
              <span className="brand-dot" aria-hidden="true" />
              Scheduling App
            </Link>

            <nav className="nav-links" aria-label="Primary">
              <Link className="nav-link" href="/week-by-date?start=2025-10-06&days=7">
                Week View
              </Link>
            </nav>

            <div className="nav-right">
              <span className="pill">
                <span className="avatar">T</span>
                <span>Tyler Ackerman</span>
                <span className="role-chip">STAFF</span>
              </span>
              <button className="btn btn-quiet">Sign out</button>
            </div>
          </div>
        </div>

        <main className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
          {children}
        </main>
      </body>
    </html>
  );
}
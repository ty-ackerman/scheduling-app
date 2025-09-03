// Server header: modern, responsive navbar. Hides Manager link for non-managers.
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import authOptions from "@/../auth.config";
import UserMenu from "@/components/UserMenu";

export default async function HeaderNav() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "STAFF";
  const isManager = role === "MANAGER";

  return (
    <div className="navbar">
      <div className="container nav-row">
        {/* Brand */}
        <Link className="brand" href="/" aria-label="Home">
          <span className="brand-dot" aria-hidden />
          Scheduling App
        </Link>

        {/* Center links */}
        <nav className="nav-links" aria-label="Primary">
          <Link className="nav-link" href="/week">Week View</Link>
          {isManager && (
            <Link className="nav-link" href="/manager">Manager</Link>
          )}
        </nav>

        {/* Right side */}
        <div className="nav-right">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
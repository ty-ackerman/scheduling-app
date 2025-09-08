"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "FRONT_DESK" | "FACILITATOR" | "CLEANER";
type Location = "COLLEGE_WEST" | "LESLIEVILLE";

type ProfileDTO = {
  email: string;
  name: string | null;
  location: Location;
  roles: Role[];
};

const ALL_ROLES: Role[] = ["FRONT_DESK", "FACILITATOR", "CLEANER"] as const;
const LOCATION_OPTIONS: { value: Location; label: string; disabled?: boolean }[] = [
  { value: "COLLEGE_WEST", label: "College West" },
  { value: "LESLIEVILLE", label: "Leslieville", disabled: true }, // planned; disabled for now
];

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [location, setLocation] = useState<Location>("COLLEGE_WEST");
  const [roles, setRoles] = useState<Set<Role>>(new Set<Role>());

  const rolesArray = useMemo(() => Array.from(roles), [roles]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (res.status === 401) {
          // Not signed in → route to home (as per earlier app rule)
          router.replace("/");
          return;
        }
        if (!res.ok) {
          const t = await res.text();
          console.error("[profile] load failed:", res.status, t);
          setError("Failed to load profile.");
          return;
        }
        const data: ProfileDTO = await res.json();
        if (!alive) return;

        setEmail(data.email);
        setName(data.name ?? "");
        setLocation(data.location);
        setRoles(new Set<Role>(data.roles ?? []));
      } catch (e) {
        console.error(e);
        setError("Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          location,
          roles: rolesArray,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        console.error("[profile] save failed:", res.status, t);
        setError(res.status === 401 ? "You are signed out. Please sign in." : "Failed to save changes.");
        setSaving(false);
        return;
      }
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch (e) {
      console.error(e);
      setSaving(false);
      setError("Failed to save changes.");
    }
  }

  function toggleRole(r: Role) {
    setRoles(prev => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  return (
    <main className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div className="surface" style={{ padding: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 8, fontWeight: 400 }}>Profile</h1>
        <p style={{ marginTop: 0, color: "var(--muted)", fontSize: 13 }}>
          Update name, location, and roles. These personalize scheduling and availability.
        </p>

        {loading ? (
          <div style={{ padding: 8, color: "var(--muted)" }}>Loading…</div>
        ) : (
          <form onSubmit={onSave} style={{ display: "grid", gap: 16, maxWidth: 520 }}>
            <div>
              <label htmlFor="email" style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                Email (read-only)
              </label>
              <input
                id="email"
                value={email}
                readOnly
                className="input"
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 8,
                  border: "1px solid var(--border-strong)",
                  background: "var(--card)",
                  padding: "0 10px",
                  color: "var(--muted)",
                }}
              />
            </div>

            <div>
              <label htmlFor="name" style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                Name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                className="input"
                placeholder="First Last"
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 8,
                  border: "1px solid var(--border-strong)",
                  background: "var(--card)",
                  padding: "0 10px",
                }}
              />
            </div>

            <div>
              <label htmlFor="location" style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                Location
              </label>
              <select
                id="location"
                value={location}
                onChange={(e) => setLocation(e.currentTarget.value as Location)}
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 8,
                  border: "1px solid var(--border-strong)",
                  background: "var(--card)",
                  padding: "0 10px",
                }}
              >
                {LOCATION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}{opt.disabled ? " (coming soon)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                Roles (multi-select)
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {ALL_ROLES.map(r => {
                  const checked = roles.has(r);
                  return (
                    <label key={r} className="pill" style={{ cursor: "pointer", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRole(r)}
                        style={{ cursor: "pointer" }}
                        aria-label={r}
                      />
                      <span style={{ fontSize: 12 }}>
                        {r === "FRONT_DESK" ? "Front Desk" : r === "FACILITATOR" ? "Facilitator" : "Cleaner"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              {saved && (
                <span
                  className="pill"
                  style={{
                    borderColor: "#34d399",
                    background: "color-mix(in oklab, #34d399 12%, transparent)",
                    color: "#34d399",
                    fontSize: 12,
                  }}
                >
                  Saved
                </span>
              )}
              {error && (
                <span
                  className="pill"
                  title={error}
                  style={{
                    borderColor: "#ef4444",
                    background: "color-mix(in oklab, #ef4444 10%, transparent)",
                    color: "#ef4444",
                    fontSize: 12,
                  }}
                >
                  {error}
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
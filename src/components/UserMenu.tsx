'use client';
import { useSession, signIn, signOut } from "next-auth/react";

export default function UserMenu() {
  const { data, status } = useSession();
  if (status === "loading") return <span className="text-sm text-gray-500">Loading…</span>;
  if (!data?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("google")}
        className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
      >
        Sign in
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-700">{data.user.name ?? data.user.email}</span>
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
      >
        Sign out
      </button>
    </div>
  );
}
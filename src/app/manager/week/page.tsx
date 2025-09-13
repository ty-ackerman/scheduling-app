// Server component – redirect /manager/week -> /week (preserve query params)
import { redirect } from "next/navigation";

export default function ManagerWeekAlias({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
      else if (v != null) qs.set(k, String(v));
    }
  }
  redirect(`/week${qs.size ? `?${qs.toString()}` : ""}`);
}
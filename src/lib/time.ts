// src/lib/time.ts
import { DateTime } from "luxon";

export const HOUR_STEP_MIN = 60;

export function minsToHHMM(mins: number) {
  const dt = DateTime.fromObject({ hour: Math.floor(mins / 60), minute: mins % 60 });
  return dt.toFormat("h:mm a");
}

export function formatRange(startMin: number, endMin: number) {
  return `${minsToHHMM(startMin)} – ${minsToHHMM(endMin)}`;
}

export function mondayISOFrom(iso?: string) {
  if (iso) return iso;
  const monday = DateTime.local().startOf("week").plus({ days: 1 }); // Luxon week's first = Sun
  return monday.toISODate()!;
}
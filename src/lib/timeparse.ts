// src/lib/timeparse.ts

// Map various weekday names/abbreviations to 1..7 (Mon..Sun)
export const WEEKDAY_TO_NUM: Record<string, number> = {
  MONDAY: 1, MON: 1,
  TUESDAY: 2, TUE: 2, TUES: 2, TU: 2,
  WEDNESDAY: 3, WED: 3, WEDS: 3,
  THURSDAY: 4, THU: 4, THURS: 4, THUR: 4,
  FRIDAY: 5, FRI: 5,
  SATURDAY: 6, SAT: 6,
  SUNDAY: 7, SUN: 7,
};

// Parse something like "Thursday, October 2" or "Thu" or "Thursday"
export function parseWeekdayToNum(input: string): number | null {
  const raw = input.trim().toUpperCase();
  // Extract the first word before comma/space (e.g., "THURSDAY" from "Thursday, October 2")
  const first = raw.split(/[,\s]+/)[0];
  return WEEKDAY_TO_NUM[first] ?? null;
}

// Accepts "7AM - 10AM", "07:00–10:00", "3pm–5:30pm", with hyphen or en dash
const RANGE_RE = /^\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM)?)\s*[-–]\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM)?)\s*$/i;

export function parseTimeToMinutes(token: string): number | null {
  const t = token.trim().toUpperCase();
  // 24h "HH:MM"
  const m24 = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (m24) {
    const hh = parseInt(m24[1], 10);
    const mm = parseInt(m24[2], 10);
    return hh * 60 + mm;
  }
  // 12h "H" or "H:MM" with AM/PM
  const m12 = /^([0-1]?\d)(?::([0-5]\d))?\s*(AM|PM)$/.exec(t);
  if (m12) {
    let hh = parseInt(m12[1], 10);
    const mm = m12[2] ? parseInt(m12[2], 10) : 0;
    const mer = m12[3];
    if (mer === "AM") {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
    return hh * 60 + mm;
  }
  // Bare hours like "7" (assume 24h) — not recommended, but handle
  const bare = /^([0-1]?\d|2[0-3])$/.exec(t);
  if (bare) {
    return parseInt(bare[1], 10) * 60;
  }
  return null;
}

export function parseRangeToMinutes(range: string): { startMin: number; endMin: number } | null {
  const m = RANGE_RE.exec(range);
  if (!m) return null;
  const start = parseTimeToMinutes(m[1]);
  const end = parseTimeToMinutes(m[2]);
  if (start == null || end == null) return null;
  return { startMin: start, endMin: end };
}
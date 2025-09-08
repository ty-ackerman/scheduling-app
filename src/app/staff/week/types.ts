// src/app/staff/week/types.ts
export type Block = {
  id: string;
  day: number;         // 1..7 (Mon..Sun)
  startMin: number;    // minutes from 00:00
  endMin: number;      // minutes from 00:00
  label?: string | null;
  locked: boolean;
  isClass: boolean;
};

export type WeekAPI = {
  startISO: string; // week start date (Mon) e.g., 2025-10-06
  days: { dateISO: string; blocks: Block[] }[];
};

export type AvailabilityAPI = {
  month: string;        // "YYYY-MM"
  selections: string[]; // blockIds
  everyWeekIds: string[];
  user?: { id: string; email: string; name?: string | null };
};

export type DraftShape = {
  selections: string[];
  everyWeekIds: string[];
};
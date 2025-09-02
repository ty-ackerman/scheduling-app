

// Time block constants and helpers for a timezone-agnostic schedule.
// Using minutes-from-midnight to avoid DST/timezone complexity for Phase 1.

export type TimeBlockId = 'MORNING' | 'AFTERNOON' | 'EVENING';

export interface TimeBlock {
  id: TimeBlockId;
  label: string; // e.g., "09:00–12:00"
  startMinutes: number; // minutes from midnight
  endMinutes: number;   // minutes from midnight
  durationMinutes: number;
}

// Helper to format mm to HH:MM
function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// Factory for a block
function makeBlock(id: TimeBlockId, startMinutes: number, endMinutes: number): TimeBlock {
  return Object.freeze({
    id,
    label: `${toHHMM(startMinutes)}–${toHHMM(endMinutes)}`,
    startMinutes,
    endMinutes,
    durationMinutes: endMinutes - startMinutes,
  });
}

// Phase 1 fixed blocks
export const TIME_BLOCKS: Readonly<Record<TimeBlockId, TimeBlock>> = Object.freeze({
  MORNING: makeBlock('MORNING', 9 * 60, 12 * 60),      // 09:00–12:00
  AFTERNOON: makeBlock('AFTERNOON', 12 * 60, 17 * 60), // 12:00–17:00
  EVENING: makeBlock('EVENING', 17 * 60, 21 * 60),     // 17:00–21:00
});

export const ALL_TIME_BLOCKS: readonly TimeBlock[] = Object.freeze([
  TIME_BLOCKS.MORNING,
  TIME_BLOCKS.AFTERNOON,
  TIME_BLOCKS.EVENING,
]);

export const TIME_BLOCK_ORDER: readonly TimeBlockId[] = Object.freeze([
  'MORNING',
  'AFTERNOON',
  'EVENING',
]);

// Simple day labels for a Monday-start week view
export const DAY_LABELS: readonly string[] = Object.freeze([
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
]);

export function isBackToBack(prev: TimeBlockId, next: TimeBlockId): boolean {
  const idxPrev = TIME_BLOCK_ORDER.indexOf(prev);
  const idxNext = TIME_BLOCK_ORDER.indexOf(next);
  return idxPrev !== -1 && idxNext !== -1 && idxNext - idxPrev === 1;
}

export function isCloseToOpen(prevDayLast: TimeBlockId, nextDayFirst: TimeBlockId): boolean {
  return prevDayLast === 'EVENING' && nextDayFirst === 'MORNING';
}

export function formatBlockLabel(id: TimeBlockId): string {
  return TIME_BLOCKS[id].label;
}

export function minutesToLabel(minutes: number): string {
  return toHHMM(minutes);
}

export function totalWeekMinutesForBlocks(blockIds: TimeBlockId[]): number {
  return blockIds.reduce((sum, id) => sum + TIME_BLOCKS[id].durationMinutes, 0);
}
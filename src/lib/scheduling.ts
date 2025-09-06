// src/lib/scheduling.ts
// Small helpers for manager "Assign Shifts" to compute hours and conflicts.

export type TimeBlock = "MORNING" | "AFTERNOON" | "EVENING";
export type ShiftRole = "FRONT_DESK" | "FACILITATOR";

/**
 * The AssignMap shape used by /manager/assign UI.
 * Keys look like: `${dayIndex}-${blockId}-${role}`
 */
export type AssignMap = Record<
  string,
  { role: ShiftRole; userId: string | null; name: string | null; email: string | null }
>;

/** Hours per block (Phase 1) */
export const BLOCK_HOURS: Record<TimeBlock, number> = {
  MORNING: 3,
  AFTERNOON: 5,
  EVENING: 4,
};

/** Order of blocks within a day for adjacency checks */
export const BLOCK_ORDER: Record<TimeBlock, number> = {
  MORNING: 0,
  AFTERNOON: 1,
  EVENING: 2,
};

export const ALL_BLOCKS: TimeBlock[] = ["MORNING", "AFTERNOON", "EVENING"];

/** Compute weekly hours for a user from the current assignment map. */
export function totalHoursForUser(assignments: AssignMap, userId: string): number {
  let sum = 0;
  for (const key in assignments) {
    const a = assignments[key];
    if (a.userId === userId) {
      const [, blockId] = parseKey(key); // [dayIndex, blockId, role]
      sum += BLOCK_HOURS[blockId];
    }
  }
  return sum;
}

/** Returns true if the user is already assigned in an adjacent block that same day. */
export function hasBackToBack(
  assignments: AssignMap,
  userId: string,
  dayIndex: number,
  blockId: TimeBlock
): boolean {
  const order = BLOCK_ORDER[blockId];

  const neighbors: TimeBlock[] = [];
  if (order > 0) neighbors.push(ALL_BLOCKS[order - 1]);
  if (order < ALL_BLOCKS.length - 1) neighbors.push(ALL_BLOCKS[order + 1]);

  for (const nb of neighbors) {
    if (isAssignedInCell(assignments, userId, dayIndex, nb)) return true;
  }
  return false;
}

/** Returns true if user would be Close→Open (EVENING then next day's MORNING or previous EVENING to this MORNING). */
export function hasCloseToOpen(
  assignments: AssignMap,
  userId: string,
  dayIndex: number,
  blockId: TimeBlock
): boolean {
  // Case 1: assigning EVENING → check next day's MORNING
  if (blockId === "EVENING") {
    const nextDay = dayIndex + 1;
    if (nextDay <= 6 && isAssignedInCell(assignments, userId, nextDay, "MORNING")) {
      return true;
    }
  }
  // Case 2: assigning MORNING → check previous day's EVENING
  if (blockId === "MORNING") {
    const prevDay = dayIndex - 1;
    if (prevDay >= 0 && isAssignedInCell(assignments, userId, prevDay, "EVENING")) {
      return true;
    }
  }
  return false;
}

/** Convenience: predict conflicts + resulting hours if we assign this user to the cell. */
export function predictAssignmentImpact(
  assignments: AssignMap,
  userId: string,
  dayIndex: number,
  blockId: TimeBlock
): {
  backToBack: boolean;
  closeToOpen: boolean;
  projectedHours: number; // current scheduled + this block
} {
  const backToBack = hasBackToBack(assignments, userId, dayIndex, blockId);
  const closeToOpen = hasCloseToOpen(assignments, userId, dayIndex, blockId);
  const projectedHours = totalHoursForUser(assignments, userId) + BLOCK_HOURS[blockId];
  return { backToBack, closeToOpen, projectedHours };
}

/** Helpers */

function isAssignedInCell(
  assignments: AssignMap,
  userId: string,
  dayIndex: number,
  blockId: TimeBlock
): boolean {
  // We consider ANY role within that cell (Front Desk or Facilitator)
  const fdKey = makeKey(dayIndex, blockId, "FRONT_DESK");
  const faKey = makeKey(dayIndex, blockId, "FACILITATOR");
  return assignments[fdKey]?.userId === userId || assignments[faKey]?.userId === userId;
}

function makeKey(dayIndex: number, blockId: TimeBlock, role: ShiftRole): string {
  return `${dayIndex}-${blockId}-${role}`;
}

function parseKey(key: string): [number, TimeBlock, ShiftRole] {
  const [d, b, r] = key.split("-");
  return [Number(d), b as TimeBlock, r as ShiftRole];
}
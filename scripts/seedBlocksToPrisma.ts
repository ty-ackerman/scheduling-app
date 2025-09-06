#!/usr/bin/env ts-node
/**
 * Seed day-specific Block rows from a JSON produced by scripts/extractBlocks.ts
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/seedBlocksToPrisma.ts data/blocks.october.byDay.json
 *
 * Input JSON shape:
 *   [
 *     { "day": "MON", "label": "08:00–10:00", "start": "08:00", "end": "10:00" },
 *     ...
 *   ]
 */

import * as fs from "fs";
import * as path from "path";
import { PrismaClient, Weekday } from "@prisma/client";

type DayKey = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
type BlockInput = { day: DayKey; label: string; start: string; end: string };

const prisma = new PrismaClient();

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: ts-node scripts/seedBlocksToPrisma.ts <path/to/blocks.october.byDay.json>");
  process.exit(1);
}

function readBlocks(p: string): BlockInput[] {
  const abs = path.resolve(p);
  const raw = fs.readFileSync(abs, "utf8");
  const data = JSON.parse(raw) as BlockInput[];
  if (!Array.isArray(data)) throw new Error("Input JSON is not an array");
  return data;
}

const DAY_ORDER: DayKey[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function validate(b: BlockInput): string[] {
  const errs: string[] = [];
  if (!DAY_ORDER.includes(b.day)) errs.push(`Invalid day: ${b.day}`);
  if (!/^\d{2}:\d{2}$/.test(b.start)) errs.push(`Invalid start (HH:MM): ${b.start}`);
  if (!/^\d{2}:\d{2}$/.test(b.end)) errs.push(`Invalid end (HH:MM): ${b.end}`);
  if (!b.label || typeof b.label !== "string") errs.push(`Missing/invalid label`);
  return errs;
}

async function main() {
  const blocks = readBlocks(inputPath);

  // Sort: weekday then time
  blocks.sort((a, b) => {
    const od = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    if (od !== 0) return od;
    return a.start === b.start ? (a.end < b.end ? -1 : 1) : (a.start < b.start ? -1 : 1);
  });

  let created = 0;
  let updated = 0;
  const problems: string[] = [];

  for (const b of blocks) {
    const errs = validate(b);
    if (errs.length) {
      problems.push(`${b.day} ${b.label}: ${errs.join("; ")}`);
      continue;
    }

    try {
      await prisma.block.upsert({
        where: { day_startTime_endTime: { day: b.day as Weekday, startTime: b.start, endTime: b.end } },
        update: { label: b.label },
        create: {
          day: b.day as Weekday,
          label: b.label,
          startTime: b.start,
          endTime: b.end,
        },
      });
      // upsert doesn't tell us which branch; we can probe existence first if we care.
      // Keep it simple: just count as updated if exists, created otherwise.
      // Here, we’ll do a cheap check:
      const existing = await prisma.block.findUnique({
        where: { day_startTime_endTime: { day: b.day as Weekday, startTime: b.start, endTime: b.end } },
        select: { createdAt: true, updatedAt: true },
      });
      if (existing && existing.createdAt.getTime() !== existing.updatedAt.getTime()) {
        updated++;
      } else {
        created++;
      }
    } catch (e: any) {
      problems.push(`${b.day} ${b.label}: ${e?.message || String(e)}`);
    }
  }

  // Summary
  const total = blocks.length;
  console.log(`\nSeeded Blocks (day-specific)`);
  console.log(`Total in file: ${total}`);
  console.log(`Created: ${created}, Updated: ${updated}`);
  if (problems.length) {
    console.log(`\nWarnings/Errors (${problems.length}):`);
    for (const p of problems) console.log(` - ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`All blocks processed without errors.`);
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
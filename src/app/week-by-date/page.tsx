// src/app/week-by-date/page.tsx
import { prisma } from "@/lib/db";
import { DateTime } from "luxon";

type Block = {
  id: string;
  day: number;        // 1..7 (Mon..Sun)
  startMin: number;   // minutes from 00:00
  endMin: number;     // minutes from 00:00
  label: string | null;
  locked: boolean;
  isClass: boolean;
};

const HOUR_STEP_MIN = 60;
const ROW_PX = 72;       // 1 hour row height
const GUTTER_PX = 15;     // consistent spacing above + below each block
const COL_PADDING_PX = 8;// left/right breathing room inside each day column

const COLORS = {
  // neutral light-blue
  bg: "rgba(59, 130, 246, 0.16)",          // slate-blue fill
  border: "rgba(96, 165, 250, 0.85)",      // brighter blue border
  text: "#cfe8ff",

  // special “CLASS” blocks get a subtle violet tint
  classBg: "rgba(168, 85, 247, 0.18)",
  classBorder: "rgba(196, 181, 253, 0.90)",
};

export const dynamic = "force-dynamic";

export default async function WeekByDatePage(props: {
  searchParams: Promise<{ start?: string; days?: string }>;
}) {
  // Next.js 15 app router: await searchParams
  const sp = await props.searchParams;
  const startISO = sp.start || DateTime.now().toISODate()!;
  const days = Math.max(1, Math.min(14, Number(sp.days ?? 7)));

  // Build the header range Mon .. Sun-ish based on provided start
  const start = DateTime.fromISO(startISO);
  const dateList = Array.from({ length: days }, (_, i) => start.plus({ days: i }));

  // Map Luxon weekday to our stored 1..7 (Mon..Sun)
  const weekdayNums = dateList.map(d => d.weekday); // Luxon: Monday=1..Sunday=7

  // Load ALL template blocks (weekly recurring)
  const templates: Pick<Block, "id" | "day" | "startMin" | "endMin" | "label" | "locked" | "isClass">[] =
    await prisma.block.findMany({
      orderBy: [{ day: "asc" }, { startMin: "asc" }],
      select: { id: true, day: true, startMin: true, endMin: true, label: true, locked: true, isClass: true },
    });

  // Group templates by weekday 1..7
  const byDay = new Map<number, Block[]>();
  for (const d of weekdayNums) byDay.set(d, []);
  for (const t of templates) {
    if (byDay.has(t.day)) byDay.get(t.day)!.push(t as Block);
  }

  // Build the vertical time scale (min -> max from all used blocks)
  const dayBlocks = weekdayNums.flatMap(d => byDay.get(d) ?? []);
  const allTimes = Array.from(new Set(dayBlocks.flatMap(b => [b.startMin, b.endMin]))).sort((a, b) => a - b);

  // Safety fallbacks
  const minTime = (allTimes[0] ?? 7 * 60);
  const maxTime = (allTimes[allTimes.length - 1] ?? 22 * 60);

  // Hour rows
  const timeline: number[] = [];
  for (let t = Math.floor(minTime / 60) * 60; t <= Math.ceil(maxTime / 60) * 60; t += HOUR_STEP_MIN) {
    timeline.push(t);
  }

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 18 }}>Week by Date</h1>

      <div style={{ color: "var(--muted)", marginBottom: 10 }}>
        {dateList[0].toFormat("ccc LLL dd")} – {" "}
        {dateList[dateList.length - 1].toFormat("ccc LLL dd")}
      </div>

      <div className="wk-grid surface" style={{ overflow: "hidden" }}>
        {/* Header */}
        <div className="wk-header">
          <div className="wk-timecell">Time</div>
          {dateList.map(d => (
            <div key={d.toISODate()} className="wk-dayhead">
              {d.toFormat("ccc L/dd")}
            </div>
          ))}
        </div>

        {/* Body grid */}
        <div className="wk-body">
          {/* Left time rail */}
          <div className="wk-timecol">
            {timeline.map(t => (
              <div key={t} className="wk-hourrow">
                {DateTime.fromObject({ hour: Math.floor(t / 60), minute: 0 }).toFormat("HH:mm")}
              </div>
            ))}
          </div>

          {/* 7 columns */}
          {weekdayNums.map((wday, idx) => {
            const blocks = byDay.get(wday) ?? [];

            return (
              <div key={`${wday}-${idx}`} className="wk-col">
                {/* rows background */}
                {timeline.map((t, i) => (
                  <div key={t} className={`wk-hourbg ${i % 2 ? "is-odd" : ""}`} />
                ))}

                {/* blocks */}
                <div className="wk-col-abs">
                  {blocks.map(b => {
                    // base top/height in pixels (with gutter for visual spacing)
                    const baseTop = ((b.startMin - timeline[0]) / HOUR_STEP_MIN) * ROW_PX;
                    const baseHeight = Math.max(1, (b.endMin - b.startMin) / HOUR_STEP_MIN) * ROW_PX;

                    const top = baseTop + GUTTER_PX;
                    const height = Math.max(14, baseHeight - GUTTER_PX * 2); // never collapse

                    const isClass = !!b.isClass;
                    const bg = isClass ? COLORS.classBg : COLORS.bg;
                    const border = isClass ? COLORS.classBorder : COLORS.border;

                    return (
                      <div
                        key={b.id}
                        className={`wk-block${isClass ? " is-class" : ""}`}
                        style={{
                          top,
                          height,
                          left: COL_PADDING_PX,
                          right: COL_PADDING_PX,
                          background: bg,
                          borderColor: border,
                          color: COLORS.text,
                        }}
                        title={`${minsToHHMM(b.startMin)}–${minsToHHMM(b.endMin)}${isClass ? " · CLASS" : ""}`}
                      >
                        <div className="wk-block-title">
                          {`${minsToHHMM(b.startMin)}–${minsToHHMM(b.endMin)}`}
                          {isClass && <span className="wk-chip">CLASS</span>}
                        </div>
                        <div className="wk-block-sub">
                          {`${minsToLabel(b.startMin)}–${minsToLabel(b.endMin)}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Page-only styles */}
      <style>{`
        .wk-grid {
          border-radius: 12px;
          border: 1px solid var(--border);
        }
        .wk-header {
          display: grid;
          grid-template-columns: 80px repeat(${weekdayNums.length}, 1fr);
          border-bottom: 1px solid var(--border);
          background: color-mix(in oklab, var(--card) 88%, transparent);
        }
        .wk-timecell {
          padding: 10px 8px;
          font-size: 12px;
          color: var(--muted);
        }
        .wk-dayhead {
          text-align: center;
          padding: 10px 12px;
          font-size: 12px;
          color: var(--muted);
        }
        .wk-body {
          display: grid;
          grid-template-columns: 80px repeat(${weekdayNums.length}, 1fr);
          position: relative;
        }
        .wk-timecol {
          border-right: 1px solid var(--border);
          background: color-mix(in oklab, var(--card) 78%, transparent);
        }
        .wk-hourrow {
          height: ${ROW_PX}px;
          border-bottom: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
          font-size: 11px;
          color: var(--muted);
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          padding: 6px 8px 0 0;
        }
        .wk-col {
          position: relative;
          border-right: 1px solid color-mix(in oklab, var(--border) 65%, transparent);
          background: color-mix(in oklab, var(--card) 65%, transparent);
        }
        .wk-col:last-child { border-right: 0; }
        .wk-hourbg {
          height: ${ROW_PX}px;
          border-bottom: 1px solid color-mix(in oklab, var(--border) 65%, transparent);
        }
        .wk-hourbg.is-odd {
          background: color-mix(in oklab, var(--hover) 26%, transparent);
        }
        .wk-col-abs {
          position: absolute;
          inset: 0;
        }
        .wk-block {
          position: absolute;
          border: 1px solid;
          border-radius: 14px;
          padding: 10px 12px;
          font-size: 12px;
          box-shadow:
            0 1px 1px rgba(0,0,0,0.08),
            0 10px 22px rgba(0,0,0,0.12);
          backdrop-filter: blur(2px);
        }
        .wk-block-title {
          font-weight: 600;
          letter-spacing: .3px;
        }
        .wk-block-sub {
          margin-top: 6px;
          font-size: 10px;
          opacity: .9;
        }
        .wk-chip {
          margin-left: 8px;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 999px;
          border: 1px solid ${COLORS.classBorder};
          color: ${COLORS.text};
          background: ${COLORS.classBg};
        }
      `}</style>
    </div>
  );
}

/** helpers */
function minsToHHMM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function minsToLabel(mins: number) {
  return DateTime.fromObject({ hour: Math.floor(mins / 60), minute: mins % 60 }).toFormat("ha").toUpperCase();
}
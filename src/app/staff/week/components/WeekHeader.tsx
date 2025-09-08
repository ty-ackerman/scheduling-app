// src/app/staff/week/components/WeekHeader.tsx
"use client";

type Props = {
  weekStartISO: string;
  monthStr: string;
  dirty: boolean;
  savedFlash: boolean;
  errorMsg: string | null;
  onPrev: () => void;
  onNext: () => void;
  onThisWeek: () => void;
  onReset: () => void;
  onSave: () => void;
  saveDisabled: boolean;
};

export default function WeekHeader({
  weekStartISO, monthStr, dirty, savedFlash, errorMsg,
  onPrev, onNext, onThisWeek, onReset, onSave, saveDisabled
}: Props) {
  return (
    <div
      className="surface"
      style={{
        padding: 16,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontWeight: 400, fontSize: 20 }}>My Availability — Week (Calendar)</h1>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Week of <strong>{weekStartISO}</strong> • Month scope: <strong>{monthStr}</strong>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="pill" style={{ gap: 6 }}>
          <button className="btn btn-quiet" onClick={onPrev} title="Previous week">← Prev</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onThisWeek} title="Jump to this week">This week</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onNext} title="Next week">Next →</button>
        </div>

        {dirty ? (
          <span className="pill" style={{
            borderColor: "#ef4444",
            background: "color-mix(in oklab, #ef4444 10%, transparent)",
            color: "#ef4444", fontSize: 12
          }}>
            Unsaved changes
          </span>
        ) : savedFlash ? (
          <span className="pill" style={{
            borderColor: "#34d399",
            background: "color-mix(in oklab, #34d399 12%, transparent)",
            color: "#34d399", fontSize: 12
          }}>
            Saved
          </span>
        ) : (
          <span className="pill" style={{
            borderColor: "var(--border-strong)",
            background: "transparent",
            color: "var(--muted)", fontSize: 12
          }}>
            Up to date
          </span>
        )}

        {errorMsg && (
          <span className="pill" style={{
            borderColor: "#ef4444",
            background: "color-mix(in oklab, #ef4444 10%, transparent)",
            color: "#ef4444", fontSize: 12
          }} title={errorMsg}>
            {errorMsg}
          </span>
        )}

        <button className="btn" onClick={onReset} disabled={!dirty || saveDisabled} title="Discard local draft">
          Reset
        </button>

        <button className="btn btn-primary" onClick={onSave} disabled={!dirty || saveDisabled}>
          {saveDisabled ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
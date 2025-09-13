"use client";

type Props = {
  weekStartISO: string;
  monthStr: string;
  readOnly: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisWeek: () => void;

  // save/reset controls (shown only when not read-only)
  dirty?: boolean;
  saving?: boolean;
  errorMsg?: string | null;
  onReset?: () => void;
  onSave?: () => void;

  // e.g. "Draft" / "Final" / "Saved"
  statusLabel?: string;
};

export default function WeekHeader({
  weekStartISO,
  monthStr,
  readOnly,
  onPrev,
  onNext,
  onThisWeek,
  dirty = false,
  saving = false,
  errorMsg = null,
  onReset,
  onSave,
  statusLabel,
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
        <h1 style={{ margin: 0, fontWeight: 400, fontSize: 20 }}>
          My Availability — Week (Calendar)
        </h1>
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          Week of <strong>{weekStartISO}</strong> • Month scope:{" "}
          <strong>{monthStr}</strong>
          {statusLabel ? <> • <strong>{statusLabel}</strong></> : null}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* week nav */}
        <div className="pill" style={{ gap: 6 }}>
          <button className="btn btn-quiet" onClick={onPrev} title="Previous week">← Prev</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onThisWeek} title="Jump to this week">This week</button>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <button className="btn btn-quiet" onClick={onNext} title="Next week">Next →</button>
        </div>

        <span
          className="pill"
          style={{
            borderColor: "var(--border-strong)",
            background: readOnly
              ? "color-mix(in oklab, #94a3b8 12%, transparent)"
              : "transparent",
            color: "var(--muted)",
            fontSize: 12,
          }}
        >
          {readOnly ? "Final" : "Draft"}
        </span>

        {!readOnly && (
          <>
            {errorMsg && (
              <span
                className="pill"
                style={{
                  borderColor: "#ef4444",
                  background: "color-mix(in oklab, #ef4444 10%, transparent)",
                  color: "#ef4444",
                  fontSize: 12,
                }}
                title={errorMsg}
              >
                {errorMsg}
              </span>
            )}

            <span
              className="pill"
              style={{
                borderColor: dirty ? "#ef4444" : "var(--border-strong)",
                background: dirty
                  ? "color-mix(in oklab, #ef4444 10%, transparent)"
                  : "transparent",
                color: dirty ? "#ef4444" : "var(--muted)",
                fontSize: 12,
              }}
              title={dirty ? "Local draft differs from server" : "No local changes"}
            >
              {dirty ? "Unsaved changes" : "Up to date"}
            </span>

            <button
              className="btn"
              onClick={() => onReset?.()}
              disabled={!dirty || saving}
              title="Discard local draft"
            >
              Reset
            </button>

            <button
              className="btn btn-primary"
              onClick={() => onSave?.()}
              disabled={!dirty || saving}
              title={dirty ? "Save changes to server" : "No changes to save"}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
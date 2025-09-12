"use client";

import React from "react";

export type RoleMode = "ALL" | "FACILITATOR" | "FRONT_DESK" | "CLEANER";

type Props = {
  value: RoleMode;                 // always one selected
  onChange: (next: RoleMode) => void;
};

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onClick}
      aria-pressed={active}
      style={{
        height: 32,
        borderRadius: 999,
        padding: "0 12px",
        fontSize: 12,
        ...(active
          ? {
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              borderColor: "var(--accent)",
              filter: "brightness(1)",
            }
          : {}),
      }}
    >
      {label}
    </button>
  );
}

export default function RoleChips({ value, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Chip
        label="All"
        active={value === "ALL"}
        onClick={() => onChange("ALL")}
      />
      <Chip
        label="Facilitator"
        active={value === "FACILITATOR"}
        onClick={() => onChange("FACILITATOR")}
      />
      <Chip
        label="Front desk"
        active={value === "FRONT_DESK"}
        onClick={() => onChange("FRONT_DESK")}
      />
      <Chip
        label="Cleaner"
        active={value === "CLEANER"}
        onClick={() => onChange("CLEANER")}
      />
    </div>
  );
}
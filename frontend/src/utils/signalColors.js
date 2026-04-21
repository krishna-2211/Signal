export const SIGNAL_THEME = {
  credit_stress: {
    color:      "var(--red)",
    soft:       "var(--red-soft)",
    text:       "var(--red-text)",
    badgeClass: "signal-red",
    cardClass:  "red",
    label:      "Credit Stress",
    tlClass:    "red",
    tlTag:      "red",
    hex:        "#ef4444",
  },
  churn_risk: {
    color:      "var(--amber)",
    soft:       "var(--amber-soft)",
    text:       "var(--amber-text)",
    badgeClass: "signal-amber",
    cardClass:  "amber",
    label:      "Churn Risk",
    tlClass:    "amber",
    tlTag:      "amber",
    hex:        "#f59e0b",
  },
  upsell_opportunity: {
    color:      "var(--green)",
    soft:       "var(--green-soft)",
    text:       "var(--green-text)",
    badgeClass: "signal-green",
    cardClass:  "green",
    label:      "Upsell Opportunity",
    tlClass:    "green",
    tlTag:      "green",
    hex:        "#22c55e",
  },
  none: {
    color:      "var(--text-3)",
    soft:       "var(--bg-2)",
    text:       "var(--text-2)",
    badgeClass: "signal-gray",
    cardClass:  "gray",
    label:      "Stable",
    tlClass:    "gray",
    tlTag:      "gray",
    hex:        "#3b82f6",
  },
};

export function getSignalTheme(signalType) {
  const key = (signalType ?? "none").toLowerCase();
  return SIGNAL_THEME[key] ?? SIGNAL_THEME.none;
}

// Returns plain CSS values safe for inline styles — no Tailwind required.
export function getSignalColors(signalType) {
  const key = (signalType ?? "none").toLowerCase();
  if (key === "credit_stress") return {
    borderColor: "#ef4444",
    background:  "rgba(239,68,68,0.10)",
    badgeBg:     "rgba(239,68,68,0.22)",
    badgeColor:  "#f87171",
    textColor:   "#f87171",
    chart:       "#ef4444",
    label:       "Credit Stress",
  };
  if (key === "churn_risk") return {
    borderColor: "#f59e0b",
    background:  "rgba(245,158,11,0.10)",
    badgeBg:     "rgba(245,158,11,0.22)",
    badgeColor:  "#fbbf24",
    textColor:   "#fbbf24",
    chart:       "#f59e0b",
    label:       "Churn Risk",
  };
  if (key === "upsell_opportunity") return {
    borderColor: "#22c55e",
    background:  "rgba(34,197,94,0.10)",
    badgeBg:     "rgba(34,197,94,0.22)",
    badgeColor:  "#4ade80",
    textColor:   "#4ade80",
    chart:       "#22c55e",
    label:       "Upsell Opportunity",
  };
  return {
    borderColor: "#475569",
    background:  "transparent",
    badgeBg:     "rgba(71,85,105,0.30)",
    badgeColor:  "#94a3b8",
    textColor:   "#94a3b8",
    chart:       "#64748b",
    label:       "Stable",
  };
}

export const SIGNAL_LABEL = Object.fromEntries(
  Object.entries(SIGNAL_THEME).map(([k, v]) => [k, v.label])
);

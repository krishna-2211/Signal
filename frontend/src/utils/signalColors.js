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

export const SIGNAL_LABEL = Object.fromEntries(
  Object.entries(SIGNAL_THEME).map(([k, v]) => [k, v.label])
);

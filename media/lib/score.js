// barWidth and label are RELATIVE to the top hit in this result set, not absolute
// similarity thresholds — raw scores aren't reliable on a fixed scale across queries.
export function normalizeScores(items) {
  if (items.length === 0) return [];
  const max = Math.max(...items.map((item) => Number(item.score) || 0), 0);
  return items.map((item) => {
    const ratio = max > 0 ? (Number(item.score) || 0) / max : 1;
    const barWidth = Math.round(ratio * 100);
    const label = ratio >= 0.75 ? "Strong" : ratio >= 0.5 ? "Good" : "Weak";
    return { ...item, barWidth, label };
  });
}

export function nextFocusIndex(current, count, key) {
  if (count <= 0) return null;
  if (key === "ArrowDown") return Math.min((current < 0 ? -1 : current) + 1, count - 1);
  if (key === "ArrowUp") return Math.max(current - 1, 0);
  return null;
}

export function pushHistory(list, query, max = 10) {
  const trimmed = String(query).trim();
  if (!trimmed) return list;
  const without = list.filter((item) => item !== trimmed);
  return [trimmed, ...without].slice(0, max);
}

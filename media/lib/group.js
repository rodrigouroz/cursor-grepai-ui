export function groupByFile(items) {
  const order = [];
  const byPath = new Map();
  for (const item of items) {
    if (!byPath.has(item.displayPath)) {
      byPath.set(item.displayPath, []);
      order.push(item.displayPath);
    }
    byPath.get(item.displayPath).push(item);
  }
  return order.map((displayPath) => ({ displayPath, hits: byPath.get(displayPath) }));
}

export function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function countSince(entries, since) {
  const threshold = since instanceof Date ? since.getTime() : Date.parse(since);
  return entries.filter((entry) => Date.parse(entry.createdAt) >= threshold).length;
}

export function selectHomeCategories(items, limit = 5) {
  return items
    .slice()
    .sort((a, b) =>
      b.count - a.count ||
      a.name.localeCompare(b.name, 'zh-CN')
    )
    .slice(0, limit);
}

export function resolveCategory(categories, requested) {
  if (!requested) return '';
  return categories.some((node) => node.id === requested) ? requested : '';
}

export function nextFilterOnCategoryChange() {
  return 'all';
}

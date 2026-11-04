export function resolveCategory(categories, requested) {
  if (!requested) return '';
  return categories.some((node) => node.id === requested) ? requested : '';
}

export function nextFilterOnCategoryChange() {
  return 'all';
}

export function updateCategorySelection(buttons, selectedId) {
  buttons.forEach(function (button) {
    var active = button.getAttribute('data-category') === selectedId;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  return buttons;
}

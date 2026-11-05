export const PET_STATES = Object.freeze([
  'hidden',
  'error',
  'listen',
  'celebrate',
  'carry',
  'sniff',
  'run',
  'walk',
  'idle',
]);

export const PET_FRAMES = Object.freeze({
  idle: 'kt-fox-01_stand@2x.webp',
  listen: 'kt-fox-01_sit@2x.webp',
  walk: 'kt-fox-01_walk@2x.webp',
  run: 'kt-fox-01_run@2x.webp',
  sniff: 'kt-fox-01_sniff@2x.webp',
  carry: 'kt-fox-01_walk@2x.webp',
  celebrate: 'kt-fox-01_turn@2x.webp',
  error: 'kt-fox-01_sit@2x.webp',
});

export const PET_SIZES = Object.freeze(['small', 'medium', 'large']);

export function normalizePetSize(value) {
  return PET_SIZES.includes(value) ? value : 'medium';
}

export function resolvePetState(context = {}) {
  if (context.collapsed) return 'hidden';
  if (context.error) return 'error';
  if (context.typing) return 'listen';
  if (context.celebrating) return 'celebrate';
  if ((context.pendingCount || 0) > 0 && context.hintAllowed) return 'carry';
  if (context.requesting) return 'sniff';
  if (context.navigating) return 'run';
  if (context.ready) return 'walk';
  return 'idle';
}

export function canShowHint({
  now,
  lastShownAt = 0,
  dismissedKeys = [],
  key,
  typing = false,
  cooldownMs = 45_000,
}) {
  if (typing || dismissedKeys.includes(key)) return false;
  return now - lastShownAt >= cooldownMs;
}

export function rememberDismissedHint(dismissedKeys, key) {
  if (!key || dismissedKeys.includes(key)) return dismissedKeys.slice();
  return dismissedKeys.concat(key);
}

export function clampPetPosition({
  left,
  top,
  width,
  height,
  viewportWidth,
  viewportHeight,
  margin = 8,
  bottomInset = 0,
}) {
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const maxTop = Math.max(margin, viewportHeight - height - margin - bottomInset);
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}

export function positionPetForSize({
  left,
  top,
  newWidth,
  newHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
  bottomInset = 0,
}) {
  return clampPetPosition({
    left,
    top,
    width: newWidth,
    height: newHeight,
    viewportWidth,
    viewportHeight,
    margin,
    bottomInset,
  });
}

export function snapPetToSide({
  left,
  width,
  viewportWidth,
  margin = 12,
}) {
  const leftEdge = margin;
  const rightEdge = Math.max(margin, viewportWidth - width - margin);
  const center = viewportWidth / 2;
  return left < center ? leftEdge : rightEdge;
}

export function resolveAssetFailure() {
  return 'placeholder';
}

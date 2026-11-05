import {
  PET_FRAMES,
  resolvePetState,
  canShowHint,
  rememberDismissedHint,
  clampPetPosition,
  normalizePetSize,
  positionPetForSize,
  snapPetToSide,
  resolveAssetFailure,
} from './pet/pet-core.mjs';

const MOTION = 'knowtree.pet.motion.v1';
const POSITION = 'knowtree.pet.position.v1';
const CELEBRATE = 'knowtree.pet.celebrate.v1';
const HINT_SHOWN = 'knowtree.pet.hintShown.v1';
const HINT_DISMISSED = 'knowtree.pet.hintDismissed.v1';
const SIZE = 'knowtree.pet.size.v1';

function readFlag(key, fallback = false) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // The page remains usable when storage is blocked.
  }
}

function readNumber(key, fallback = 0) {
  try {
    return Number(localStorage.getItem(key) || fallback);
  } catch {
    return fallback;
  }
}

function readPosition() {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION) || 'null');
    if (!parsed || !Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

function writePosition(position) {
  try {
    localStorage.setItem(POSITION, JSON.stringify(position));
  } catch {
    // Position remains active for the current page when storage is blocked.
  }
}

function markHintShown() {
  try {
    localStorage.setItem(HINT_SHOWN, String(Date.now()));
  } catch {
    // The hint still works for this page visit.
  }
}

function readDismissedHints() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(HINT_DISMISSED) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dismissHint(key) {
  try {
    sessionStorage.setItem(
      HINT_DISMISSED,
      JSON.stringify(rememberDismissedHint(readDismissedHints(), key)),
    );
  } catch {
    // The current page remains usable when session storage is blocked.
  }
}

function consumeCelebration() {
  try {
    const value = sessionStorage.getItem(CELEBRATE);
    sessionStorage.removeItem(CELEBRATE);
    return value === 'capture' || value === 'review';
  } catch {
    return false;
  }
}

const existingMount = document.querySelector('[data-pet-mount]');
const mount = existingMount || document.createElement('div');
mount.className = 'pet-mount';
mount.dataset.petMount = '';
if (!existingMount) document.body.appendChild(mount);

mount.innerHTML =
  '<button class="pet-hit" type="button" aria-label="打开小黑狐快捷入口" aria-haspopup="true" aria-expanded="false" aria-controls="petMenu">' +
    '<img class="pet-frame" alt="" width="768" height="676" />' +
  '</button>' +
  '<div class="pet-menu" id="petMenu" role="dialog" aria-label="小黑狐快捷入口" hidden>' +
    '<a data-pet-action="capture" href="capture.html">记一条</a>' +
    '<a data-pet-action="inbox" href="inbox.html" hidden>处理待归类</a>' +
    '<a data-pet-action="review" href="review.html">看看今天的回顾</a>' +
    '<button class="pet-menu__button" type="button" data-pet-reset>回到默认位置</button>' +
  '</div>' +
  '<div class="pet-bubble" role="status" aria-live="polite" hidden>' +
    '<span class="pet-bubble__text"></span>' +
    '<button class="pet-bubble__close" type="button" aria-label="关闭提示">知道了</button>' +
  '</div>';

const button = mount.querySelector('.pet-hit');
const image = mount.querySelector('.pet-frame');
const bubble = mount.querySelector('.pet-bubble');
const bubbleText = mount.querySelector('.pet-bubble__text');
const menu = mount.querySelector('.pet-menu');
const menuInbox = menu.querySelector('[data-pet-action="inbox"]');
let typing = false;
let requesting = false;
let reduced = readFlag(MOTION) ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let dragState = null;
let suppressClick = false;
let assetFailed = false;
let petSize = normalizePetSize(readPreferenceString(SIZE, 'medium'));

function readPreferenceString(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function viewportBounds() {
  const viewport = window.visualViewport;
  const layoutWidth = document.documentElement?.clientWidth || window.innerWidth;
  return {
    width: Math.max(1, Math.min(layoutWidth, viewport?.width || layoutWidth)),
    height: Math.max(1, Math.min(window.innerHeight, viewport?.height || window.innerHeight)),
    bottomInset: window.innerWidth < 768 ? 76 : 12,
  };
}

function applySize(value) {
  petSize = normalizePetSize(value);
  mount.dataset.size = petSize;
}

function applyPosition(position, persist = false) {
  const rect = mount.getBoundingClientRect();
  const viewport = viewportBounds();
  const clamped = clampPetPosition({
    left: position.left,
    top: position.top,
    width: rect.width || 104,
    height: rect.height || 118,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    bottomInset: viewport.bottomInset,
  });
  mount.style.left = clamped.left + 'px';
  mount.style.top = clamped.top + 'px';
  mount.style.right = 'auto';
  mount.style.bottom = 'auto';
  mount.dataset.horizontal = clamped.left < viewport.width / 2 ? 'left' : 'right';
  mount.dataset.vertical = clamped.top < viewport.height / 2 ? 'top' : 'bottom';
  if (persist) writePosition(clamped);
  return clamped;
}

function restorePosition() {
  const saved = readPosition();
  if (saved) applyPosition(saved);
}

function resetPosition() {
  try {
    localStorage.removeItem(POSITION);
  } catch {
    // Default positioning still applies for this page.
  }
  mount.style.removeProperty('left');
  mount.style.removeProperty('top');
  mount.style.removeProperty('right');
  mount.style.removeProperty('bottom');
  delete mount.dataset.horizontal;
  delete mount.dataset.vertical;
  closeMenu(false);
}

function applySizeAndReposition(value) {
  const before = mount.getBoundingClientRect();
  applySize(value);
  const after = mount.getBoundingClientRect();
  const viewport = viewportBounds();
  const next = positionPetForSize({
    left: Number.isFinite(before.left) ? before.left : after.left,
    top: Number.isFinite(before.top) ? before.top : after.top,
    oldWidth: before.width,
    oldHeight: before.height,
    newWidth: after.width,
    newHeight: after.height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    bottomInset: viewport.bottomInset,
  });
  applyPosition(next, Boolean(mount.style.left || mount.style.top));
}

function moveByKeyboard(deltaX, deltaY) {
  const rect = mount.getBoundingClientRect();
  applyPosition({ left: rect.left + deltaX, top: rect.top + deltaY }, true);
}

image.addEventListener('error', () => {
  assetFailed = true;
  mount.dataset.asset = resolveAssetFailure();
  image.hidden = true;
});
image.addEventListener('load', () => {
  assetFailed = false;
  delete mount.dataset.asset;
  image.hidden = false;
});

function pendingCount() {
  if (!window.KT || typeof window.KT.inbox !== 'function') return 0;
  const box = window.KT.inbox();
  return box.pending.length + box.dups.length;
}

function renderState(state) {
  mount.dataset.state = state;
  mount.dataset.motion = reduced ? 'reduce' : 'full';
  mount.hidden = state === 'hidden';
  if (!assetFailed) {
    const nextSource = new URL(
      './pet/' + (PET_FRAMES[state] || PET_FRAMES.idle),
      import.meta.url,
    ).href;
    if (image.src !== nextSource) image.src = nextSource;
  }
  image.alt = state === 'hidden' ? '' : '知树小黑狐';
  button.setAttribute(
    'aria-label',
    state === 'carry' ? '有内容待整理，打开小黑狐快捷入口' : '打开小黑狐快捷入口'
  );
  bubble.hidden = state !== 'carry';
  if (state === 'hidden') closeMenu(false);
}

function refresh(extra = {}) {
  return renderState(resolvePetState({
    typing,
    requesting,
    pendingCount: pendingCount(),
    hintAllowed: canShowHint({
      now: Date.now(),
      lastShownAt: readNumber(HINT_SHOWN),
      dismissedKeys: readDismissedHints(),
      key: 'inbox',
      typing,
    }),
    ready: true,
    ...extra,
  }));
}

function setState(requested) {
  if (typing && requested !== 'error') return renderState('listen');
  renderState(PET_FRAMES[requested] ? requested : 'idle');
}

function chooseDestination() {
  return pendingCount() > 0 ? 'inbox.html' : 'capture.html';
}

function navigateFromPet() {
  location.href = chooseDestination();
}

function menuLinks() {
  return Array.from(menu.querySelectorAll('a')).filter((link) => !link.hidden);
}

function openMenu() {
  menuInbox.hidden = pendingCount() <= 0;
  bubble.hidden = true;
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  setState(pendingCount() > 0 ? 'carry' : 'idle');
  const first = menuLinks()[0];
  if (first) first.focus();
}

function closeMenu(returnFocus = false) {
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (returnFocus) button.focus();
}

function toggleMenu() {
  if (menu.hidden) openMenu();
  else closeMenu(false);
}

function showInboxHint() {
  if (pendingCount() <= 0 || typing) return;
  if (!canShowHint({
    now: Date.now(),
    lastShownAt: readNumber(HINT_SHOWN),
    dismissedKeys: readDismissedHints(),
    key: 'inbox',
    typing,
  })) return;
  bubbleText.textContent = '有几片叶子还没归位，要我带你去看看吗？';
  markHintShown();
  renderState('carry');
}

button.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const rect = mount.getBoundingClientRect();
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    moved: false,
  };
  button.setPointerCapture?.(event.pointerId);
  mount.classList.add('is-dragging');
});

document.addEventListener('pointermove', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const deltaX = event.clientX - dragState.startX;
  const deltaY = event.clientY - dragState.startY;
  if (!dragState.moved && Math.hypot(deltaX, deltaY) < 8) return;
  dragState.moved = true;
  applyPosition({
    left: dragState.left + deltaX,
    top: dragState.top + deltaY,
  });
  event.preventDefault();
});

function finishDrag(event, interrupted = false) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const moved = dragState.moved;
  const rect = mount.getBoundingClientRect();
  dragState = null;
  mount.classList.remove('is-dragging');
  if (moved) {
    const viewport = viewportBounds();
    const snappedLeft = snapPetToSide({
      left: rect.left,
      width: rect.width,
      viewportWidth: viewport.width,
    });
    applyPosition({ left: snappedLeft, top: rect.top }, true);
    if (!interrupted) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 300);
    }
  }
}

document.addEventListener('pointerup', (event) => finishDrag(event));
document.addEventListener('pointercancel', (event) => finishDrag(event, true));
button.addEventListener('lostpointercapture', (event) => finishDrag(event, true));

button.addEventListener('click', (event) => {
  if (suppressClick && event.detail > 0) {
    event.preventDefault();
    return;
  }
  toggleMenu();
});

button.addEventListener('keydown', (event) => {
  const distance = event.shiftKey ? 48 : 16;
  const movement = {
    ArrowLeft: [-distance, 0],
    ArrowRight: [distance, 0],
    ArrowUp: [0, -distance],
    ArrowDown: [0, distance],
  }[event.key];
  if (!movement) return;
  event.preventDefault();
  moveByKeyboard(movement[0], movement[1]);
});
bubble.addEventListener('click', (event) => {
  event.stopPropagation();
  navigateFromPet();
});
mount.querySelector('.pet-bubble__close').addEventListener('click', (event) => {
  event.stopPropagation();
  bubble.hidden = true;
  dismissHint('inbox');
  markHintShown();
  refresh({ ready: false });
});

menu.addEventListener('click', (event) => {
  if (event.target.closest('[data-pet-reset]')) {
    resetPosition();
    window.UI?.toast('小黑狐已回到默认位置');
    return;
  }
  if (event.target.closest('a')) closeMenu(false);
});

document.addEventListener('pointerdown', (event) => {
  if (menu.hidden) return;
  if (!menu.contains(event.target) && !button.contains(event.target)) {
    closeMenu(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.hidden) {
    event.preventDefault();
    closeMenu(true);
  }
});

document.addEventListener('knowtree:input-focus', () => {
  typing = true;
  refresh();
});
document.addEventListener('knowtree:input-blur', () => {
  typing = false;
  refresh({ ready: false });
});
document.addEventListener('knowtree:data-ready', () => {
  refresh();
  showInboxHint();
  if (mount.dataset.state !== 'carry') {
    setTimeout(() => refresh({ ready: false }), 4400);
  }
});
document.addEventListener('knowtree:request-start', (event) => {
  if (event.detail.method === 'GET') return;
  requesting = true;
  refresh();
});
document.addEventListener('knowtree:request-success', (event) => {
  requesting = false;
  if (!['capture', 'review'].includes(event.detail.scope)) {
    refresh({ ready: false });
    return;
  }
  setState('celebrate');
  setTimeout(() => refresh({ ready: false }), 1000);
});
document.addEventListener('knowtree:request-error', () => {
  requesting = false;
  setState('error');
});
document.addEventListener('knowtree:pet-motion', (event) => {
  reduced = Boolean(event.detail.reduced);
  renderState(mount.dataset.state || 'idle');
});
document.addEventListener('knowtree:pet-size', (event) => {
  applySizeAndReposition(event.detail.size);
});
document.addEventListener('knowtree:pet-reset', resetPosition);

window.KTPet = {
  setState,
};

if (document.body.dataset.petMode === 'focus') {
  setState('listen');
} else {
  refresh();
  showInboxHint();
  if (mount.dataset.state !== 'carry') {
    setTimeout(() => refresh({ ready: false }), 4400);
  }
}

if (consumeCelebration()) {
  setTimeout(() => {
    setState('celebrate');
    setTimeout(() => refresh({ ready: false }), 1000);
  }, 240);
}

applySize(petSize);
restorePosition();
window.addEventListener('resize', () => {
  if (!mount.style.left || !mount.style.top) return;
  const rect = mount.getBoundingClientRect();
  applyPosition({ left: rect.left, top: rect.top }, true);
});
window.visualViewport?.addEventListener('resize', () => {
  if (!mount.style.left || !mount.style.top) return;
  const rect = mount.getBoundingClientRect();
  applyPosition({ left: rect.left, top: rect.top }, true);
});
window.visualViewport?.addEventListener('scroll', () => {
  if (!mount.style.left || !mount.style.top) return;
  const rect = mount.getBoundingClientRect();
  applyPosition({ left: rect.left, top: rect.top });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && dragState) finishDrag({ pointerId: dragState.pointerId }, true);
});

import { PET_FRAMES, resolvePetState, canShowHint } from './pet/pet-core.mjs';

const COLLAPSED = 'knowtree.pet.collapsed.v1';
const MOTION = 'knowtree.pet.motion.v1';
const CELEBRATE = 'knowtree.pet.celebrate.v1';
const HINT_SHOWN = 'knowtree.pet.hintShown.v1';

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

function markHintShown() {
  try {
    localStorage.setItem(HINT_SHOWN, String(Date.now()));
  } catch {
    // The hint still works for this page visit.
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
  '<button class="pet-hit" type="button" aria-label="打开小黑狐快捷入口">' +
    '<img class="pet-frame" alt="" width="768" height="676" />' +
  '</button>' +
  '<div class="pet-bubble" role="status" aria-live="polite" hidden>' +
    '<span class="pet-bubble__text"></span>' +
    '<button class="pet-bubble__close" type="button" aria-label="关闭提示">知道了</button>' +
  '</div>' +
  '<button class="pet-collapse" type="button" aria-label="收起小黑狐">×</button>';

const button = mount.querySelector('.pet-hit');
const image = mount.querySelector('.pet-frame');
const bubble = mount.querySelector('.pet-bubble');
const bubbleText = mount.querySelector('.pet-bubble__text');
let collapsed = readFlag(COLLAPSED);
let typing = false;
let requesting = false;
let reduced = readFlag(MOTION) ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

image.addEventListener('error', () => {
  mount.hidden = true;
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
  image.src = '/assets/pet/' + (PET_FRAMES[state] || PET_FRAMES.idle);
  image.alt = state === 'hidden' ? '' : '知树小黑狐';
  button.setAttribute(
    'aria-label',
    state === 'carry' ? '有内容待整理，打开小黑狐快捷入口' : '打开小黑狐快捷入口'
  );
  bubble.hidden = state !== 'carry';
}

function refresh(extra = {}) {
  return renderState(resolvePetState({
    collapsed,
    typing,
    requesting,
    pendingCount: pendingCount(),
    hintAllowed: !collapsed && canShowHint({
      now: Date.now(),
      lastShownAt: readNumber(HINT_SHOWN),
      dismissedKeys: [],
      key: 'inbox',
      typing,
    }),
    ready: true,
    ...extra,
  }));
}

function setState(requested) {
  if (collapsed) return renderState('hidden');
  if (typing && requested !== 'error') return renderState('listen');
  renderState(PET_FRAMES[requested] ? requested : 'idle');
}

function chooseDestination() {
  return pendingCount() > 0 ? 'inbox.html' : 'capture.html';
}

function navigateFromPet() {
  location.href = chooseDestination();
}

function showInboxHint() {
  if (pendingCount() <= 0 || typing || collapsed) return;
  if (!canShowHint({
    now: Date.now(),
    lastShownAt: readNumber(HINT_SHOWN),
    dismissedKeys: [],
    key: 'inbox',
    typing,
  })) return;
  bubbleText.textContent = '有几片叶子还没归位，要我带你去看看吗？';
  markHintShown();
  renderState('carry');
}

button.addEventListener('click', navigateFromPet);
bubble.addEventListener('click', navigateFromPet);
mount.querySelector('.pet-bubble__close').addEventListener('click', (event) => {
  event.stopPropagation();
  bubble.hidden = true;
  markHintShown();
  refresh({ ready: false });
});

mount.querySelector('.pet-collapse').addEventListener('click', () => {
  collapsed = true;
  writeFlag(COLLAPSED, true);
  renderState('hidden');
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
document.addEventListener('knowtree:pet-visibility', (event) => {
  collapsed = !event.detail.visible;
  renderState(collapsed ? 'hidden' : 'idle');
});
document.addEventListener('knowtree:pet-motion', (event) => {
  reduced = Boolean(event.detail.reduced);
  renderState(mount.dataset.state || 'idle');
});

window.KTPet = {
  setState,
  collapse() {
    collapsed = true;
    writeFlag(COLLAPSED, true);
    renderState('hidden');
  },
  expand() {
    collapsed = false;
    writeFlag(COLLAPSED, false);
    refresh();
  },
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

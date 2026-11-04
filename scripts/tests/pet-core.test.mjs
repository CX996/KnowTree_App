import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PET_FRAMES,
  PET_STATES,
  resolvePetState,
  canShowHint,
  rememberDismissedHint,
} from '../../apps/web/assets/pet/pet-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const petDir = path.join(root, 'apps/web/assets/pet');

test('state priority handles hide, error, typing and action states', () => {
  assert.equal(resolvePetState({ collapsed: true, error: true }), 'hidden');
  assert.equal(resolvePetState({ error: true, typing: true }), 'error');
  assert.equal(resolvePetState({ typing: true, pendingCount: 2 }), 'listen');
  assert.equal(resolvePetState({ celebrating: true }), 'celebrate');
  assert.equal(resolvePetState({ pendingCount: 2, hintAllowed: true }), 'carry');
  assert.equal(resolvePetState({ requesting: true }), 'sniff');
  assert.equal(resolvePetState({ navigating: true }), 'run');
  assert.equal(resolvePetState({ ready: true }), 'walk');
  assert.equal(resolvePetState({}), 'idle');
});

test('hint cooldown, dismissal and typing are enforced', () => {
  const base = { now: 100_000, lastShownAt: 0, dismissedKeys: [], key: 'inbox' };
  assert.equal(canShowHint(base), true);
  assert.equal(canShowHint({ ...base, typing: true }), false);
  assert.equal(canShowHint({ ...base, dismissedKeys: ['inbox'] }), false);
  assert.equal(canShowHint({ ...base, lastShownAt: 70_000 }), false);
  assert.equal(canShowHint({ ...base, lastShownAt: 50_000 }), true);
  assert.deepEqual(rememberDismissedHint([], 'inbox'), ['inbox']);
  assert.deepEqual(rememberDismissedHint(['inbox'], 'inbox'), ['inbox']);
});

test('all animated UI states have an approved transparent frame', () => {
  assert.deepEqual([...PET_STATES], [
    'hidden', 'error', 'listen', 'celebrate', 'carry',
    'sniff', 'run', 'walk', 'idle',
  ]);
  assert.deepEqual(Object.keys(PET_FRAMES).sort(), [
    'carry', 'celebrate', 'error', 'idle', 'listen', 'run', 'sniff', 'walk',
  ]);
});

test('pet WebP frames stay under 250 KB', async () => {
  const files = (await readdir(petDir)).filter((name) => name.endsWith('.webp'));
  assert.equal(files.length, 6);
  assert.deepEqual(
    Array.from(new Set(Object.values(PET_FRAMES))).sort(),
    files.slice().sort(),
    'every mapped frame must exist in apps/web/assets/pet',
  );
  let total = 0;
  for (const file of files) total += (await stat(path.join(petDir, file))).size;
  assert.ok(total <= 250 * 1024, `pet assets are ${total} bytes`);
});

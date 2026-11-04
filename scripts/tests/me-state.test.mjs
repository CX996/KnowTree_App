import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nextSwitchState,
  petPreferenceUpdate,
  removeAuthenticatedChrome,
} from '../../apps/web/assets/me-state.mjs';

test('switch state toggles aria-checked deterministically', () => {
  assert.deepEqual(nextSwitchState('false'), { on: true, ariaChecked: 'true' });
  assert.deepEqual(nextSwitchState('true'), { on: false, ariaChecked: 'false' });
});

test('pet preferences map to the approved local storage keys', () => {
  assert.deepEqual(
    petPreferenceUpdate('visibility', false),
    { key: 'knowtree.pet.collapsed.v1', value: '1' },
  );
  assert.deepEqual(
    petPreferenceUpdate('motion', true),
    { key: 'knowtree.pet.motion.v1', value: '1' },
  );
  assert.throws(() => petPreferenceUpdate('unknown', true), /Unsupported/);
});

test('logout cleanup removes shell and pet nodes and clears body state', () => {
  const removed = [];
  const nodes = ['rail', 'pet'].map((name) => ({
    name,
    remove() { removed.push(name); },
  }));
  const bodyClasses = new Set(['has-app-shell', 'other']);
  const root = {
    body: { classList: { remove(value) { bodyClasses.delete(value); } } },
    querySelectorAll() { return nodes; },
  };

  const result = removeAuthenticatedChrome(root);
  assert.deepEqual(result, nodes);
  assert.deepEqual(removed, ['rail', 'pet']);
  assert.equal(bodyClasses.has('has-app-shell'), false);
  assert.equal(bodyClasses.has('other'), true);
});

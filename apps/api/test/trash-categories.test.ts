import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isActiveEntry,
  isTrashExpired,
  restoreCategoryId,
  validateCategoryDelete,
} from '../src/services/trash.js';

test('category deletion is blocked while knowledge exists', () => {
  assert.deepEqual(validateCategoryDelete({ entryCount: 1, childCount: 0 }), {
    ok: false,
    code: 'CONFLICT',
  });
});

test('category deletion is blocked while child categories exist', () => {
  assert.deepEqual(validateCategoryDelete({ entryCount: 0, childCount: 1 }), {
    ok: false,
    code: 'CONFLICT',
  });
});

test('empty categories may be deleted', () => {
  assert.deepEqual(validateCategoryDelete({ entryCount: 0, childCount: 0 }), {
    ok: true,
    code: null,
  });
});

test('deleted entries never pass the active visibility predicate', () => {
  assert.equal(isActiveEntry({ deleted_at: null }), true);
  assert.equal(isActiveEntry({ deleted_at: '2026-11-05T00:00:00Z' }), false);
});

test('trash expires after thirty complete days', () => {
  const now = new Date('2026-12-05T08:00:01.000Z');
  assert.equal(isTrashExpired('2026-11-05T08:00:00.000Z', now), true);
  assert.equal(isTrashExpired('2026-11-06T08:00:00.000Z', now), false);
});

test('restore keeps the category only while it is active', () => {
  assert.equal(restoreCategoryId('category-1', true), 'category-1');
  assert.equal(restoreCategoryId('category-1', false), null);
  assert.equal(restoreCategoryId(null, true), null);
});

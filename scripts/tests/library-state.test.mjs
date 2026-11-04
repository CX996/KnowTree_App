import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCategory,
  nextFilterOnCategoryChange,
} from '../../apps/web/assets/library-state.mjs';

const categories = [
  { id: 'ai', name: 'AI 学习' },
  { id: 'product', name: '产品思考' },
];

test('resolveCategory keeps a known requested id', () => {
  assert.equal(resolveCategory(categories, 'product'), 'product');
});

test('resolveCategory rejects a missing or empty id', () => {
  assert.equal(resolveCategory(categories, 'missing'), '');
  assert.equal(resolveCategory([], 'ai'), '');
  assert.equal(resolveCategory(categories, ''), '');
});

test('category change always resets the status filter', () => {
  assert.equal(nextFilterOnCategoryChange(), 'all');
});

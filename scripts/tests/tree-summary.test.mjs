import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectHomeCategories,
  countSince,
  startOfMonth,
} from '../../apps/web/assets/tree-summary.mjs';

test('selects five highest category counts without deleting the rest', () => {
  const nodes = Array.from({ length: 9 }, (_, index) => ({
    id: `n${index}`,
    name: `分类${index}`,
    count: index,
  }));

  assert.deepEqual(
    selectHomeCategories(nodes, 5).map((node) => node.id),
    ['n8', 'n7', 'n6', 'n5', 'n4'],
  );
  assert.equal(nodes.length, 9);
});

test('empty categories produce an empty selection', () => {
  assert.deepEqual(selectHomeCategories([], 5), []);
});

test('monthly leaves use createdAt only', () => {
  const now = new Date(2026, 10, 4, 12, 0, 0);
  const entries = [
    { createdAt: new Date(2026, 10, 1, 0, 0, 0).toISOString() },
    { createdAt: new Date(2026, 9, 31, 23, 59, 59).toISOString() },
    { createdAt: new Date(2026, 10, 3, 0, 0, 0).toISOString() },
  ];

  assert.equal(countSince(entries, startOfMonth(now)), 2);
  assert.equal(countSince([], startOfMonth(now)), 0);
});

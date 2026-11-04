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

test('monthly leaves use createdAt only', () => {
  const now = new Date('2026-11-04T12:00:00+08:00');
  const entries = [
    { createdAt: '2026-11-01T00:00:00+08:00' },
    { createdAt: '2026-10-31T23:59:59+08:00' },
    { createdAt: '2026-11-03T00:00:00+08:00' },
  ];

  assert.equal(countSince(entries, startOfMonth(now)), 2);
  assert.equal(countSince([], startOfMonth(now)), 0);
});

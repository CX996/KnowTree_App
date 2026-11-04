import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectHomeCategories,
  countSince,
  startOfMonth,
} from '../../apps/web/assets/tree-summary.mjs';
import { renderKnowledgeTree } from '../../apps/web/assets/tree-view.mjs';

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

test('knowledge tree renders a natural trunk, branches and leaf categories', () => {
  const svg = renderKnowledgeTree([
    { id: 'ai', name: 'AI 学习', count: 12 },
    { id: 'product', name: '产品思考', count: 7 },
  ]);

  assert.match(svg, /class="tree-trunk"/);
  assert.match(svg, /class="tree-branch/);
  assert.match(svg, /class="tree-foliage/);
  assert.match(svg, /class="tree-category"/);
  assert.match(svg, /data-node="ai"/);
  assert.match(svg, /AI 学习/);
  assert.doesNotMatch(svg, /class="tree-node"|<circle cx="180"/);
});

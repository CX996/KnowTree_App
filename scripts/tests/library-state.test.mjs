import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCategory,
  nextFilterOnCategoryChange,
  updateCategorySelection,
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

function fakeCategoryButton(id) {
  var classes = new Set();
  var attributes = {
    'data-category': id,
    'aria-pressed': 'false',
  };
  return {
    classList: {
      contains: function (name) { return classes.has(name); },
      toggle: function (name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      },
    },
    getAttribute: function (name) { return attributes[name] || null; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
  };
}

test('category selection updates existing buttons in place for focus retention', () => {
  var all = fakeCategoryButton('');
  var ai = fakeCategoryButton('ai');
  var product = fakeCategoryButton('product');
  var buttons = [all, ai, product];

  var returned = updateCategorySelection(buttons, 'product');

  assert.equal(returned, buttons);
  assert.equal(returned[0], all);
  assert.equal(returned[1], ai);
  assert.equal(returned[2], product);
  assert.equal(all.classList.contains('is-active'), false);
  assert.equal(ai.classList.contains('is-active'), false);
  assert.equal(product.classList.contains('is-active'), true);
  assert.equal(all.getAttribute('aria-pressed'), 'false');
  assert.equal(ai.getAttribute('aria-pressed'), 'false');
  assert.equal(product.getAttribute('aria-pressed'), 'true');
});

import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'apps/web');

async function htmlPages() {
  return (await readdir(web)).filter((name) => name.endsWith('.html')).sort();
}

test('every page loads style layers in cascade order', async () => {
  const expected = [
    'assets/styles/tokens.css',
    'assets/styles/base.css',
    'assets/styles/components.css',
    'assets/styles/pages.css',
  ];
  for (const page of await htmlPages()) {
    const html = await readFile(path.join(web, page), 'utf8');
    const positions = expected.map((href) => html.indexOf(href));
    assert.ok(positions.every((position) => position >= 0), `${page} missing style`);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${page} order`);
  }
});

test('design tokens expose the approved palette', async () => {
  const css = (await readFile(path.join(web, 'assets/styles/tokens.css'), 'utf8')).toLowerCase();
  for (const value of ['#10110e', '#e7ddc7', '#c6a15b', '#4d5947', '#d46a5e']) {
    assert.ok(css.includes(value), value);
  }
});

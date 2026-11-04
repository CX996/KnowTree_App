import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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
  for (const value of [
    '#10110e', '#e7ddc7', '#c6a15b', '#4d5947', '#d46a5e',
    '--surface2', '--text2', '--text3', '--gold-ink',
  ]) {
    assert.ok(css.includes(value), value);
  }
});

test('business pages declare active tabs and load the shared shell', async () => {
  const pages = new Map([
    ['index.html', 'tree'], ['library.html', 'lib'], ['detail.html', 'lib'],
    ['inbox.html', 'lib'], ['search.html', 'lib'],
    ['review.html', 'review'], ['me.html', 'me'],
  ]);
  for (const [page, tab] of pages) {
    const html = await readFile(path.join(web, page), 'utf8');
    assert.match(html, new RegExp(`<body[^>]+data-tab="${tab}"`));
    assert.match(html, /assets\/shell\.js/);
    assert.match(html, /assets\/styles\/shell\.css/);
  }
});

test('home is action-first and renders a dynamic tree preview', async () => {
  const html = await readFile(path.join(web, 'index.html'), 'utf8');
  assert.match(html, /data-home-capture/);
  assert.match(html, /id="homeTree"/);
  assert.match(html, /查看全部知识/);
  assert.equal((html.match(/class="tnode"/g) ?? []).length, 0);
  assert.match(html, /tree-summary\.mjs/);
  assert.match(html, /id="treeEmpty"/);
  assert.match(html, /async function boot/);
});

test('knowledge pages use the new shared browsing structure', async () => {
  const library = await readFile(path.join(web, 'library.html'), 'utf8');
  const search = await readFile(path.join(web, 'search.html'), 'utf8');
  const inbox = await readFile(path.join(web, 'inbox.html'), 'utf8');
  assert.match(library, /class="page-head"/);
  assert.match(library, /id="categoryRail"/);
  assert.match(library, /class="filter-scroll"/);
  assert.match(search, /class="search-hero"/);
  assert.match(inbox, /class="page app-page knowledge-page"/);
});

test('library applies URL category only after data load and resets status on category change', async () => {
  const library = await readFile(path.join(web, 'library.html'), 'utf8');
  assert.ok(
    library.indexOf('await KT.load();') < library.indexOf('resolveCategory(KT.NODES, requestedCategory)'),
    'URL category must be validated after KT.load'
  );
  assert.match(library, /filter = nextFilterOnCategoryChange\(\);\s*syncSegments\(\);/);
  assert.match(
    library,
    /updateCategorySelection\(\s*categoryRail\.querySelectorAll\('\[data-category\]'\),\s*selectedCategory\s*\)/
  );
  assert.match(library, /library-state\.mjs/);
});

test('inbox CTA closes its container before main', async () => {
  const inbox = await readFile(path.join(web, 'inbox.html'), 'utf8');
  const start = inbox.indexOf('id="ctaBar"');
  const end = inbox.indexOf('</main>', start);
  assert.ok(start >= 0 && end > start, 'inbox ctaBar/main structure');
  assert.ok(inbox.slice(start, end).includes('</div>'), 'ctaBar must close before main');
});

test('knowledge controls meet the 44px target', async () => {
  const css = await readFile(path.join(web, 'assets/styles/pages.css'), 'utf8');
  assert.match(css, /\.filter-chip\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.status-switch button\s*\{[^}]*min-height:\s*44px/s);
});

test('capture uses focus mode and preserves file and history semantics', async () => {
  const html = await readFile(path.join(web, 'capture.html'), 'utf8');
  assert.match(html, /class="page focus-page"/);
  assert.match(html, /data-pet-mode="focus"/);
  assert.equal(html.includes('assets/shell.js'), false);
  assert.match(html, /id="dropZone"/);
  assert.match(html, /location\.replace\(detailUrl\(card\.id\)\)/);
  assert.match(html, /knowtree:input-focus/);
  assert.match(html, /knowtree:input-blur/);
});

test('reading and review keep controls on paper surfaces', async () => {
  const detail = await readFile(path.join(web, 'detail.html'), 'utf8');
  const review = await readFile(path.join(web, 'review.html'), 'utf8');

  assert.match(detail, /class="reading-column"/);
  assert.match(detail, /class="reading-sheet"/);
  for (const id of ['back', 'main', 'editPane', 'editTitle', 'editSummary', 'editContent', 'preview', 'saveBtn', 'editBtn', 'moveBtn', 'delBtn']) {
    assert.match(detail, new RegExp(`id="${id}"`), `detail missing ${id}`);
  }

  assert.match(review, /class="review-sheet"/);
  assert.match(review, /id="forgot"/);
  assert.match(review, /id="known"/);
  assert.match(review, /查看全文/);
});

test('account exposes pet preferences and auth pages stay pet-free', async () => {
  const me = await readFile(path.join(web, 'me.html'), 'utf8');
  assert.match(me, /id="petEnabled"/);
  assert.match(me, /id="petMotion"/);
  assert.match(me, /class="settings-card"/);
  assert.match(me, /class="switch-row"/);
  assert.match(me, /id="aiSettings"/);

  for (const page of ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html']) {
    const html = await readFile(path.join(web, page), 'utf8');
    assert.match(html, /class="[^"]*auth-layout/);
    assert.match(html, /class="auth-story"/);
    assert.match(html, /class="auth-card/);
    assert.equal(html.includes('assets/shell.js'), false, `${page} must not load shell`);
    assert.equal(html.includes('assets/pet.js'), false, `${page} must not load pet`);
  }
});

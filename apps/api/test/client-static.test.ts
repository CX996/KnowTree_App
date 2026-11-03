import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

test('production HTML has no Coze runtime injection', async () => {
  const files = (await readdir(clientDir)).filter((file) => file.endsWith('.html'));
  for (const file of files) {
    const html = await readFile(path.join(clientDir, file), 'utf8');
    assert.equal(html.includes('lf-cdn.coze.cn'), false, `${file} still loads Coze CDN assets`);
    assert.equal(/<html[^>]*>\s*<script/i.test(html), false, `${file} starts with a script before <head>`);
  }
});

test('browser data layer defaults to the same-origin API base', async () => {
  const api = await readFile(path.join(clientDir, 'assets/api.js'), 'utf8');
  assert.match(api, /DEFAULT_BASE\s*=\s*['"]\/api\/v1['"]/);
  assert.equal(api.includes('knowtree-api-vercel.vercel.app'), false);
});

test('login page does not expose developer API and token fields', async () => {
  const login = await readFile(path.join(clientDir, 'login.html'), 'utf8');
  assert.equal(login.includes('id="apiBase"'), false);
  assert.equal(login.includes('id="tok"'), false);
  assert.equal(login.includes('id="sbKey"'), false);
  assert.match(login, /id="email"/);
  assert.match(login, /id="pwd"/);
  assert.match(login, /requestedNext/);
});

test('production UI exposes only supported core flows', async () => {
  const pages = new Set(await readdir(clientDir));
  assert.equal(pages.has('node.html'), false);

  for (const page of ['index.html', 'library.html', 'detail.html', 'capture.html', 'me.html']) {
    const html = await readFile(path.join(clientDir, page), 'utf8');
    for (const forbidden of ['收藏', '回收站', '重置演示数据', '配置后端', 'node.html?id=']) {
      assert.equal(html.includes(forbidden), false, `${page} still contains ${forbidden}`);
    }
  }

  const index = await readFile(path.join(clientDir, 'index.html'), 'utf8');
  const capture = await readFile(path.join(clientDir, 'capture.html'), 'utf8');
  assert.equal(index.includes('7 个节点 · 9 条知识'), false);
  assert.equal(capture.includes('PPO'), false);
  assert.equal(capture.includes('从笔记导入'), false);
});

test('login uses standard form semantics', async () => {
  const login = await readFile(path.join(clientDir, 'login.html'), 'utf8');
  assert.match(login, /<form[^>]+id="loginForm"/);
  assert.match(login, /<label[^>]+for="email"/);
  assert.match(login, /type="email"/);
  assert.match(login, /autocomplete="current-password"/);
  assert.match(login, /type="submit"/);
});

test('production pages expose one main landmark', async () => {
  const files = (await readdir(clientDir)).filter((file) => file.endsWith('.html'));
  for (const file of files) {
    const html = await readFile(path.join(clientDir, file), 'utf8');
    assert.equal((html.match(/<main\b/g) ?? []).length, 1, `${file} must contain one <main>`);
    assert.equal((html.match(/<\/main>/g) ?? []).length, 1, `${file} must close <main>`);
  }
});

test('core pages expose headings and switch state', async () => {
  for (const file of ['index.html', 'library.html', 'inbox.html', 'review.html', 'search.html', 'me.html']) {
    const html = await readFile(path.join(clientDir, file), 'utf8');
    assert.match(html, /<h1\b/, `${file} must contain a page heading`);
  }
  const me = await readFile(path.join(clientDir, 'me.html'), 'utf8');
  assert.match(me, /role="switch"[^>]+aria-checked="false"/);
});

test('capture page supports document drop and replaces history after success', async () => {
  const capture = await readFile(path.join(clientDir, 'capture.html'), 'utf8');
  assert.match(capture, /type="file"/);
  assert.match(capture, /accept="\.md,\.txt,\.html,\.docx,\.pdf"/);
  assert.match(capture, /id="dropZone"/);
  assert.match(capture, /id="title"/);
  assert.match(capture, /location\.replace\(detailUrl\(card\.id\)\)/);
  assert.equal(capture.includes("UI.go('detail.html?id='"), false);
});

test('detail page exposes safe markdown reading and editing', async () => {
  const detail = await readFile(path.join(clientDir, 'detail.html'), 'utf8');
  assert.match(detail, /type="module"/);
  assert.match(detail, /assets\/markdown\.js/);
  assert.match(detail, /id="editBtn"/);
  assert.match(detail, /id="editPane"/);
  assert.match(detail, /id="preview"/);
  assert.match(detail, /id="saveBtn"/);
});

test('me page exposes ai capability management', async () => {
  const me = await readFile(path.join(clientDir, 'me.html'), 'utf8');
  assert.match(me, /id="aiSettings"/);
  assert.match(me, /id="aiAutoTitle"/);
  assert.match(me, /id="aiAutoSummary"/);
  assert.match(me, /id="aiAutoClassify"/);
  assert.match(me, /id="aiEmbeddings"/);
  assert.match(me, /id="aiTest"/);
});

test('semantic search is disabled when no embedding model is configured', async () => {
  const me = await readFile(path.join(clientDir, 'me.html'), 'utf8');
  assert.match(me, /embeddingAvailable = Boolean\(status\.embeddingModel\)/);
  assert.match(me, /button\.disabled = !configured \|\| !featureAvailable/);
});

test('bottom sheets expose landmark content', async () => {
  const ui = await readFile(path.join(clientDir, 'assets/ui.js'), 'utf8');
  assert.match(ui, /setAttribute\('role', 'region'\)/);
  assert.match(ui, /setAttribute\('aria-modal', 'true'\)/);
});

test('production styles include keyboard, motion and minimum target standards', async () => {
  const css = await readFile(path.join(clientDir, 'assets/app.css'), 'utf8');
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-height:\s*44px/);
  assert.equal(/--text3:\s*#6E6A63/i.test(css), false, '--text3 fails WCAG AA contrast');
});

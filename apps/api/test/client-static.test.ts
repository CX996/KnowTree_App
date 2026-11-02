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

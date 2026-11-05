import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'apps/web');

async function page(name) {
  return readFile(path.join(web, name), 'utf8');
}

test('public registration requires an invitation fragment', async () => {
  const html = await page('register.html');
  assert.match(html, /location\.hash/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /id="inviteForm"/);
  assert.match(html, /readonly/);
  assert.match(html, /account-client\.mjs/);
  assert.doesNotMatch(html, /signUpWithPassword\s*\(/);
});

test('categories page exposes two-level management and safe deletion', async () => {
  const html = await page('categories.html');
  for (const id of ['categoryList', 'addCategory', 'categoryEditor']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-category-action="delete"/);
  assert.match(html, /account-client\.mjs/);
  assert.match(html, /二级/);
});

test('trash page exposes search, restore and permanent delete', async () => {
  const html = await page('trash.html');
  for (const id of ['trashSearch', 'trashList', 'trashEmpty']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-trash-action="restore"/);
  assert.match(html, /data-trash-action="delete"/);
  assert.match(html, /保留 30 天/);
});

test('owner pages expose invitations and redacted diagnostics', async () => {
  const invites = await page('admin-invites.html');
  const errors = await page('admin-errors.html');

  for (const id of ['inviteForm', 'inviteEmail', 'inviteList', 'inviteResult']) {
    assert.match(invites, new RegExp(`id="${id}"`));
  }
  assert.match(invites, /data-invite-action="copy"/);
  assert.match(invites, /data-invite-action="revoke"/);

  for (const id of ['errorSearch', 'errorList', 'errorEmpty']) {
    assert.match(errors, new RegExp(`id="${id}"`));
  }
  assert.match(errors, /脱敏/);
  assert.doesNotMatch(errors, /request body|stack trace/i);
});

test('login checks account deletion before normal navigation', async () => {
  const html = await page('login.html');
  assert.match(html, /getAccount/);
  assert.match(html, /recover-account\.html/);
});

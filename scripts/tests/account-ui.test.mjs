import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'apps/web');

test('account center exposes identity, password, sessions and deletion separately', async () => {
  const html = await readFile(path.join(web, 'me.html'), 'utf8');
  for (const id of [
    'accountIdentity',
    'accountEmail',
    'accountRole',
    'accountJoined',
    'emailVerification',
    'sessionCurrent',
    'nickname',
    'changePassword',
    'logoutCurrent',
    'logoutAll',
    'categoriesLink',
    'trashLink',
    'deletionRequest',
    'deleteAccount',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `me.html missing ${id}`);
  }
  assert.doesNotMatch(html, /id="logout"[^>]*>注销账号/);
  assert.doesNotMatch(html, /KT\.wipe\(/);
});

test('account center uses the shared account client and safe field errors', async () => {
  const html = await readFile(path.join(web, 'me.html'), 'utf8');
  assert.match(html, /account-client\.mjs/);
  assert.match(html, /error-view\.mjs/);
  assert.match(html, /data-field-error/);
  assert.match(html, /currentPassword/);
  assert.match(html, /confirmEmail/);
  assert.match(html, /acknowledged/);
});

test('recover page is recovery-only and does not load app chrome or pet', async () => {
  const html = await readFile(path.join(web, 'recover-account.html'), 'utf8');
  assert.match(html, /id="deletionDate"/);
  assert.match(html, /id="cancelDeletionForm"/);
  assert.match(html, /id="recoveryExport"/);
  assert.equal(html.includes('assets/shell.js'), false);
  assert.equal(html.includes('assets/pet.js'), false);
  assert.equal(html.includes('assets/styles/pet.css'), false);
});

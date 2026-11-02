import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const required = [
  'apps/web/index.html',
  'apps/api/src/app.ts',
  'docs/product/v0.4-产品方案.html',
  'docs/api/后端接口契约.md',
  'docs/design/DESIGN-设计契约.md',
  'design/references',
  'tools/mock/server.js',
  'supabase/migrations/20261102055337_init_knowtree.sql',
];
const legacy = [
  'client',
  'server',
  '01-Docs',
  '02-Design',
  '03-Code',
  '04-Archive',
  'api',
];

test('repository uses the standard monorepo layout', () => {
  for (const relative of required) {
    assert.equal(existsSync(path.join(root, relative)), true, `missing ${relative}`);
  }
});

test('legacy numbered and duplicate source directories are removed', () => {
  for (const relative of legacy) {
    assert.equal(existsSync(path.join(root, relative)), false, `legacy path remains: ${relative}`);
  }
});

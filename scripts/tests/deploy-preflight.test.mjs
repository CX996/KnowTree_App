import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runPreflight } from '../deploy-preflight.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_real',
  SUPABASE_SECRET_KEY: 'sb_secret_real',
  CRON_SECRET: 'a-long-random-cron-secret',
};

test('preflight accepts a complete deployment configuration', () => {
  const result = runPreflight({ root, env: validEnv });
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('preflight reports missing and placeholder secrets', () => {
  const result = runPreflight({
    root,
    env: {
      SUPABASE_URL: 'not-a-url',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xxx',
      SUPABASE_SECRET_KEY: '',
      CRON_SECRET: 'replace-with-a-long-random-value',
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /SUPABASE_URL/);
  assert.match(result.errors.join('\n'), /SUPABASE_SECRET_KEY/);
  assert.match(result.errors.join('\n'), /CRON_SECRET/);
});

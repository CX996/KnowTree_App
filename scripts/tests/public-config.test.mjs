import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const publicConfigPath = new URL('../public-config.mjs', import.meta.url);

test('generated public config contains only browser-safe Supabase values', async () => {
  const { buildPublicConfig } = await import(publicConfigPath);
  const config = buildPublicConfig({
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public',
    SUPABASE_SECRET_KEY: 'sb_secret_must_not_leak',
    OPENAI_API_KEY: 'provider-secret',
  });

  assert.deepEqual(config, {
    supabaseUrl: 'https://project.supabase.co',
    supabaseKey: 'sb_publishable_public',
  });
});

test('public config file is generated in the static output directory', async (t) => {
  const { writePublicConfig } = await import(publicConfigPath);
  const root = await mkdtemp(path.join(os.tmpdir(), 'knowtree-public-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const wrote = await writePublicConfig(root, {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public',
  });
  const written = JSON.parse(
    await readFile(path.join(root, 'apps/web/public-config.json'), 'utf8'),
  );

  assert.equal(wrote, true);
  assert.deepEqual(written, {
    supabaseUrl: 'https://project.supabase.co',
    supabaseKey: 'sb_publishable_public',
  });
});

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function sourceText(dir: string): Promise<string> {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  const text = await Promise.all(
    files
      .filter((entry) => entry.isFile() && /\.(?:ts|js|json|html)$/.test(entry.name))
      .map((entry) => readFile(path.join(entry.parentPath, entry.name), 'utf8')),
  );
  return text.join('\n');
}

test('production source has no Coze or direct Postgres coupling', async () => {
  const production = [
    await sourceText(path.join(root, 'server/src')),
    await sourceText(path.join(root, 'client')),
    await readFile(path.join(root, 'server/package.json'), 'utf8'),
  ].join('\n');

  assert.equal(production.includes('coze-coding-dev-sdk'), false);
  assert.equal(production.includes('coze_workload_identity'), false);
  assert.equal(production.includes('COZE_SUPABASE_'), false);
  assert.equal(production.includes('PGDATABASE_URL'), false);
});

test('serverless app has no persistent listener or timer', async () => {
  const app = await readFile(path.join(root, 'server/src/app.ts'), 'utf8');

  assert.equal(app.includes('.listen('), false);
  assert.equal(app.includes('setInterval('), false);
  assert.equal(app.includes('runDueJobs'), true);
  assert.equal(app.includes('/api/v1/cron/jobs'), true);
});

test('Supabase migration enables RLS and installs vector and queue functions', async () => {
  const migrationDir = path.join(root, 'supabase/migrations');
  const migrations = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql'));
  const sql = (await Promise.all(
    migrations.map((file) => readFile(path.join(migrationDir, file), 'utf8')),
  )).join('\n');

  assert.equal((sql.match(/enable row level security/g) ?? []).length, 8);
  assert.match(sql, /create(?: or replace)? function public\.match_entries/i);
  assert.match(sql, /create(?: or replace)? function public\.claim_due_jobs/i);
  assert.match(sql, /create policy entries_update_own/i);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
});

test('local and hosted auth are configured for pre-created accounts', async () => {
  const config = await readFile(path.join(root, 'supabase/config.toml'), 'utf8');
  assert.match(config, /auto_expose_new_tables = false/);
  assert.match(config, /\[auth\][\s\S]*?enable_signup = false/);
  assert.match(config, /\[auth\.email\][\s\S]*?enable_signup = false/);
});

test('Vercel uses the root Express entrypoint and a protected daily cron', async () => {
  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8')) as {
    functions?: Record<string, { includeFiles?: string; maxDuration?: number }>;
    crons?: Array<{ path: string; schedule: string }>;
  };
  const entry = await readFile(path.join(root, 'server.ts'), 'utf8');
  const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };

  assert.match(entry, /import express from 'express'/);
  assert.match(entry, /path\.join\(process\.cwd\(\), 'client'\)/);
  assert.equal(rootPackage.dependencies?.express, '4.22.3');
  assert.equal(vercel.functions?.['server.ts']?.includeFiles, 'client/**/*');
  assert.equal(vercel.functions?.['server.ts']?.maxDuration, 300);
  assert.deepEqual(vercel.crons, [{ path: '/api/v1/cron/jobs', schedule: '0 8 * * *' }]);
});

test('authenticated requests verify the token and run inside the user RLS context', async () => {
  const auth = await readFile(path.join(root, 'server/src/middleware/auth.ts'), 'utf8');

  assert.match(auth, /createUserClient\(token\)/);
  assert.match(auth, /getUser\(token\)/);
  assert.match(auth, /runWithUserClient\(client, next\)/);
});

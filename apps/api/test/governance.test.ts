import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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
    await sourceText(path.join(root, 'apps/api/src')),
    await sourceText(path.join(root, 'apps/web')),
    await readFile(path.join(root, 'apps/api/package.json'), 'utf8'),
  ].join('\n');

  assert.equal(production.includes('coze-coding-dev-sdk'), false);
  assert.equal(production.includes('coze_workload_identity'), false);
  assert.equal(production.includes('COZE_SUPABASE_'), false);
  assert.equal(production.includes('PGDATABASE_URL'), false);
});

test('serverless app has no persistent listener or timer', async () => {
  const app = await readFile(path.join(root, 'apps/api/src/app.ts'), 'utf8');

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

  assert.ok((sql.match(/enable row level security/g) ?? []).length >= 11);
  assert.match(sql, /create(?: or replace)? function public\.match_entries/i);
  assert.match(sql, /create(?: or replace)? function public\.claim_due_jobs/i);
  assert.match(sql, /create policy entries_update_own/i);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
});

test('Supabase auth disables public signup while keeping password login', async () => {
  const config = await readFile(path.join(root, 'supabase/config.toml'), 'utf8');
  assert.match(config, /auto_expose_new_tables = false/);
  assert.match(config, /\[auth\][\s\S]*?enable_signup = false/);
  assert.match(config, /\[auth\.email\][\s\S]*?(?=\[auth\.sms\])/);
  assert.match(config, /\[auth\.email\][\s\S]*?enable_signup = true[\s\S]*?(?=\[auth\.sms\])/);
  assert.match(config, /\[auth\.email\][\s\S]*?enable_confirmations = false[\s\S]*?(?=\[auth\.sms\])/);
  assert.match(config, /minimum_password_length = 8/);
  assert.match(config, /password_requirements = "letters_digits"/);
  assert.match(config, /jwt_expiry = 900/);
});

test('Vercel uses an API function, static output, and a protected daily cron', async () => {
  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8')) as {
    functions?: Record<string, { includeFiles?: string; maxDuration?: number }>;
    crons?: Array<{ path: string; schedule: string }>;
    buildCommand?: string;
    outputDirectory?: string;
    rewrites?: Array<{ source: string; destination: string }>;
  };
  const entry = await readFile(path.join(root, 'api/index.js'), 'utf8');
  const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };

  assert.match(entry, /apps\/api\/dist\/app\.js/);
  assert.equal(vercel.buildCommand, 'pnpm build');
  assert.equal(vercel.outputDirectory, 'apps/web');
  assert.equal(rootPackage.dependencies?.express, '4.22.3');
  assert.equal(vercel.functions?.['api/index.js']?.maxDuration, 300);
  assert.deepEqual(vercel.rewrites, [
    { source: '/api/(.*)', destination: '/api/index?path=$1' },
  ]);
  assert.deepEqual(vercel.crons, [{ path: '/api/v1/cron/jobs', schedule: '0 8 * * *' }]);
});

test('Vercel functions run in the primary database region', async () => {
  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8')) as {
    regions?: string[];
  };

  assert.deepEqual(vercel.regions, ['sin1']);
});

test('authenticated requests verify the token and run inside the user RLS context', async () => {
  const auth = await readFile(path.join(root, 'apps/api/src/middleware/auth.ts'), 'utf8');

  assert.match(auth, /createUserClient\(token\)/);
  assert.match(auth, /getUser\(token\)/);
  assert.match(auth, /runWithUserClient\(client, next\)/);
});

test('bootstrap endpoint aggregates initial data after one authentication', async () => {
  const routes = await readFile(path.join(root, 'apps/api/src/routes/index.ts'), 'utf8');
  assert.match(routes, /r\.get\('\/bootstrap'/);
  assert.match(routes, /Promise\.all\(\[[\s\S]*listCategories\(user\.id\)/);
  assert.match(routes, /listEntries\(user\.id,[\s\S]*size: 100/);
  assert.match(routes, /listRecalls\(user\.id\)/);
});

test('documentation does not point to removed source directories', async () => {
  const files = [
    'README.md',
    'docs/api/后端接口契约.md',
    'docs/ops/deployment.md',
    'docs/ops/environment.md',
  ];

  for (const relative of files) {
    const text = await readFile(path.join(root, relative), 'utf8');
    for (const legacy of ['`client/', '`server/', '01-Docs/', '02-Design/', '03-Code/', '04-Archive/']) {
      assert.equal(text.includes(legacy), false, `${relative} still references ${legacy}`);
    }
  }
});

test('TypeScript config matches Vercel NodeNext resolution', async () => {
  const rootTs = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8')) as {
    compilerOptions?: { module?: string; moduleResolution?: string };
  };
  const apiTs = JSON.parse(await readFile(path.join(root, 'apps/api/tsconfig.json'), 'utf8')) as {
    compilerOptions?: { module?: string; moduleResolution?: string };
  };

  for (const config of [rootTs, apiTs]) {
    assert.equal(config.compilerOptions?.module, 'NodeNext');
    assert.equal(config.compilerOptions?.moduleResolution, 'NodeNext');
  }
});

test('capture migration adds file metadata and AI preferences', async () => {
  const files = (await readdir(path.join(root, 'supabase/migrations')))
    .filter((file) => file.endsWith('_capture_document_ai.sql'));
  assert.equal(files.length, 1);

  const sql = await readFile(path.join(root, 'supabase/migrations', files[0]), 'utf8');
  assert.match(sql, /'file'/);
  assert.match(sql, /source_name/);
  assert.match(sql, /source_mime/);
  assert.match(sql, /title_source/);
  assert.match(sql, /summary_source/);
  assert.match(sql, /ai_auto_title/);
  assert.match(sql, /ai_embeddings_enabled/);
});

test('foundation migration enforces invitation-only access and account safety', async () => {
  const migrationDir = path.join(root, 'supabase/migrations');
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith('_foundation_security.sql'));
  assert.equal(files.length, 1);

  const sql = await readFile(path.join(migrationDir, files[0]), 'utf8');
  assert.match(sql, /create table public\.invitations/i);
  assert.match(sql, /create table public\.audit_events/i);
  assert.match(sql, /create table public\.error_events/i);
  assert.match(sql, /account_status text not null default 'active'/i);
  assert.match(sql, /deletion_scheduled_for timestamptz/i);
  assert.match(sql, /create or replace function public\.session_is_valid/i);
  assert.match(sql, /revoke all on table public\.invitations from anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.session_is_valid[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /categories_user_parent_name_unique/i);
  assert.match(sql, /categories_parent_same_user/i);
  assert.match(sql, /revoke update \(account_status, deletion_requested_at, deletion_scheduled_for\)/i);

  const config = await readFile(path.join(root, 'supabase/config.toml'), 'utf8');
  assert.match(config, /\[auth\][\s\S]*?enable_signup = false/);
  assert.match(config, /\[auth\.email\][\s\S]*?enable_signup = true[\s\S]*?(?=\[auth\.sms\])/);
  assert.match(config, /jwt_expiry = 900/);
});

test('invited accounts keep a separate pending email-verification state', async () => {
  const migrationDir = path.join(root, 'supabase/migrations');
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith('_invited_email_status.sql'));
  assert.equal(files.length, 1);
  const sql = await readFile(path.join(migrationDir, files[0]), 'utf8');

  assert.match(sql, /email_verification_status text not null default 'pending'/i);
  assert.match(sql, /email_confirmed_at is not null then 'verified'/i);
  assert.match(sql, /revoke update \(email_verification_status\)/i);

  const invitations = await readFile(path.join(root, 'apps/api/src/services/invitations.ts'), 'utf8');
  assert.match(invitations, /email_confirm: true/);
});

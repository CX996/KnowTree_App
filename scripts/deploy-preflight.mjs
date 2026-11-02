import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const requiredEnvNames = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'CRON_SECRET',
];

export function runPreflight({ root = process.cwd(), env = process.env } = {}) {
  const errors = [];

  for (const name of requiredEnvNames) {
    const value = String(env[name] || '').trim();
    if (!value) {
      errors.push(`${name} is missing`);
      continue;
    }
    if (/xxx|your-project|replace-with|test-secret|example\.supabase\.co/i.test(value)) {
      errors.push(`${name} still contains a placeholder`);
    }
    if (name === 'SUPABASE_PUBLISHABLE_KEY' && !value.startsWith('sb_publishable_')) {
      errors.push('SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_');
    }
    if (name === 'SUPABASE_SECRET_KEY' && !value.startsWith('sb_secret_')) {
      errors.push('SUPABASE_SECRET_KEY must start with sb_secret_');
    }
  }

  try {
    const url = new URL(String(env.SUPABASE_URL || ''));
    if (url.protocol !== 'https:') errors.push('SUPABASE_URL must use https');
  } catch {
    errors.push('SUPABASE_URL is not a valid URL');
  }

  if (String(env.CRON_SECRET || '').length < 16) {
    errors.push('CRON_SECRET must be at least 16 characters');
  }

  const requiredFiles = [
    '.env.example',
    'server.ts',
    'vercel.json',
    'apps/web/index.html',
    'apps/api/src/app.ts',
    'supabase/migrations',
  ];
  for (const relative of requiredFiles) {
    if (!existsSync(path.join(root, relative))) errors.push(`${relative} is missing`);
  }

  const vercelPath = path.join(root, 'vercel.json');
  if (existsSync(vercelPath)) {
    try {
      const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
      if (!vercel.functions?.['server.ts']) errors.push('vercel.json has no server.ts function');
      if (!vercel.crons?.some((cron) => cron.path === '/api/v1/cron/jobs')) {
        errors.push('vercel.json has no jobs cron');
      }
    } catch {
      errors.push('vercel.json is invalid JSON');
    }
  }

  const index = path.join(root, 'apps/web/index.html');
  if (existsSync(index) && readFileSync(index, 'utf8').includes('lf-cdn.coze.cn')) {
    errors.push('production frontend still loads Coze scripts');
  }

  const envExample = path.join(root, '.env.example');
  if (existsSync(envExample)) {
    const template = readFileSync(envExample, 'utf8');
    for (const name of requiredEnvNames) {
      if (!template.includes(`${name}=`)) errors.push(`.env.example has no ${name}`);
    }
  }

  const migrationDir = path.join(root, 'supabase/migrations');
  if (existsSync(migrationDir) && !readdirSync(migrationDir).some((file) => file.endsWith('.sql'))) {
    errors.push('supabase/migrations contains no SQL files');
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runPreflight();
  if (!result.ok) {
    console.error(`Deployment preflight failed:\n- ${result.errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('Deployment preflight passed.');
  }
}

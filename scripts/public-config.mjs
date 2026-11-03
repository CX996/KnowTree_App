import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

function normalizeEnvValue(value) {
  let normalized = String(value || '').trim();
  if (normalized.length >= 2) {
    const quoted = (normalized.startsWith('"') && normalized.endsWith('"'))
      || (normalized.startsWith("'") && normalized.endsWith("'"));
    if (quoted) normalized = normalized.slice(1, -1);
  }
  return normalized;
}

export function buildPublicConfig(env = {}) {
  const supabaseUrl = normalizeEnvValue(env.SUPABASE_URL);
  const supabaseKey = normalizeEnvValue(env.SUPABASE_PUBLISHABLE_KEY);
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    if (new URL(supabaseUrl).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { supabaseUrl, supabaseKey };
}

async function readEnvFile(file) {
  try {
    const text = await readFile(file, 'utf8');
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) env[match[1]] = match[2];
    }
    return env;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return {};
    throw error;
  }
}

export async function writePublicConfig(root, env = process.env) {
  let config = buildPublicConfig(env);
  if (!config) {
    const fileEnv = {
      ...(await readEnvFile(path.join(root, '.env'))),
      ...(await readEnvFile(path.join(root, '.env.local'))),
    };
    config = buildPublicConfig(fileEnv);
  }

  const target = path.join(root, 'apps/web/public-config.json');
  if (!config) {
    await unlink(target).catch((error) => {
      if (!error || error.code !== 'ENOENT') throw error;
    });
    return false;
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(config)}\n`, 'utf8');
  return true;
}

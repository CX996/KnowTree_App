import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadLocalEnvironment } from '../src/lib/local-env.js';

test('API development command enables Node proxy environment support', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { scripts?: Record<string, string> };

  assert.match(packageJson.scripts?.dev || '', /--use-env-proxy/);
  assert.match(packageJson.scripts?.dev || '', /--import tsx/);
});

test('loads .env.local with priority over .env into the target environment', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'knowtree-env-'));
  try {
    await writeFile(
      path.join(root, '.env'),
      'SHARED_VALUE=base\nBASE_ONLY=base-only\n',
      'utf8',
    );
    await writeFile(
      path.join(root, '.env.local'),
      'SHARED_VALUE=local\nLOCAL_ONLY="local only"\n',
      'utf8',
    );

    const target: Record<string, string | undefined> = {};
    const loaded = loadLocalEnvironment(root, target);

    assert.equal(loaded, target);
    assert.equal(target.SHARED_VALUE, 'local');
    assert.equal(target.LOCAL_ONLY, 'local only');
    assert.equal(target.BASE_ONLY, 'base-only');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

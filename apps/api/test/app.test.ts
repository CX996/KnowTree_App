import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test, { type TestContext } from 'node:test';
import { createApp } from '../src/app.js';

async function startApp(t: TestContext) {
  const app = createApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => closeServer(server));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

test('createApp exposes a health endpoint without starting its own listener', async (t) => {
  const base = await startApp(t);
  const response = await fetch(`${base}/api/v1/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('Vercel API entrypoint exports the same Express application contract', async (t) => {
  const { default: vercelApp } = await import('../../../api/index.js');
  const server = createServer(vercelApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => closeServer(server));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('Vercel API rewrite restores a nested API path', async (t) => {
  const { default: vercelApp } = await import('../../../api/index.js');
  const server = createServer(vercelApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => closeServer(server));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}/api/index?path=v1%2Fhealth`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('public config exposes only the Supabase URL and publishable key', async (t) => {
  const previous = {
    url: process.env.SUPABASE_URL,
    publishable: process.env.SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.SUPABASE_SECRET_KEY,
  };
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_public';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_must_not_leak';
  t.after(() => {
    restoreEnv('SUPABASE_URL', previous.url);
    restoreEnv('SUPABASE_PUBLISHABLE_KEY', previous.publishable);
    restoreEnv('SUPABASE_SECRET_KEY', previous.secret);
  });

  const base = await startApp(t);
  const response = await fetch(`${base}/api/v1/config`);
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    supabaseUrl: 'https://example.supabase.co',
    supabaseKey: 'sb_publishable_public',
  });
  assert.equal(JSON.stringify(body).includes('sb_secret_must_not_leak'), false);
});

test('cron endpoint rejects requests without the configured secret', async (t) => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-test-secret';
  t.after(() => restoreEnv('CRON_SECRET', previous));

  const base = await startApp(t);
  const response = await fetch(`${base}/api/v1/cron/jobs`);

  assert.equal(response.status, 401);
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  server.closeAllConnections();
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

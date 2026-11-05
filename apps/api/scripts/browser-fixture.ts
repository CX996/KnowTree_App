import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnvironment } from '../src/lib/local-env.js';
import { ensureProfile } from '../src/middleware/auth.js';
import { getAdminClient } from '../src/storage/database/supabase-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadLocalEnvironment(root);

const fixtureDir = process.env.BROWSER_FIXTURE_DIR?.trim()
  || path.join(os.tmpdir(), 'knowtree-browser-fixture');
const statePath = path.join(fixtureDir, 'state.json');
const initPath = path.join(fixtureDir, 'init.js');
const metadataPath = path.join(fixtureDir, 'fixture.json');
const baseUrl = process.env.LIVE_VERIFY_BASE_URL?.trim() || 'http://127.0.0.1:9091';
const command = process.argv[2] || 'create';
const admin = getAdminClient();

if (command === 'cleanup-all-tests') {
  const prefixes = ['kt-live-', 'kt-visual-', 'kt-debug-'];
  let page = 1;
  let deleted = 0;
  while (true) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) throw listed.error;
    const users = listed.data.users;
    for (const user of users) {
      const email = String(user.email || '').toLowerCase();
      if (prefixes.some((prefix) => email.startsWith(prefix))) {
        const result = await admin.auth.admin.deleteUser(user.id, false);
        if (!result.error) deleted++;
      }
    }
    if (users.length < 1000) break;
    page++;
  }
  await rm(statePath, { force: true });
  await rm(initPath, { force: true });
  await rm(metadataPath, { force: true });
  console.log(JSON.stringify({ testAccountsDeleted: deleted }));
} else if (command === 'cleanup') {
  try {
    const fixture = JSON.parse(await readFile(metadataPath, 'utf8')) as { userId?: string };
    if (fixture.userId) await admin.auth.admin.deleteUser(fixture.userId, false);
  } finally {
    await rm(statePath, { force: true });
    await rm(initPath, { force: true });
    await rm(metadataPath, { force: true });
  }
  console.log(JSON.stringify({ cleaned: true }));
} else if (command === 'create' || command === 'create-owner') {
  await mkdir(fixtureDir, { recursive: true });
  const role = command === 'create-owner' ? 'owner' : 'user';
  const email = `kt-visual-${role}-${randomUUID()}@example.invalid`;
  const password = `Kt${randomBytes(14).toString('hex')}9`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { display_name: '视觉验收' },
  });
  if (created.error || !created.data.user) throw created.error || new Error('fixture user create failed');
  const userId = created.data.user.id;

  try {
    await ensureProfile(userId, '视觉验收');
    const signIn = await fetch(`${process.env.SUPABASE_URL!.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const session = await signIn.json() as Record<string, unknown>;
    if (!signIn.ok || typeof session.access_token !== 'string') throw new Error('fixture login failed');

    const state = {
      cookies: [],
      origins: [{
        origin: baseUrl,
        localStorage: [
          { name: 'knowtree_token', value: session.access_token },
          { name: 'knowtree_refresh_token', value: String(session.refresh_token || '') },
          { name: 'knowtree.pet.size.v1', value: 'medium' },
        ],
      }],
    };
    await writeFile(statePath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
    await writeFile(
      initPath,
      `try {\n` +
        `  if (location.origin === ${JSON.stringify(baseUrl)}) {\n` +
        `    localStorage.setItem('knowtree_token', ${JSON.stringify(session.access_token)});\n` +
        `    localStorage.setItem('knowtree_refresh_token', ${JSON.stringify(session.refresh_token || '')});\n` +
        `    localStorage.setItem('knowtree.pet.size.v1', 'medium');\n` +
        `  }\n} catch {}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await writeFile(metadataPath, JSON.stringify({ userId, statePath, initPath }), { encoding: 'utf8', mode: 0o600 });
    console.log(JSON.stringify({ created: true, statePath }));
  } catch (error) {
    await admin.auth.admin.deleteUser(userId, false).catch(() => undefined);
    throw error;
  }
} else {
    throw new Error('Expected create, create-owner, cleanup or cleanup-all-tests');
}

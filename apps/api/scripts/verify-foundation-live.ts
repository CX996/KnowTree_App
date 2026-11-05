import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnvironment } from '../src/lib/local-env.js';
import { getAdminClient } from '../src/storage/database/supabase-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadLocalEnvironment(root);

const baseUrl = process.env.LIVE_VERIFY_BASE_URL?.trim() || 'http://127.0.0.1:9091';
const admin = getAdminClient();
const password = `Kt${randomBytes(12).toString('hex')}9`;
const ownerEmail = `kt-live-owner-${randomUUID()}@example.invalid`;
const readerEmail = `kt-live-reader-${randomUUID()}@example.invalid`;
const ownerUserId: string[] = [];
const readerUserId: string[] = [];

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}

async function api(
  route: string,
  options: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> & ApiErrorBody }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.token) headers['x-session'] = options.token;
  const response = await fetch(`${baseUrl}/api/v1${route}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as Record<string, unknown> & ApiErrorBody : {};
  return { status: response.status, body };
}

async function login(email: string): Promise<string> {
  const result = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert.equal(
    result.status,
    200,
    `login must succeed (${result.status} ${result.body.error?.code || 'NO_CODE'} ${result.body.error?.message || 'NO_MESSAGE'})`,
  );
  assert.equal(typeof result.body.access_token, 'string');
  return String(result.body.access_token);
}

try {
  const ownerCreated = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    app_metadata: { role: 'owner' },
    user_metadata: { display_name: 'Live Verification Owner' },
  });
  if (ownerCreated.error || !ownerCreated.data.user) throw ownerCreated.error || new Error('owner create failed');
  ownerUserId.push(ownerCreated.data.user.id);

  const ownerProfile = await admin.from('profiles').insert({
    user_id: ownerCreated.data.user.id,
    display_name: 'Live Verification Owner',
  });
  if (ownerProfile.error) throw ownerProfile.error;

  const ownerToken = await login(ownerEmail);
  const me = await api('/me', { token: ownerToken });
  assert.equal(me.status, 200);
  assert.equal(me.body.user && (me.body.user as Record<string, unknown>).role, 'owner');

  const invitation = await api('/owner/invites', {
    method: 'POST',
    token: ownerToken,
    body: JSON.stringify({ email: readerEmail }),
  });
  assert.equal(invitation.status, 201);
  const inviteUrl = String(invitation.body.inviteUrl);
  const token = new URL(inviteUrl).hash.replace(/^#invite=/, '');
  assert.ok(token.length >= 40);

  const validation = await api('/auth/invite/validate', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  assert.equal(validation.status, 200);
  assert.equal(validation.body.email, readerEmail);

  const registration = await api('/auth/invite/register', {
    method: 'POST',
    body: JSON.stringify({
      token,
      nickname: 'Live Reader',
      password,
      confirmPassword: password,
    }),
  });
  assert.equal(
    registration.status,
    201,
    `invitation registration must succeed (${registration.status} ${registration.body.error?.code || 'NO_CODE'} ${registration.body.error?.message || 'NO_MESSAGE'})`,
  );
  const readerToken = String(registration.body.accessToken);
  assert.ok(readerToken);

  const readerMe = await api('/me', { token: readerToken });
  assert.equal(readerMe.status, 200);
  assert.equal(readerMe.body.user && (readerMe.body.user as Record<string, unknown>).emailStatus, 'pending');
  readerUserId.push(String((readerMe.body.user as Record<string, unknown>).id));

  const category = await api('/categories', {
    method: 'POST',
    token: readerToken,
    body: JSON.stringify({ name: `Live ${randomBytes(3).toString('hex')}` }),
  });
  assert.equal(category.status, 201);
  const categoryId = String(category.body.id);

  const child = await api('/categories', {
    method: 'POST',
    token: readerToken,
    body: JSON.stringify({ name: 'Child', parent_id: categoryId }),
  });
  assert.equal(child.status, 201);

  const blockedDelete = await api(`/categories/${categoryId}`, {
    method: 'DELETE',
    token: readerToken,
  });
  assert.equal(blockedDelete.status, 409);
  assert.equal(blockedDelete.body.error?.code, 'CONFLICT');

  const entry = await api('/entries/ingest', {
    method: 'POST',
    token: readerToken,
    body: JSON.stringify({
      title: 'Live verification note',
      content: `Foundation verification ${randomUUID()}`,
      captureType: 'manual',
    }),
  });
  assert.equal(entry.status, 201);
  const entryId = String((entry.body.entry as Record<string, unknown>).id);

  const deleted = await api(`/entries/${entryId}`, {
    method: 'DELETE',
    token: readerToken,
  });
  assert.equal(deleted.status, 200);

  const trash = await api('/trash', { token: readerToken });
  assert.equal(trash.status, 200);
  assert.ok((trash.body as unknown as unknown[]).some((item) => (item as Record<string, unknown>).id === entryId));

  const restored = await api(`/trash/${entryId}/restore`, {
    method: 'POST',
    token: readerToken,
    body: '{}',
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.id, entryId);

  const wrongPassword = await api('/me/logout-all', {
    method: 'POST',
    token: readerToken,
    body: JSON.stringify({ currentPassword: 'Wrong12345' }),
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.body.error?.code, 'REAUTH_FAILED');

  const diagnostics = await api('/owner/error-events?limit=5', { token: ownerToken });
  assert.equal(diagnostics.status, 200);
  assert.ok(Array.isArray(diagnostics.body));

  console.log(JSON.stringify({
    passed: true,
    checks: [
      'owner-login',
      'invite-create',
      'invite-validate',
      'invite-register',
      'reader-account',
      'category-depth-guard',
      'trash-delete-restore',
      'reauth-guard',
      'owner-diagnostics',
    ],
  }));
} finally {
  for (const userId of readerUserId) {
    await admin.auth.admin.deleteUser(userId, false).catch(() => undefined);
  }
  for (const userId of ownerUserId) {
    await admin.auth.admin.deleteUser(userId, false).catch(() => undefined);
  }
}

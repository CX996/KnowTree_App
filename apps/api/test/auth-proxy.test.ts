import assert from 'node:assert/strict';
import test from 'node:test';
import { forwardSupabaseAuth } from '../src/services/auth-proxy.js';

test('auth proxy forwards login to Supabase with only the publishable key', async (t) => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({
      access_token: 'access',
      refresh_token: 'refresh',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const result = await forwardSupabaseAuth({
    path: 'token?grant_type=password',
    method: 'POST',
    body: { email: 'reader@example.com', password: 'secret-password' },
    env: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public',
    },
  });

  assert.equal(requestUrl, 'https://project.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(requestInit?.method, 'POST');
  const headers = requestInit?.headers as Record<string, string>;
  assert.equal(headers.apikey, 'sb_publishable_public');
  assert.equal(headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    email: 'reader@example.com',
    password: 'secret-password',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), {
    access_token: 'access',
    refresh_token: 'refresh',
  });
});

test('auth proxy forwards recovery session updates with the user token', async (t) => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({ id: 'user-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const result = await forwardSupabaseAuth({
    path: 'user',
    method: 'PUT',
    body: { password: 'newpass123' },
    accessToken: 'recovery-session',
    env: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public',
    },
  });

  assert.equal(requestUrl, 'https://project.supabase.co/auth/v1/user');
  assert.equal(requestInit?.method, 'PUT');
  const headers = requestInit?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer recovery-session');
  assert.equal(result.status, 200);
});

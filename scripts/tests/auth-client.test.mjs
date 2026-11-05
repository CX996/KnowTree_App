import assert from 'node:assert/strict';
import test from 'node:test';

const authClientPath = new URL('../../apps/web/assets/auth-client.js', import.meta.url);

test('new passwords require at least eight letters and digits', async () => {
  const { validateNewPassword } = await import(authClientPath);

  assert.equal(validateNewPassword('abc12345').ok, true);
  assert.equal(validateNewPassword('short1').ok, false);
  assert.equal(validateNewPassword('12345678').ok, false);
  assert.equal(validateNewPassword('abcdefgh').ok, false);
});

test('auth callback parses confirmation and recovery sessions', async () => {
  const { parseAuthCallback } = await import(authClientPath);

  assert.deepEqual(
    parseAuthCallback('#access_token=access&refresh_token=refresh&type=signup'),
    {
      accessToken: 'access',
      refreshToken: 'refresh',
      type: 'signup',
      errorDescription: '',
    },
  );
  assert.equal(
    parseAuthCallback('#error=access_denied&error_description=Link%20expired').errorDescription,
    'Link expired',
  );
});

test('post-login redirects stay inside the application', async () => {
  const { safeNextPage } = await import(authClientPath);

  assert.equal(safeNextPage('library.html?view=recent'), 'library.html?view=recent');
  assert.equal(safeNextPage('https://evil.example/login'), 'index.html');
  assert.equal(safeNextPage('//evil.example'), 'index.html');
});

test('password recovery uses the reset page as its redirect target', async (t) => {
  const { requestPasswordReset } = await import(authClientPath);
  let requestUrl = '';
  let requestInit;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  await requestPasswordReset(
    { supabaseUrl: 'https://project.supabase.co', supabaseKey: 'public-key' },
    'reader@example.com',
    'https://knowtree-app.vercel.app/reset-password.html',
  );

  assert.equal(
    requestUrl,
    '/api/v1/auth/recover?redirect_to=https%3A%2F%2Fknowtree-app.vercel.app%2Freset-password.html',
  );
  assert.equal(requestInit.method, 'POST');
  assert.deepEqual(JSON.parse(requestInit.body), { email: 'reader@example.com' });
});

test('password update uses the recovery access token and new password', async (t) => {
  const { updatePassword } = await import(authClientPath);
  let requestUrl = '';
  let requestInit;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({ id: 'user-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  await updatePassword(
    { supabaseUrl: 'https://project.supabase.co', supabaseKey: 'public-key' },
    'recovery-access',
    'newpass123',
  );

  assert.equal(requestUrl, '/api/v1/auth/password');
  assert.equal(requestInit.method, 'PUT');
  assert.equal(requestInit.headers['x-session'], 'recovery-access');
  assert.deepEqual(JSON.parse(requestInit.body), { password: 'newpass123' });
});

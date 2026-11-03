const MIN_PASSWORD_LENGTH = 8;

export function validateNewPassword(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: '密码至少需要 8 位' };
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return { ok: false, message: '密码需要同时包含字母和数字' };
  }
  return { ok: true, message: '' };
}

export function safeNextPage(raw, fallback = 'index.html') {
  const value = String(raw || '');
  return /^[A-Za-z0-9_-]+\.html(?:\?[A-Za-z0-9_%=&.~-]*)?$/.test(value)
    ? value
    : fallback;
}

export function parseAuthCallback(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  return {
    accessToken: params.get('access_token') || '',
    refreshToken: params.get('refresh_token') || '',
    type: params.get('type') || '',
    errorDescription: params.get('error_description') || params.get('error') || '',
  };
}

function authUrl(config, path, redirectTo) {
  const base = String(config?.supabaseUrl || '').replace(/\/+$/, '');
  const query = redirectTo
    ? `?${new URLSearchParams({ redirect_to: redirectTo }).toString()}`
    : '';
  return `${base}/auth/v1/${path}${query}`;
}

async function authRequest(url, apiKey, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const message = body.error_description || body.msg || body.message || body.error || '认证请求失败';
    throw new Error(String(message));
  }
  return body;
}

export async function signUpWithPassword(config, email, password, emailRedirectTo) {
  const body = await authRequest(
    authUrl(config, 'signup', emailRedirectTo),
    config.supabaseKey,
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        data: {},
        gotrue_meta_security: { captcha_token: null },
      }),
    },
  );
  return {
    needsConfirmation: !body.access_token,
    user: body.user || body,
    session: body.access_token
      ? {
          accessToken: body.access_token,
          refreshToken: body.refresh_token || '',
        }
      : null,
  };
}

export async function requestPasswordReset(config, email, redirectTo) {
  return authRequest(
    authUrl(config, 'recover', redirectTo),
    config.supabaseKey,
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  );
}

export async function updatePassword(config, accessToken, password) {
  return authRequest(
    authUrl(config, 'user'),
    config.supabaseKey,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    },
  );
}

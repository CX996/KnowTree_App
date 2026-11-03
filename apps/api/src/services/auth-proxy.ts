export interface AuthProxyInput {
  path: string;
  method?: 'POST' | 'PUT';
  body?: Record<string, unknown>;
  accessToken?: string;
  env?: Record<string, string | undefined>;
}

export interface AuthProxyResult {
  status: number;
  contentType: string;
  body: string;
}

export async function forwardSupabaseAuth(input: AuthProxyInput): Promise<AuthProxyResult> {
  const env = input.env ?? process.env;
  const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!supabaseUrl || !publishableKey) {
    throw new Error('Supabase auth configuration is missing');
  }

  const headers: Record<string, string> = {
    apikey: publishableKey,
    'Content-Type': 'application/json',
  };
  if (input.accessToken) headers.Authorization = `Bearer ${input.accessToken}`;

  const response = await fetch(`${supabaseUrl}/auth/v1/${input.path}`, {
    method: input.method || 'POST',
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || 'application/json; charset=utf-8',
    body: await response.text(),
  };
}

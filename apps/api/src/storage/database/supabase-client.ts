import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

interface SupabasePublicConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

const userClientContext = new AsyncLocalStorage<SupabaseClient>();
let adminClient: SupabaseClient | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return {
    supabaseUrl: requiredEnv('SUPABASE_URL'),
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || requiredEnv('SUPABASE_ANON_KEY'),
  };
}

function getSupabaseSecretKey(): string {
  return process.env.SUPABASE_SECRET_KEY?.trim() || requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

export function createUserClient(token: string): SupabaseClient {
  const { supabaseUrl, supabaseKey } = getSupabasePublicConfig();
  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(requiredEnv('SUPABASE_URL'), getSupabaseSecretKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

/**
 * 用户请求使用 RLS 客户端；后台任务和账号管理在无请求上下文时使用 secret key。
 */
export function getSupabaseClient(token?: string): SupabaseClient {
  if (token) return createUserClient(token);
  return userClientContext.getStore() ?? getAdminClient();
}

export function runWithUserClient<T>(client: SupabaseClient, fn: () => T): T {
  return userClientContext.run(client, fn);
}

export function runOutsideUserClient<T>(fn: () => T): T {
  return userClientContext.exit(fn);
}

export function resetSupabaseClientsForTests(): void {
  adminClient = null;
}

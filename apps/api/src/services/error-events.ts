import { AppError } from '../lib/errors.js';
import { getAdminClient } from '../storage/database/supabase-client.js';
import type { AuthUser } from '../types/index.js';

export interface ErrorEventInput {
  requestId: string;
  userId?: string | null;
  method: string;
  path: string;
  status: number;
  code: string;
  safeMessage: string;
  retryable: boolean;
}

export interface ErrorEventView {
  requestId: string;
  method: string;
  path: string;
  status: number;
  code: string;
  safeMessage: string;
  retryable: boolean;
  createdAt: string;
}

export function sanitizeErrorPath(value: string): string {
  return String(value || '')
    .split(/[?#]/, 1)[0]
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      ':id',
    )
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export async function recordErrorEvent(input: ErrorEventInput): Promise<void> {
  const { error } = await getAdminClient()
    .from('error_events')
    .insert({
      request_id: input.requestId,
      user_id: input.userId || null,
      method: input.method,
      path: sanitizeErrorPath(input.path),
      status: input.status,
      code: input.code,
      safe_message: input.safeMessage,
      retryable: input.retryable,
    });
  if (error && !(error as { code?: string }).code?.startsWith('23')) {
    console.warn('[errors] failed to persist error event:', error.message);
  }
}

export async function listErrorEvents(
  owner: AuthUser,
  input: { code?: string; since?: string; limit?: number } = {},
): Promise<ErrorEventView[]> {
  if (owner.role !== 'owner') {
    throw new AppError('PERMISSION_DENIED', 403, '当前账号无权查看错误诊断');
  }
  let request = getAdminClient()
    .from('error_events')
    .select('request_id,method,path,status,code,safe_message,retryable,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));
  if (input.code) request = request.eq('code', input.code);
  if (input.since && Number.isFinite(Date.parse(input.since))) {
    request = request.gte('created_at', new Date(input.since).toISOString());
  }
  const { data, error } = await request;
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '错误诊断暂时无法读取', {
      retryable: true,
      cause: error,
    });
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    requestId: String(row.request_id),
    method: String(row.method),
    path: String(row.path),
    status: Number(row.status),
    code: String(row.code),
    safeMessage: String(row.safe_message),
    retryable: row.retryable === true,
    createdAt: String(row.created_at),
  }));
}

export async function purgeOldErrorEvents(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getAdminClient()
    .from('error_events')
    .delete()
    .lt('created_at', cutoff)
    .select('request_id');
  if (error) throw error;
  return data?.length ?? 0;
}

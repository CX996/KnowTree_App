import { AppError } from '../lib/errors.js';
import { getAdminClient, getSupabaseClient } from '../storage/database/supabase-client.js';
import type { Entry } from '../types/index.js';

const TRASH_RETENTION_DAYS = 30;
const TRASH_SELECT =
  'id,user_id,source_id,category_id,title,summary,content,content_hash,source_url,source_name,source_mime,capture_type,title_source,summary_source,status,classification_status,classification_confidence,suggested_category_id,weight,recall_count,last_recalled_at,deleted_at,created_at,updated_at';

export function isActiveEntry(entry: { deleted_at: string | null }): boolean {
  return entry.deleted_at === null;
}

export function isTrashExpired(deletedAt: string, now = new Date()): boolean {
  const deletedTime = Date.parse(deletedAt);
  if (!Number.isFinite(deletedTime)) return false;
  return now.getTime() - deletedTime >= TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

export function restoreCategoryId(
  categoryId: string | null,
  categoryIsActive: boolean,
): string | null {
  return categoryId && categoryIsActive ? categoryId : null;
}

export function validateCategoryDelete(input: {
  entryCount: number;
  childCount: number;
}): { ok: boolean; code: 'CONFLICT' | null } {
  return input.entryCount > 0 || input.childCount > 0
    ? { ok: false, code: 'CONFLICT' }
    : { ok: true, code: null };
}

export async function listTrash(userId: string, query = ''): Promise<Entry[]> {
  const client = getSupabaseClient();
  let request = client
    .from('entries')
    .select(TRASH_SELECT)
    .eq('user_id', userId)
    .not('deleted_at', 'is', null);
  const q = query.trim();
  if (q) request = request.or(`title.ilike.%${q}%,summary.ilike.%${q}%,content.ilike.%${q}%`);
  const { data, error } = await request
    .order('deleted_at', { ascending: false })
    .limit(200);
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '回收站暂时无法读取', {
      retryable: true,
      cause: error,
    });
  }
  return (data ?? []) as unknown as Entry[];
}

export async function restoreEntry(userId: string, id: string): Promise<Entry> {
  const client = getSupabaseClient();
  const { data: trashed, error: readError } = await client
    .from('entries')
    .select(TRASH_SELECT)
    .eq('user_id', userId)
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .maybeSingle();
  if (readError) {
    throw new AppError('SERVER_ERROR', 500, '回收站内容暂时无法恢复', {
      retryable: true,
      cause: readError,
    });
  }
  if (!trashed) throw new AppError('NOT_FOUND', 404, '回收站中没有这条知识');

  const entry = trashed as unknown as Entry;
  const { data: duplicate, error: duplicateError } = await client
    .from('entries')
    .select('id')
    .eq('user_id', userId)
    .eq('content_hash', entry.content_hash)
    .is('deleted_at', null)
    .neq('id', entry.id)
    .maybeSingle();
  if (duplicateError) {
    throw new AppError('SERVER_ERROR', 500, '暂时无法检查重复知识', {
      retryable: true,
      cause: duplicateError,
    });
  }
  if (duplicate) {
    throw new AppError('CONFLICT', 409, '已有相同内容的知识，不能恢复重复副本');
  }

  let categoryIsActive = false;
  if (entry.category_id) {
    const { data: category, error: categoryError } = await client
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('id', entry.category_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (categoryError) {
      throw new AppError('SERVER_ERROR', 500, '暂时无法检查原分类', {
        retryable: true,
        cause: categoryError,
      });
    }
    categoryIsActive = Boolean(category);
  }
  const categoryId = restoreCategoryId(entry.category_id, categoryIsActive);
  const { data: restored, error: restoreError } = await client
    .from('entries')
    .update({
      deleted_at: null,
      category_id: categoryId,
      classification_status: categoryId ? entry.classification_status : 'uncategorized',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select(TRASH_SELECT)
    .single();
  if (restoreError) {
    if ((restoreError as { code?: string }).code === '23505') {
      throw new AppError('CONFLICT', 409, '已有相同内容的知识，不能恢复重复副本');
    }
    throw new AppError('SERVER_ERROR', 500, '知识恢复失败，请稍后重试', {
      retryable: true,
      cause: restoreError,
    });
  }
  return restored as unknown as Entry;
}

export async function permanentlyDeleteEntry(userId: string, id: string): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from('entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id');
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '永久删除失败，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }
  if (!data || data.length === 0) {
    throw new AppError('NOT_FOUND', 404, '回收站中没有这条知识');
  }
}

export async function purgeExpiredTrash(now = new Date()): Promise<number> {
  const cutoff = new Date(
    now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await getAdminClient()
    .from('entries')
    .delete()
    .lte('deleted_at', cutoff)
    .select('id');
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '回收站清理失败', {
      retryable: true,
      cause: error,
    });
  }
  return data?.length ?? 0;
}

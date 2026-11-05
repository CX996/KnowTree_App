import { getSupabaseClient } from '../storage/database/supabase-client.js';
import { AppError } from '../lib/errors.js';
import { validateCategoryDelete } from './trash.js';
import type { Category } from '../types/index.js';

const CATEGORY_SELECT = 'id,user_id,name,description,parent_id,icon,deleted_at,created_at,updated_at';

export async function listCategories(userId: string): Promise<Category[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('categories')
    .select(CATEGORY_SELECT)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw new Error(`查询分类失败: ${error.message}`);
  return (data ?? []) as unknown as Category[];
}

export async function getCategory(userId: string, id: string): Promise<Category | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('categories')
    .select(CATEGORY_SELECT)
    .eq('user_id', userId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`查询分类失败: ${error.message}`);
  return (data as unknown as Category) ?? null;
}

export async function createCategory(
  userId: string,
  input: { name: string; description?: string; parent_id?: string; icon?: string },
): Promise<Category> {
  const client = getSupabaseClient();
  const name = normalizeCategoryName(input.name);
  const parentId = input.parent_id?.trim() || null;
  await assertValidParent(userId, parentId);
  await assertSiblingNameAvailable(userId, name, parentId);

  const { data, error } = await client
    .from('categories')
    .insert({
      user_id: userId,
      name,
      description: input.description || null,
      parent_id: parentId,
      icon: input.icon || null,
    })
    .select(CATEGORY_SELECT)
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError('CONFLICT', 409, '同一级下已存在同名分类');
    }
    throw new AppError('SERVER_ERROR', 500, '分类暂时无法创建，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }
  return data as unknown as Category;
}

export async function updateCategory(
  userId: string,
  id: string,
  patch: { name?: string; description?: string; parent_id?: string | null; icon?: string },
): Promise<Category> {
  const client = getSupabaseClient();
  const current = await getCategory(userId, id);
  if (!current) throw new AppError('NOT_FOUND', 404, '分类不存在');

  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const nextName = patch.name !== undefined ? normalizeCategoryName(patch.name) : current.name;
  const nextParent = patch.parent_id !== undefined
    ? patch.parent_id?.trim() || null
    : current.parent_id;
  if (patch.name !== undefined) upd.name = nextName;
  if (patch.description !== undefined) upd.description = patch.description;
  if (patch.parent_id !== undefined) upd.parent_id = nextParent;
  if (patch.icon !== undefined) upd.icon = patch.icon;

  if (patch.parent_id !== undefined && nextParent !== current.parent_id) {
    if (nextParent === id) {
      throw new AppError('VALIDATION_FAILED', 400, '分类不能以自身作为父级');
    }
    await assertValidParent(userId, nextParent);
    if (nextParent) {
      const { count, error } = await client
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('parent_id', id)
        .is('deleted_at', null);
      if (error) {
        throw new AppError('SERVER_ERROR', 500, '暂时无法检查子分类', {
          retryable: true,
          cause: error,
        });
      }
      if ((count ?? 0) > 0) {
        throw new AppError('CONFLICT', 409, '有子分类的主分类不能移动到其他分类下');
      }
    }
  }
  if (patch.name !== undefined || patch.parent_id !== undefined) {
    await assertSiblingNameAvailable(userId, nextName, nextParent, id);
  }

  const { data, error } = await client
    .from('categories')
    .update(upd)
    .eq('user_id', userId)
    .eq('id', id)
    .select(CATEGORY_SELECT);
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError('CONFLICT', 409, '同一级下已存在同名分类');
    }
    throw new AppError('SERVER_ERROR', 500, '分类暂时无法更新，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }
  const row = (data as unknown as Category[] | null)?.[0];
  if (!row) throw new AppError('NOT_FOUND', 404, '分类不存在或无权访问');
  return row;
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  const client = getSupabaseClient();
  const current = await getCategory(userId, id);
  if (!current) throw new AppError('NOT_FOUND', 404, '分类不存在');

  const [{ count: entryCount, error: entryError }, { count: childCount, error: childError }] = await Promise.all([
    client
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category_id', id)
      .is('deleted_at', null),
    client
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('parent_id', id)
      .is('deleted_at', null),
  ]);
  if (entryError || childError) {
    throw new AppError('SERVER_ERROR', 500, '暂时无法检查分类内容', {
      retryable: true,
      cause: entryError || childError,
    });
  }
  const validation = validateCategoryDelete({
    entryCount: entryCount ?? 0,
    childCount: childCount ?? 0,
  });
  if (!validation.ok) {
    throw new AppError('CONFLICT', 409, '分类下还有知识或子分类，不能删除');
  }

  const now = new Date().toISOString();
  const { error } = await client
    .from('categories')
    .update({ deleted_at: now, updated_at: now })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '分类暂时无法删除，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }
}

function normalizeCategoryName(name: string): string {
  const value = String(name || '').trim();
  if (value.length < 1 || value.length > 80) {
    throw new AppError('VALIDATION_FAILED', 400, '分类名称需要 1 到 80 个字符', {
      fields: { name: '分类名称需要 1 到 80 个字符' },
    });
  }
  return value;
}

async function assertValidParent(userId: string, parentId: string | null): Promise<void> {
  if (!parentId) return;
  const parent = await getCategory(userId, parentId);
  if (!parent) {
    throw new AppError('VALIDATION_FAILED', 400, '父分类不存在', {
      fields: { parent_id: '请选择有效的父分类' },
    });
  }
  if (parent.parent_id) {
    throw new AppError('VALIDATION_FAILED', 400, '分类最多两级，不能在子分类下继续创建', {
      fields: { parent_id: '子分类下不能再创建子分类' },
    });
  }
}

async function assertSiblingNameAvailable(
  userId: string,
  name: string,
  parentId: string | null,
  excludeId?: string,
): Promise<void> {
  const client = getSupabaseClient();
  let query = client
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', name)
    .is('deleted_at', null);
  query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '暂时无法检查分类名称', {
      retryable: true,
      cause: error,
    });
  }
  if (data) {
    throw new AppError('CONFLICT', 409, '同一级下已存在同名分类');
  }
}

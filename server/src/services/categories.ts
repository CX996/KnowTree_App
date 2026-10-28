import { getSupabaseClient } from '../storage/database/supabase-client';
import type { Category } from '../types';

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
  const name = input.name.trim();
  if (!name) throw new Error('分类名称不能为空');

  const { data: dup } = await client
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', name)
    .is('deleted_at', null)
    .maybeSingle();
  if (dup) throw new Error('分类已存在');

  const { data, error } = await client
    .from('categories')
    .insert({
      user_id: userId,
      name,
      description: input.description || null,
      parent_id: input.parent_id || null,
      icon: input.icon || null,
    })
    .select(CATEGORY_SELECT)
    .single();
  if (error) throw new Error(`创建分类失败: ${error.message}`);
  return data as unknown as Category;
}

export async function updateCategory(
  userId: string,
  id: string,
  patch: { name?: string; description?: string; parent_id?: string | null; icon?: string },
): Promise<Category> {
  const client = getSupabaseClient();
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) upd.name = patch.name.trim();
  if (patch.description !== undefined) upd.description = patch.description;
  if (patch.parent_id !== undefined) upd.parent_id = patch.parent_id;
  if (patch.icon !== undefined) upd.icon = patch.icon;

  const { data, error } = await client
    .from('categories')
    .update(upd)
    .eq('user_id', userId)
    .eq('id', id)
    .select(CATEGORY_SELECT);
  if (error) throw new Error(`更新分类失败: ${error.message}`);
  const row = (data as unknown as Category[] | null)?.[0];
  if (!row) throw new Error('分类不存在或无权访问');
  return row;
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();
  // 软删除分类，同时解除其下条目的引用
  const { error: e1 } = await client
    .from('entries')
    .update({ category_id: null, updated_at: now })
    .eq('user_id', userId)
    .eq('category_id', id);
  if (e1) throw new Error(`解除分类引用失败: ${e1.message}`);
  const { error: e2 } = await client
    .from('categories')
    .update({ deleted_at: now, updated_at: now })
    .eq('user_id', userId)
    .eq('id', id);
  if (e2) throw new Error(`删除分类失败: ${e2.message}`);
}
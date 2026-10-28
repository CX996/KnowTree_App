import type { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import type { AuthUser, Profile } from '../types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      authToken?: string;
    }
  }
}

// 从 x-session header 校验登录态，并把用户信息注入 req.user
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = req.headers['x-session'];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  const client = getSupabaseClient(token);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    res.status(401).json({ error: '认证失败' });
    return;
  }
  req.user = {
    id: data.user.id,
    email: data.user.email ?? undefined,
    phone: data.user.phone ?? undefined,
  };
  req.authToken = token;
  next();
}

/** 从 database 读取用户配置（不存在则创建一条默认配置） */
export async function ensureProfile(userId: string): Promise<Profile> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`读取用户配置失败: ${error.message}`);
  if (data) return data as unknown as Profile;

  const defaults = {
    user_id: userId,
    display_name: null,
    avatar_url: null,
    daily_recall_enabled: true,
    daily_recall_count: 3,
    auto_classify_threshold: 0.75,
    review_threshold: 0.5,
    auto_merge_enabled: false,
  };
  const { data: created, error: createError } = await client.from('profiles').insert(defaults).select().single();
  if (createError) throw new Error(`初始化用户配置失败: ${createError.message}`);
  // 为新用户预置默认分类（最小依赖数据，避免首次使用空目录）
  const defaultCategories = [
    { user_id: userId, name: '技术', description: '编程、工程与产品技术' },
    { user_id: userId, name: '阅读', description: '书籍、文章与灵感摘录' },
    { user_id: userId, name: '工作', description: '工作资料与方法论' },
    { user_id: userId, name: '生活', description: '生活记录与兴趣' },
  ];
  await client.from('categories').insert(defaultCategories);
  return created as unknown as Profile;
}
import type { Request, Response, NextFunction } from 'express';
import {
  createUserClient,
  getAdminClient,
  getSupabaseClient,
  runWithUserClient,
} from '../storage/database/supabase-client.js';
import { AppError } from '../lib/errors.js';
import { readJwtTiming } from '../lib/jwt.js';
import type { AuthUser, Profile } from '../types/index.js';

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
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const raw = req.headers['x-session'];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) {
    next(new AppError('AUTH_REQUIRED', 401, '请先登录'));
    return;
  }
  const client = createUserClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    next(new AppError('AUTH_EXPIRED', 401, '登录已失效，请重新登录'));
    return;
  }

  let timing;
  try {
    timing = readJwtTiming(token);
  } catch {
    next(new AppError('AUTH_EXPIRED', 401, '登录已失效，请重新登录'));
    return;
  }

  const { data: sessionValid, error: sessionError } = await getAdminClient()
    .rpc('session_is_valid', {
      p_session_id: timing.sessionId,
      p_user_id: data.user.id,
    });
  if (sessionError) {
    next(new AppError('SERVER_ERROR', 503, '登录状态暂时无法校验，请稍后重试', {
      retryable: true,
      cause: sessionError,
    }));
    return;
  }
  if (!sessionValid) {
    next(new AppError('AUTH_EXPIRED', 401, '登录已失效，请重新登录'));
    return;
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('account_status')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (profileError) {
    next(new AppError('SERVER_ERROR', 503, '账户状态暂时无法校验，请稍后重试', {
      retryable: true,
      cause: profileError,
    }));
    return;
  }

  const role = data.user.app_metadata?.role === 'owner' ? 'owner' : 'user';
  req.user = {
    id: data.user.id,
    email: data.user.email ?? undefined,
    phone: data.user.phone ?? undefined,
    role,
    createdAt: data.user.created_at,
    emailConfirmedAt: data.user.email_confirmed_at ?? null,
    accountStatus: profile?.account_status === 'deletion_pending' ? 'deletion_pending' : 'active',
    sessionId: timing.sessionId,
    issuedAt: new Date(timing.iat * 1000).toISOString(),
    expiresAt: new Date(timing.exp * 1000).toISOString(),
  };
  req.authToken = token;
  runWithUserClient(client, next);
}

const DELETION_PENDING_ALLOWED: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'GET', path: /^\/me$/ },
  { method: 'POST', path: /^\/me\/logout$/ },
  { method: 'POST', path: /^\/me\/logout-all$/ },
  { method: 'GET', path: /^\/me\/deletion$/ },
  { method: 'POST', path: /^\/me\/deletion$/ },
  { method: 'DELETE', path: /^\/me\/deletion$/ },
  { method: 'GET', path: /^\/export$/ },
];

export function requireActiveAccount(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.accountStatus !== 'deletion_pending') {
    next();
    return;
  }
  const allowed = DELETION_PENDING_ALLOWED.some(
    (route) => route.method === req.method && route.path.test(req.path),
  );
  if (allowed) {
    next();
    return;
  }
  next(new AppError(
    'ACCOUNT_DELETION_PENDING',
    403,
    '账号正在注销冷静期，请先进入账户恢复页',
  ));
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
    ai_auto_title: true,
    ai_auto_summary: true,
    ai_auto_classify: true,
    ai_embeddings_enabled: true,
    ai_last_error: null,
    ai_last_error_at: null,
    account_status: 'active',
    deletion_requested_at: null,
    deletion_scheduled_for: null,
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

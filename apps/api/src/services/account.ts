import { AppError } from '../lib/errors.js';
import { createSystemJob } from '../lib/task.js';
import { ensureProfile } from '../middleware/auth.js';
import {
  createUserClient,
  getAdminClient,
} from '../storage/database/supabase-client.js';
import { forwardSupabaseAuth } from './auth-proxy.js';
import { recordAuditEvent } from './audit.js';
import type { AuthUser, Profile } from '../types/index.js';

const DELETION_DAYS = 7;

export interface DeletionSchedule {
  requestedAt: string;
  scheduledFor: string;
}

export interface AccountView {
  user: {
    id: string;
    email: string | null;
    role: 'owner' | 'user';
    createdAt: string;
    emailConfirmedAt: string | null;
    emailStatus: 'verified' | 'pending';
  };
  profile: Profile;
  session: {
    issuedAt: string;
    expiresAt: string;
  };
  deletion: {
    pending: boolean;
    requestedAt: string | null;
    scheduledFor: string | null;
  };
}

interface DeletionInput {
  currentPassword: string;
  confirmEmail: string;
  acknowledged: boolean;
}

export function normalizeAccountEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function accountEmailMatches(actual: string, confirmation: string): boolean {
  const normalizedActual = normalizeAccountEmail(actual);
  return Boolean(normalizedActual) && normalizedActual === normalizeAccountEmail(confirmation);
}

export function deletionSchedule(requestedAt = new Date()): DeletionSchedule {
  return {
    requestedAt: requestedAt.toISOString(),
    scheduledFor: new Date(
      requestedAt.getTime() + DELETION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

export async function getAccountView(user: AuthUser): Promise<AccountView> {
  const profile = await ensureProfile(user.id);
  return {
    user: {
      id: user.id,
      email: user.email || null,
      role: user.role,
      createdAt: user.createdAt,
      emailConfirmedAt: user.emailConfirmedAt,
      emailStatus: user.emailConfirmedAt ? 'verified' : 'pending',
    },
    profile,
    session: {
      issuedAt: user.issuedAt,
      expiresAt: user.expiresAt,
    },
    deletion: {
      pending: user.accountStatus === 'deletion_pending',
      requestedAt: profile.deletion_requested_at,
      scheduledFor: profile.deletion_scheduled_for,
    },
  };
}

export async function changePassword(
  user: AuthUser,
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  validatePasswordPair(currentPassword, newPassword);
  const client = createUserClient(accessToken);
  const { error } = await client.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });
  if (error) {
    if (error.status === 400 || error.status === 401 || error.status === 422) {
      throw new AppError('REAUTH_FAILED', 401, '当前密码不正确或新密码不符合要求', {
        fields: { currentPassword: '请重新输入当前密码' },
      });
    }
    throw new AppError('SERVER_ERROR', 500, '密码暂时无法更新，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }

  await recordAuditEvent({
    actorUserId: user.id,
    action: 'account.password_changed',
    targetType: 'account',
    targetId: user.id,
    metadata: {},
  });

  try {
    await getAdminClient().auth.admin.signOut(accessToken, 'global');
  } catch (error) {
    console.warn('[account] password changed but session revocation was deferred:', error instanceof Error ? error.message : 'unknown');
  }
}

export async function logoutCurrent(accessToken: string): Promise<void> {
  try {
    await getAdminClient().auth.admin.signOut(accessToken, 'local');
  } catch (error) {
    console.warn('[account] current session revocation failed:', error instanceof Error ? error.message : 'unknown');
  }
}

export async function logoutAll(
  user: AuthUser,
  accessToken: string,
  currentPassword: string,
): Promise<void> {
  const temporaryToken = await verifyCurrentPassword(user, currentPassword);
  const { error } = await getAdminClient().auth.admin.signOut(accessToken, 'global');
  if (error) {
    await revokeTemporarySession(temporaryToken);
    throw new AppError('SERVER_ERROR', 503, '暂时无法退出所有设备，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }
  await recordAuditEvent({
    actorUserId: user.id,
    action: 'account.logout_all',
    targetType: 'account',
    targetId: user.id,
    metadata: {},
  });
}

export async function requestDeletion(
  user: AuthUser,
  accessToken: string,
  input: DeletionInput,
): Promise<AccountView['deletion']> {
  if (user.accountStatus === 'deletion_pending') {
    const profile = await ensureProfile(user.id);
    return {
      pending: true,
      requestedAt: profile.deletion_requested_at,
      scheduledFor: profile.deletion_scheduled_for,
    };
  }
  if (!input.acknowledged) {
    throw new AppError('VALIDATION_FAILED', 400, '请确认你了解永久删除的后果', {
      fields: { acknowledged: '需要确认后才能继续' },
    });
  }
  if (!accountEmailMatches(user.email || '', input.confirmEmail)) {
    throw new AppError('VALIDATION_FAILED', 400, '输入的邮箱与当前账号不一致', {
      fields: { confirmEmail: '请输入完整账号邮箱' },
    });
  }

  const temporaryToken = await verifyCurrentPassword(user, input.currentPassword);
  const schedule = deletionSchedule();
  const { error } = await getAdminClient()
    .from('profiles')
    .update({
      account_status: 'deletion_pending',
      deletion_requested_at: schedule.requestedAt,
      deletion_scheduled_for: schedule.scheduledFor,
      updated_at: schedule.requestedAt,
    })
    .eq('user_id', user.id);
  if (error) {
    await revokeTemporarySession(temporaryToken);
    throw new AppError('SERVER_ERROR', 500, '注销申请暂时无法提交，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }

  try {
    await createSystemJob(
      'delete_account',
      { target_user_id: user.id },
      { runAt: new Date(schedule.scheduledFor), maxAttempts: 10 },
    );
  } catch (jobError) {
    await getAdminClient()
      .from('profiles')
      .update({
        account_status: 'active',
        deletion_requested_at: null,
        deletion_scheduled_for: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
    await revokeTemporarySession(temporaryToken);
    throw new AppError('SERVER_ERROR', 500, '注销任务暂时无法安排，请稍后重试', {
      retryable: true,
      cause: jobError,
    });
  }

  await recordAuditEvent({
    actorUserId: user.id,
    action: 'account.deletion_requested',
    targetType: 'account',
    targetId: user.id,
    metadata: { scheduledFor: schedule.scheduledFor },
  });

  try {
    const { error: sessionError } = await getAdminClient().auth.admin.signOut(accessToken, 'global');
    if (sessionError) throw sessionError;
  } catch (error) {
    await revokeTemporarySession(temporaryToken);
    throw new AppError('SERVER_ERROR', 503, '注销申请已记录，但会话暂时无法撤销，请重新登录后重试', {
      retryable: true,
      cause: error,
    });
  }

  return {
    pending: true,
    requestedAt: schedule.requestedAt,
    scheduledFor: schedule.scheduledFor,
  };
}

export async function cancelDeletion(
  user: AuthUser,
  currentPassword: string,
): Promise<AccountView['deletion']> {
  const temporaryToken = await verifyCurrentPassword(user, currentPassword);
  try {
    const { error } = await getAdminClient()
      .from('profiles')
      .update({
        account_status: 'active',
        deletion_requested_at: null,
        deletion_scheduled_for: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
    if (error) {
      throw new AppError('SERVER_ERROR', 500, '暂时无法取消注销，请稍后重试', {
        retryable: true,
        cause: error,
      });
    }
    await getAdminClient()
      .from('jobs')
      .update({
        status: 'succeeded',
        payload: {},
        result: { cancelled: true },
        updated_at: new Date().toISOString(),
      })
      .eq('job_type', 'delete_account')
      .eq('status', 'pending')
      .filter('payload->>target_user_id', 'eq', user.id);
    await recordAuditEvent({
      actorUserId: user.id,
      action: 'account.deletion_cancelled',
      targetType: 'account',
      targetId: user.id,
      metadata: {},
    });
  } finally {
    await revokeTemporarySession(temporaryToken);
  }
  return { pending: false, requestedAt: null, scheduledFor: null };
}

async function verifyCurrentPassword(user: AuthUser, password: string): Promise<string> {
  if (!password) {
    throw new AppError('VALIDATION_FAILED', 400, '请输入当前密码', {
      fields: { currentPassword: '请输入当前密码' },
    });
  }
  if (!user.email) {
    throw new AppError('REAUTH_FAILED', 401, '当前账号无法完成密码验证');
  }
  const result = await forwardSupabaseAuth({
    path: 'token?grant_type=password',
    body: { email: user.email, password },
  });
  if (result.status === 200) {
    return parseAuthSession(result.body).accessToken;
  }
  if (result.status === 429) {
    throw new AppError('RATE_LIMITED', 429, '密码尝试次数过多，请稍后再试', {
      retryable: true,
    });
  }
  if (result.status === 400 || result.status === 401 || result.status === 422) {
    throw new AppError('REAUTH_FAILED', 401, '当前密码不正确', {
      fields: { currentPassword: '当前密码不正确' },
    });
  }
  throw new AppError('NETWORK_UNAVAILABLE', 503, '密码验证服务暂时不可用，请稍后重试', {
    retryable: true,
  });
}

function parseAuthSession(body: string): { accessToken: string; refreshToken: string } {
  try {
    const parsed = JSON.parse(body) as { access_token?: string; refresh_token?: string };
    if (!parsed.access_token || !parsed.refresh_token) throw new Error('missing session');
    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
    };
  } catch {
    throw new AppError('SERVER_ERROR', 500, '密码验证结果无效，请稍后重试', {
      retryable: true,
    });
  }
}

async function revokeTemporarySession(accessToken: string): Promise<void> {
  try {
    await getAdminClient().auth.admin.signOut(accessToken, 'local');
  } catch (error) {
    console.warn('[account] temporary reauthentication session cleanup failed:', error instanceof Error ? error.message : 'unknown');
  }
}

function validatePasswordPair(currentPassword: string, newPassword: string): void {
  if (!currentPassword) {
    throw new AppError('VALIDATION_FAILED', 400, '请输入当前密码', {
      fields: { currentPassword: '请输入当前密码' },
    });
  }
  if (String(newPassword || '').length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    throw new AppError('VALIDATION_FAILED', 400, '新密码至少 8 位并同时包含字母和数字', {
      fields: { newPassword: '至少 8 位，并包含字母和数字' },
    });
  }
  if (currentPassword === newPassword) {
    throw new AppError('VALIDATION_FAILED', 400, '新密码不能与当前密码相同', {
      fields: { newPassword: '请设置一个不同的新密码' },
    });
  }
}

import { randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { sha256 } from '../lib/hash.js';
import { ensureProfile } from '../middleware/auth.js';
import {
  getAdminClient,
} from '../storage/database/supabase-client.js';
import { forwardSupabaseAuth } from './auth-proxy.js';
import type { AuthUser } from '../types/index.js';

const INVITE_TTL_DAYS = 7;
const CLAIM_TTL_MINUTES = 10;
const MAX_INVITE_FAILURES = 10;

interface InvitationRow {
  id: string;
  email_normalized: string;
  token_hash: string;
  created_by: string;
  auth_user_id: string | null;
  expires_at: string;
  status: 'active' | 'claimed' | 'used' | 'revoked' | 'needs_attention';
  claim_id: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  created_at: string;
}

export interface CreatedInvitation {
  id: string;
  email: string;
  expiresAt: string;
  inviteUrl: string;
}

export interface ValidatedInvitation {
  email: string;
  expiresAt: string;
}

export interface InviteRegistration {
  token: string;
  nickname: string;
  password: string;
  confirmPassword: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface InvitationSummary {
  id: string;
  email: string;
  status: 'active' | 'claimed' | 'used' | 'revoked' | 'expired' | 'needs_attention';
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
}

export function createInviteCredential(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token) };
}

export function normalizeInviteEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function buildInviteUrl(origin: string, token: string): string {
  const url = new URL('register.html', origin.endsWith('/') ? origin : `${origin}/`);
  url.hash = `invite=${encodeURIComponent(token)}`;
  return url.toString();
}

export function compensationStatus(input: {
  authUserCreated: boolean;
  cleanupSucceeded: boolean;
}): 'active' | 'needs_attention' {
  if (!input.cleanupSucceeded) return 'needs_attention';
  if (input.authUserCreated) return 'active';
  return 'active';
}

export async function createInvitation(
  owner: AuthUser,
  email: string,
  origin: string,
): Promise<CreatedInvitation> {
  if (owner.role !== 'owner') {
    throw new AppError('PERMISSION_DENIED', 403, '当前账号无权管理邀请');
  }
  const normalizedEmail = normalizeInviteEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError('VALIDATION_FAILED', 400, '请输入有效邮箱', {
      fields: { email: '请输入有效邮箱' },
    });
  }

  const admin = getAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  await admin
    .from('invitations')
    .update({ status: 'revoked', revoked_at: nowIso })
    .eq('email_normalized', normalizedEmail)
    .is('used_at', null)
    .is('revoked_at', null)
    .lte('expires_at', nowIso);

  const credential = createInviteCredential();
  const expiresAt = new Date(
    now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await admin
    .from('invitations')
    .insert({
      email_normalized: normalizedEmail,
      token_hash: credential.tokenHash,
      created_by: owner.id,
      expires_at: expiresAt,
      status: 'active',
    })
    .select('id,email_normalized,expires_at')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError('CONFLICT', 409, '这个邮箱已经有一条有效邀请');
    }
    throw new AppError('SERVER_ERROR', 500, '邀请暂时无法创建，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }

  return {
    id: data.id as string,
    email: data.email_normalized as string,
    expiresAt: data.expires_at as string,
    inviteUrl: buildInviteUrl(origin, credential.token),
  };
}

export async function validateInvitation(token: string): Promise<ValidatedInvitation> {
  const invite = await resolveInvitation(token);
  return {
    email: invite.email_normalized,
    expiresAt: invite.expires_at,
  };
}

export async function registerWithInvitation(input: InviteRegistration): Promise<AuthSession> {
  const invite = await resolveInvitation(input.token);
  try {
    validateRegistrationInput(input);
  } catch (error) {
    await recordInviteFailure(invite);
    throw error;
  }
  const claimId = randomUUID();
  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + CLAIM_TTL_MINUTES * 60 * 1000).toISOString();
  const admin = getAdminClient();

  const { data: claimed, error: claimError } = await admin
    .from('invitations')
    .update({
      status: 'claimed',
      claim_id: claimId,
      claimed_at: now.toISOString(),
      claim_expires_at: claimExpiresAt,
    })
    .eq('id', invite.id)
    .eq('status', 'active')
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .select('*')
    .maybeSingle();
  if (claimError) {
    throw new AppError('SERVER_ERROR', 500, '邀请暂时无法处理，请稍后重试', {
      retryable: true,
      cause: claimError,
    });
  }
  if (!claimed) {
    throw new AppError('CONFLICT', 409, '邀请正在处理或已经失效，请刷新页面');
  }

  let authUserId: string | null = null;
  let cleanupSucceeded = true;
  try {
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: invite.email_normalized,
      password: input.password,
      email_confirm: false,
      app_metadata: { role: 'user' },
      user_metadata: { display_name: input.nickname },
    });
    if (authError || !created.user) {
      await releaseClaim(invite.id, claimId);
      throw new AppError('CONFLICT', 409, '该邮箱暂时无法完成注册，请联系 Owner 重新邀请');
    }
    authUserId = created.user.id;

    const { data: linked, error: linkError } = await admin
      .from('invitations')
      .update({ auth_user_id: authUserId })
      .eq('id', invite.id)
      .eq('claim_id', claimId)
      .eq('status', 'claimed')
      .select('id')
      .maybeSingle();
    if (linkError || !linked) throw linkError || new Error('invitation claim changed');

    await ensureProfile(authUserId, input.nickname);

    const usedAt = new Date().toISOString();
    const { data: used, error: useError } = await admin
      .from('invitations')
      .update({
        status: 'used',
        used_at: usedAt,
        used_by: authUserId,
        auth_user_id: authUserId,
        claim_expires_at: null,
      })
      .eq('id', invite.id)
      .eq('claim_id', claimId)
      .eq('status', 'claimed')
      .select('id')
      .maybeSingle();
    if (useError || !used) throw useError || new Error('invitation claim was lost');
  } catch (error) {
    await recordInviteFailure(invite);
    if (authUserId) {
      cleanupSucceeded = await deleteCreatedUser(authUserId);
    }
    const nextStatus = compensationStatus({
      authUserCreated: Boolean(authUserId),
      cleanupSucceeded,
    });
    await setInvitationRecoveryStatus(invite.id, claimId, nextStatus);
    if (error instanceof AppError) throw error;
    throw new AppError('SERVER_ERROR', 500, '账号初始化失败，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }

  return loginAfterRegistration(invite.email_normalized, input.password);
}

export async function listInvitations(owner: AuthUser): Promise<InvitationSummary[]> {
  if (owner.role !== 'owner') {
    throw new AppError('PERMISSION_DENIED', 403, '当前账号无权查看邀请');
  }
  const { data, error } = await getAdminClient()
    .from('invitations')
    .select('id,email_normalized,status,expires_at,created_at,used_at')
    .eq('created_by', owner.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '邀请列表暂时无法读取', {
      retryable: true,
      cause: error,
    });
  }
  const now = Date.now();
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    email: String(row.email_normalized),
    status: row.status === 'active' && Date.parse(String(row.expires_at)) <= now
      ? 'expired'
      : row.status as InvitationSummary['status'],
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    usedAt: row.used_at ? String(row.used_at) : null,
  }));
}

export async function revokeInvitation(owner: AuthUser, id: string): Promise<void> {
  if (owner.role !== 'owner') {
    throw new AppError('PERMISSION_DENIED', 403, '当前账号无权撤销邀请');
  }
  const now = new Date().toISOString();
  const { data, error } = await getAdminClient()
    .from('invitations')
    .update({
      status: 'revoked',
      revoked_at: now,
      claim_expires_at: null,
    })
    .eq('id', id)
    .eq('created_by', owner.id)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('id');
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '邀请暂时无法撤销', {
      retryable: true,
      cause: error,
    });
  }
  if (!data || data.length === 0) {
    throw new AppError('NOT_FOUND', 404, '邀请不存在或已经使用');
  }
}

export async function recoverExpiredInvitationClaims(now = new Date()): Promise<number> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('invitations')
    .select('id')
    .eq('status', 'claimed')
    .lte('claim_expires_at', now.toISOString())
    .limit(100);
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '邀请恢复任务无法读取待处理记录', {
      retryable: true,
      cause: error,
    });
  }
  let recovered = 0;
  for (const row of data ?? []) {
    const { error: updateError } = await admin
      .from('invitations')
      .update({
        status: 'needs_attention',
        claim_expires_at: null,
      })
      .eq('id', row.id)
      .eq('status', 'claimed');
    if (!updateError) recovered++;
  }
  return recovered;
}

async function resolveInvitation(token: string): Promise<InvitationRow> {
  const normalizedToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,}$/.test(normalizedToken)) {
    throw new AppError('INVITE_INVALID', 404, '邀请链接无效，请联系 Owner 重新获取');
  }
  const tokenHash = sha256(normalizedToken);
  const { data, error } = await getAdminClient()
    .from('invitations')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) {
    throw new AppError('SERVER_ERROR', 500, '邀请暂时无法验证，请稍后重试', {
      retryable: true,
      cause: error,
    });
  }
  if (!data) {
    throw new AppError('INVITE_INVALID', 404, '邀请链接无效，请联系 Owner 重新获取');
  }
  const invite = data as unknown as InvitationRow;
  if (invite.attempt_count >= MAX_INVITE_FAILURES) {
    throw new AppError('INVITE_INVALID', 429, '邀请尝试次数过多，请联系 Owner 重新邀请');
  }
  if (invite.revoked_at || invite.status === 'revoked') {
    throw new AppError('INVITE_INVALID', 404, '邀请已撤销，请联系 Owner 重新获取');
  }
  if (invite.used_at || invite.status === 'used') {
    throw new AppError('INVITE_INVALID', 409, '邀请已经使用，请直接登录');
  }
  if (invite.status === 'claimed') {
    throw new AppError('INVITE_INVALID', 409, '邀请正在处理中，请稍后再试');
  }
  if (invite.status === 'needs_attention') {
    throw new AppError('INVITE_INVALID', 409, '邀请需要 Owner 处理，请联系邀请人');
  }
  if (invite.status !== 'active') {
    throw new AppError('INVITE_INVALID', 404, '邀请链接无效');
  }
  if (Date.parse(invite.expires_at) <= Date.now()) {
    throw new AppError('INVITE_EXPIRED', 410, '邀请已过期，请联系 Owner 重新获取');
  }
  return invite;
}

function validateRegistrationInput(input: InviteRegistration): void {
  const nickname = String(input.nickname || '').trim();
  if (nickname.length < 1 || nickname.length > 30) {
    throw new AppError('VALIDATION_FAILED', 400, '昵称需要 1 到 30 个字符', {
      fields: { nickname: '昵称需要 1 到 30 个字符' },
    });
  }
  if (String(input.password || '').length < 8 || !/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
    throw new AppError('VALIDATION_FAILED', 400, '密码至少 8 位并同时包含字母和数字', {
      fields: { password: '至少 8 位，并包含字母和数字' },
    });
  }
  if (input.password !== input.confirmPassword) {
    throw new AppError('VALIDATION_FAILED', 400, '两次输入的密码不一致', {
      fields: { confirmPassword: '两次输入的密码不一致' },
    });
  }
}

async function releaseClaim(invitationId: string, claimId: string): Promise<void> {
  await getAdminClient()
    .from('invitations')
    .update({
      status: 'active',
      claim_id: null,
      claimed_at: null,
      claim_expires_at: null,
    })
    .eq('id', invitationId)
    .eq('claim_id', claimId)
    .eq('status', 'claimed');
}

async function setInvitationRecoveryStatus(
  invitationId: string,
  claimId: string,
  status: 'active' | 'needs_attention',
): Promise<void> {
  await getAdminClient()
    .from('invitations')
    .update({
      status,
      claim_id: status === 'needs_attention' ? claimId : null,
      claimed_at: status === 'needs_attention' ? new Date().toISOString() : null,
      claim_expires_at: status === 'needs_attention' ? null : null,
    })
    .eq('id', invitationId)
    .eq('claim_id', claimId)
    .eq('status', 'claimed');
}

async function deleteCreatedUser(userId: string): Promise<boolean> {
  try {
    const { error } = await getAdminClient().auth.admin.deleteUser(userId);
    return !error;
  } catch {
    return false;
  }
}

async function recordInviteFailure(invite: InvitationRow): Promise<void> {
  try {
    const { error } = await getAdminClient()
      .from('invitations')
      .update({
        attempt_count: invite.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', invite.id)
      .eq('attempt_count', invite.attempt_count);
    if (error) throw error;
  } catch (error) {
    console.warn('[invitations] failed to record attempt:', error instanceof Error ? error.message : 'unknown');
  }
}

async function loginAfterRegistration(email: string, password: string): Promise<AuthSession> {
  const result = await forwardSupabaseAuth({
    path: 'token?grant_type=password',
    body: { email, password },
  });
  if (result.status !== 200) {
    throw new AppError('SERVER_ERROR', 503, '账号已创建，请稍后使用邮箱和密码登录', {
      retryable: true,
    });
  }
  try {
    const body = JSON.parse(result.body) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!body.access_token || !body.refresh_token) throw new Error('missing session');
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: Number(body.expires_in || 0),
      tokenType: body.token_type || 'bearer',
    };
  } catch (error) {
    throw new AppError('SERVER_ERROR', 500, '账号已创建，但自动登录失败，请返回登录页', {
      retryable: true,
      cause: error,
    });
  }
}

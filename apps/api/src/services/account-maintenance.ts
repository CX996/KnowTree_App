import { AppError } from '../lib/errors.js';
import { getAdminClient } from '../storage/database/supabase-client.js';

export async function permanentlyDeleteDueAccount(userId: string): Promise<{
  deleted: boolean;
  skipped?: 'not_due' | 'not_pending';
}> {
  const admin = getAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('user_id,account_status,deletion_scheduled_for')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError) {
    throw new AppError('SERVER_ERROR', 500, '无法读取注销状态', {
      retryable: true,
      cause: profileError,
    });
  }
  if (!profile) {
    return { deleted: true };
  }
  if (profile.account_status !== 'deletion_pending') {
    return { deleted: false, skipped: 'not_pending' };
  }
  if (!profile.deletion_scheduled_for || Date.parse(profile.deletion_scheduled_for) > Date.now()) {
    return { deleted: false, skipped: 'not_due' };
  }

  const { data: authResult, error: authLookupError } = await admin.auth.admin.getUserById(userId);
  if (authLookupError && authLookupError.status !== 404) {
    throw new AppError('SERVER_ERROR', 500, '无法读取待注销账号', {
      retryable: true,
      cause: authLookupError,
    });
  }
  const email = authResult?.user?.email?.trim().toLowerCase() || '';

  await admin.from('error_events').delete().eq('user_id', userId);
  await admin.from('audit_events').delete().eq('actor_user_id', userId);
  await admin.from('invitations').delete().eq('auth_user_id', userId);
  await admin.from('invitations').delete().eq('used_by', userId);
  if (email) {
    await admin.from('invitations').delete().eq('email_normalized', email);
  }

  if (authResult?.user) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
    if (deleteError) {
      throw new AppError('SERVER_ERROR', 500, '账号暂时无法永久删除', {
        retryable: true,
        cause: deleteError,
      });
    }
  }

  await admin.from('audit_events').insert({
    actor_user_id: null,
    action: 'account.deleted',
    target_type: 'account',
    target_id: null,
    metadata: {},
  });
  return { deleted: true };
}

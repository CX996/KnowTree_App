import { getAdminClient } from '../storage/database/supabase-client.js';

const SENSITIVE_KEY = /(?:email|password|token|secret|authorization|body|content)/i;

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> = {},
): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === 'string') output[key] = value.slice(0, 160);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      output[key] = value;
    }
  }
  return output;
}

export async function recordAuditEvent(input: {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await getAdminClient().from('audit_events').insert({
      actor_user_id: input.actorUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      metadata: sanitizeAuditMetadata(input.metadata),
    });
    if (error) throw error;
  } catch (error) {
    console.warn('[audit] event write failed:', error instanceof Error ? error.message : 'unknown');
  }
}

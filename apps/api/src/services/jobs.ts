import { claimDueJobs, completeJob, failJob } from '../lib/task.js';
import { parseEntry, classifyEntry, linkEntry } from './entries.js';
import { generateDailyRecall } from './recalls.js';
import { permanentlyDeleteDueAccount } from './account-maintenance.js';
import { purgeExpiredTrash } from './trash.js';
import { recoverExpiredInvitationClaims } from './invitations.js';
import { purgeOldErrorEvents } from './error-events.js';
import type { Job } from '../types/index.js';

/** 任务分发：按 job_type 执行对应业务逻辑 */
export async function processJob(job: Job): Promise<void> {
  const userId = job.user_id;

  switch (job.job_type) {
    case 'delete_account': {
      const targetUserId = typeof job.payload?.target_user_id === 'string'
        ? job.payload.target_user_id
        : '';
      if (!targetUserId) throw new Error('注销任务缺少目标账号');
      const result = await permanentlyDeleteDueAccount(targetUserId);
      await completeJob(job.id, {
        deleted: result.deleted,
        skipped: result.skipped ?? null,
      }, { clearPayload: true });
      return;
    }
    case 'cleanup_trash': {
      const deleted = await purgeExpiredTrash();
      await completeJob(job.id, { deleted });
      return;
    }
    case 'invite_recovery': {
      const recovered = await recoverExpiredInvitationClaims();
      await completeJob(job.id, { recovered });
      return;
    }
    default:
      break;
  }

  if (!userId) throw new Error('任务缺少用户上下文');

  switch (job.job_type) {
    case 'parse': {
      const payload = job.payload as { entry_id: string; url?: string | null };
      const entry = await parseEntry(userId, payload.entry_id, payload.url);
      await completeJob(job.id, { entry_id: entry.id, status: entry.status });
      return;
    }
    case 'classify': {
      const payload = job.payload as { entry_id: string };
      const entry = await classifyEntry(userId, payload.entry_id);
      await completeJob(job.id, {
        entry_id: payload.entry_id,
        classification_status: entry.classification_status,
        confidence: Number(entry.classification_confidence ?? 0),
        suggested_category_id: (entry as unknown as { suggested_category_id?: string | null }).suggested_category_id ?? null,
      });
      return;
    }
    case 'link': {
      const payload = job.payload as { entry_id: string };
      const result = await linkEntry(userId, payload.entry_id);
      await completeJob(job.id, { entry_id: payload.entry_id, linked_count: result.count });
      return;
    }
    case 'dedupe': {
      // 去重（哈希/向量）在收录与实时检索中完成；此处保留任务类型以支持异步调度语义
      await completeJob(job.id, { note: 'dedupe 已由收录流程/检索实时处理' });
      return;
    }
    case 'daily_recall': {
      const payload = job.payload as { date?: string };
      const result = await generateDailyRecall(userId, payload.date);
      await completeJob(job.id, { date: result.date, created: result.created });
      return;
    }
    default:
      throw new Error(`不支持的任务类型: ${job.job_type}`);
  }
}

/** 消费一次到期任务（供定时器与手动触发调用） */
export async function runDueJobs(limit = 5): Promise<{ claimed: number; processed: number }> {
  const jobs = await claimDueJobs(limit);
  let processed = 0;
  for (const job of jobs) {
    try {
      await processJob(job);
      processed++;
    } catch (e) {
      await failJob(job, e);
    }
  }
  return { claimed: jobs.length, processed };
}

export async function runMaintenance(now = new Date()): Promise<{
  trashDeleted: number;
  invitationClaimsRecovered: number;
  errorEventsDeleted: number;
}> {
  const [trashDeleted, invitationClaimsRecovered, errorEventsDeleted] = await Promise.all([
    purgeExpiredTrash(now),
    recoverExpiredInvitationClaims(now),
    purgeOldErrorEvents(now),
  ]);
  return { trashDeleted, invitationClaimsRecovered, errorEventsDeleted };
}

import { claimDueJobs, completeJob, failJob } from '../lib/task';
import { parseEntry, classifyEntry, linkEntry } from './entries';
import { generateDailyRecall } from './recalls';
import type { Job } from '../types';

/** 任务分发：按 job_type 执行对应业务逻辑 */
export async function processJob(job: Job, forwardHeaders?: Record<string, string>): Promise<void> {
  const userId = job.user_id;
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
      const entry = await classifyEntry(userId, payload.entry_id, forwardHeaders);
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
export async function runDueJobs(limit = 5, forwardHeaders?: Record<string, string>): Promise<{ claimed: number; processed: number }> {
  const jobs = await claimDueJobs(limit);
  let processed = 0;
  for (const job of jobs) {
    try {
      await processJob(job, forwardHeaders);
      processed++;
    } catch (e) {
      await failJob(job, e);
    }
  }
  return { claimed: jobs.length, processed };
}
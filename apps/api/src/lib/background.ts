import { waitUntil } from '@vercel/functions';
import { runOutsideUserClient } from '../storage/database/supabase-client.js';

type Scheduler = (promise: Promise<unknown>) => void;

/**
 * 将响应后的工作交给 Vercel waitUntil。任务显式脱离用户 RLS 上下文，
 * 由后台 secret client 处理队列。
 */
export function scheduleBackgroundTask(
  task: () => Promise<unknown>,
  scheduler?: Scheduler,
): Promise<unknown> {
  const work = Promise.resolve()
    .then(() => runOutsideUserClient(task))
    .catch((error) => {
      console.error('[background] task failed:', error);
      return undefined;
    });

  if (scheduler) {
    scheduler(work);
  } else if (process.env.VERCEL) {
    waitUntil(work);
  }
  return work;
}

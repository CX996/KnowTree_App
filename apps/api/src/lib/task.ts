import { getSupabaseClient } from '../storage/database/supabase-client.js';
import type { Job, JobType } from '../types/index.js';

export interface NewJobInput {
  user_id: string | null;
  job_type: JobType;
  payload: Record<string, unknown>;
  max_attempts?: number;
  run_at?: Date;
}

/** 创建任务（写入 jobs 队列） */
export async function createJob(input: NewJobInput): Promise<Job> {
  const client = getSupabaseClient();
  const row = {
    user_id: input.user_id,
    job_type: input.job_type,
    payload: input.payload,
    status: 'pending',
    attempt_count: 0,
    max_attempts: input.max_attempts ?? 3,
    next_run_at: (input.run_at ?? new Date()).toISOString(),
  };
  const { data, error } = await client.from('jobs').insert(row).select().single();
  if (error) throw new Error(`创建任务失败: ${error.message}`);
  return data as unknown as Job;
}

/** 抢占一批到期、尚未超过最大尝试次数的 pending 任务（原子更新为 running） */
export async function claimDueJobs(limit: number): Promise<Job[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('claim_due_jobs', { p_limit: limit });
  if (error) throw new Error(`抢占任务失败: ${error.message}`);
  return (data ?? []) as Job[];
}

/** 标记任务成功 */
export async function completeJob(jobId: string, result?: Record<string, unknown>): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('jobs')
    .update({ status: 'succeeded', result: result ?? null, last_error: null, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`完成任务失败: ${error.message}`);
}

/** 标记任务失败：未超次数则退避重试，否则置为 failed */
export async function failJob(job: Job, err: unknown): Promise<void> {
  const client = getSupabaseClient();
  const message = err instanceof Error ? err.message : String(err);
  const attempt = (job.attempt_count ?? 0) + 1;
  const givingUp = attempt >= Math.max(job.max_attempts, 1);
  const backoffSec = Math.pow(2, attempt) * 30; // 指数退避：30s、60s、120s...
  const patch: Record<string, unknown> = {
    attempt_count: attempt,
    last_error: message,
    updated_at: new Date().toISOString(),
  };
  patch.status = givingUp ? 'failed' : 'pending';
  if (!givingUp) patch.next_run_at = new Date(Date.now() + backoffSec * 1000).toISOString();
  const { error } = await client.from('jobs').update(patch as any).eq('id', job.id);
  if (error) throw new Error(`标记任务失败: ${error.message}`);
}

export async function listJobs(userId: string, opts: { status?: string; page?: number; size?: number } = {}): Promise<Job[]> {
  const client = getSupabaseClient();
  const page = opts.page ?? 1;
  const size = opts.size ?? 20;
  let q = client.from('jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (opts.status) q = q.eq('status', opts.status);
  q = q.range((page - 1) * size, page * size - 1);
  const { data, error } = await q;
  if (error) throw new Error(`查询任务失败: ${error.message}`);
  return (data ?? []) as unknown as Job[];
}

export async function getJob(userId: string, id: string): Promise<Job | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('jobs').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`查询任务失败: ${error.message}`);
  return (data as unknown as Job) ?? null;
}

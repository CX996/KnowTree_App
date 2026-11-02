import { getSupabaseClient } from '../storage/database/supabase-client';
import { ensureProfile } from '../middleware/auth';
import type { DailyRecall } from '../types';

function todayStr(date?: string): string {
  return date ?? new Date().toISOString().slice(0, 10);
}

/** 按权重加权随机抽取（不放回） */
function weightedPick<T extends { score: number }>(items: T[], n: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const total = pool.reduce((s, it) => s + Math.max(it.score, 0.001), 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let k = 0; k < pool.length; k++) {
      r -= Math.max(pool[k].score, 0.001);
      if (r <= 0) {
        idx = k;
        break;
      }
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

/**
 * 生成每日回溯：从知识库按权重 + 久未回看程度抽取 1-3 条，写入当日计划。
 * 权重越高、越久未回看的条目越容易被抽中。
 */
export async function generateDailyRecall(userId: string, date?: string): Promise<{ date: string; created: number; items: DailyRecall[]; existing: DailyRecall[] }> {
  const profile = await ensureProfile(userId);
  const count = Math.min(Math.max(profile.daily_recall_count ?? 3, 1), 3);
  const client = getSupabaseClient();
  const target = todayStr(date);

  const { data: existingRes } = await client.from('daily_recalls').select('*').eq('user_id', userId).eq('recall_date', target);
  const existing = ((existingRes ?? []) as unknown as DailyRecall[]).map((r) => ({ ...r }));
  const existingIds = new Set(existing.map((r) => (r as unknown as { entry_id: string }).entry_id));

  const { data: candidates, error } = await client
    .from('entries')
    .select('id,weight,last_recalled_at,recall_count,created_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`读取条目失败: ${error.message}`);

  const candidateList = (candidates ?? []).filter((c) => !existingIds.has(c.id as string)) as Array<{
    id: string;
    weight: number;
    last_recalled_at: string | null;
    recall_count: number;
  }>;
  if (candidateList.length === 0) {
    return { date: target, created: 0, items: existing, existing };
  }

  const now = Date.now();
  const scored = candidateList.map((c) => {
    const last = c.last_recalled_at ? new Date(c.last_recalled_at).getTime() : 0;
    const daysSince = last ? Math.max(0, (now - last) / 86400000) : 999;
    const recency = Math.min(1, daysSince / 30);
    return { ...c, score: (c.weight ?? 1) * (0.3 + 0.7 * recency) };
  });

  const picked = weightedPick(scored, Math.min(count, scored.length));

  const { data: inserted, error: insErr } = await client
    .from('daily_recalls')
    .insert(
      picked.map((c) => ({
        user_id: userId,
        entry_id: c.id,
        recall_date: target,
        weight: c.weight ?? 1,
        status: 'pending',
      })),
    )
    .select();
  if (insErr) throw new Error(`写入回溯失败: ${insErr.message}`);

  for (const c of picked) {
    await client
      .from('entries')
      .update({ last_recalled_at: new Date().toISOString(), recall_count: (c.recall_count ?? 0) + 1 })
      .eq('id', c.id)
      .eq('user_id', userId);
  }

  const items = (inserted ?? []) as unknown as DailyRecall[];
  return { date: target, created: items.length, items, existing };
}

export async function listRecalls(userId: string, date?: string): Promise<DailyRecall[]> {
  const client = getSupabaseClient();
  const target = todayStr(date);
  const { data, error } = await client.from('daily_recalls').select('*').eq('user_id', userId).eq('recall_date', target).order('created_at', { ascending: true });
  if (error) throw new Error(`查询回溯失败: ${error.message}`);
  return (data ?? []) as unknown as DailyRecall[];
}

export async function updateRecall(userId: string, id: string, status: 'pending' | 'done' | 'skipped'): Promise<DailyRecall> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('daily_recalls').update({ status }).eq('user_id', userId).eq('id', id).select().single();
  if (error) throw new Error(`更新回溯失败: ${error.message}`);
  return data as unknown as DailyRecall;
}
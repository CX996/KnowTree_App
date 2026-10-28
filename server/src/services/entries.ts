import { getSupabaseClient } from '../storage/database/supabase-client';
import { getPool } from '../lib/pg';
import { contentHash, sha256, urlHash } from '../lib/hash';
import { canonicalizeUrl, htmlToText, normalizeContent, truncateText } from '../lib/text';
import { embedText, classifyContent } from './ai';
import { listCategories, createCategory } from './categories';
import { ensureProfile } from '../middleware/auth';
import { createJob } from '../lib/task';
import type { Entry, EntryVersion, EntryStatus } from '../types';

// entries 对 categories 存在两个外键（category_id、suggested_category_id），
// 直接嵌套 `categories(...)` 会因关系不唯一报错，因此统一取平铺字段，分类名由调用方显式关联。
// 为避免 API 响应携带 1024 维向量，默认选择列不含 embedding；向量单独按需获取。
const ENTRY_SELECT =
  'id,user_id,source_id,category_id,title,summary,content,content_hash,source_url,capture_type,status,classification_status,classification_confidence,suggested_category_id,weight,recall_count,last_recalled_at,deleted_at,created_at,updated_at';

/** 仅查询条目的向量列（避免大数组随普通查询返回） */
export async function getEntryEmbedding(userId: string, entryId: string): Promise<number[] | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('entries').select('embedding').eq('id', entryId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`查询向量失败: ${error.message}`);
  const emb = (data as unknown as { embedding?: unknown } | null)?.embedding;
  return Array.isArray(emb) ? (emb as number[]) : null;
}

function vec(arr: number[]): string {
  return '[' + arr.join(',') + ']';
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function getEntry(userId: string, id: string): Promise<Entry | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('entries')
    .select(ENTRY_SELECT)
    .eq('user_id', userId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`查询条目失败: ${error.message}`);
  return (data as unknown as Entry) ?? null;
}

export interface ListEntriesOptions {
  status?: string;
  category_id?: string;
  classification?: string;
  query?: string;
  page?: number;
  size?: number;
}

export async function listEntries(userId: string, opts: ListEntriesOptions = {}): Promise<Entry[]> {
  const client = getSupabaseClient();
  const page = opts.page ?? 1;
  const size = opts.size ?? 20;
  let q = client.from('entries').select(ENTRY_SELECT).eq('user_id', userId).is('deleted_at', null);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.category_id) q = q.eq('category_id', opts.category_id);
  if (opts.classification) q = q.eq('classification_status', opts.classification);
  if (opts.query) q = q.or(`title.ilike.%${opts.query}%,content.ilike.%${opts.query}%`);
  q = q.order('created_at', { ascending: false }).range((page - 1) * size, page * size - 1);
  const { data, error } = await q;
  if (error) throw new Error(`查询条目失败: ${error.message}`);
  return (data ?? []) as unknown as Entry[];
}

export async function softDeleteEntry(userId: string, id: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('entries')
    .update({ deleted_at: nowIso(), updated_at: nowIso() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(`删除条目失败: ${error.message}`);
}

export async function updateEntry(
  userId: string,
  id: string,
  patch: { title?: string; content?: string; summary?: string | null; category_id?: string | null },
): Promise<Entry | null> {
  const client = getSupabaseClient();
  const upd: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.title !== undefined) upd.title = patch.title.trim();
  if (patch.content !== undefined) {
    const normalized = normalizeContent(patch.content);
    upd.content = normalized;
    upd.content_hash = contentHash(normalized);
  }
  if (patch.summary !== undefined) upd.summary = patch.summary;
  if (patch.category_id !== undefined) {
    upd.category_id = patch.category_id;
    if (patch.category_id) {
      upd.classification_status = 'auto';
      upd.classification_confidence = 1;
    } else {
      upd.classification_status = 'uncategorized';
    }
  }
  const { data, error } = await client
    .from('entries')
    .update(upd)
    .eq('id', id)
    .eq('user_id', userId)
    .select(ENTRY_SELECT)
    .single();
  if (error) throw new Error(`更新条目失败: ${error.message}`);
  return (data as unknown as Entry) ?? null;
}

// ---------------------------------------------------------------------------
// 收录（含哈希 / URL 去重、向量相近保守提示、任务编排）
// ---------------------------------------------------------------------------
export interface IngestPayload {
  url?: string;
  content?: string;
  title?: string;
  captureType?: 'web' | 'manual' | 'clip' | 'image';
}

export async function ingest(userId: string, payload: IngestPayload) {
  const client = getSupabaseClient();
  const url = payload.url?.trim();
  const rawContent = payload.content?.trim() ?? '';
  const title = payload.title?.trim() ?? '';
  const captureType = ['web', 'manual', 'clip', 'image'].includes(payload.captureType ?? '') ? payload.captureType! : 'manual';

  let sourceUrl: string | null = null;
  let sourceId: string | null = null;
  let needsParse = false;

  if (url) {
    const c = canonicalizeUrl(url);
    sourceUrl = c.canonical;
    const uh = urlHash(c.canonical);
    const { data: src } = await client
      .from('sources')
      .select('id')
      .eq('user_id', userId)
      .eq('url_hash', uh)
      .is('deleted_at', null)
      .maybeSingle();
    if (src) sourceId = src.id;
    if (!rawContent) needsParse = true;
  }

  const normalized = normalizeContent(rawContent);
  const body = rawContent ? normalized : '';
  const cHash = body ? contentHash(body) : sourceUrl ? urlHash(sourceUrl) : contentHash(title || 'untitled');

  // 1) 哈希去重：完全重复 → 合并权重，不新建
  if (body) {
    const { data: dup, error: dupErr } = await client
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('content_hash', cHash)
      .is('deleted_at', null)
      .maybeSingle();
    if (dupErr) throw new Error(`去重查询失败: ${dupErr.message}`);
    if (dup) {
      const weight = (dup.weight ?? 1) + 1;
      await client.from('entries').update({ weight, updated_at: nowIso() }).eq('id', dup.id).eq('user_id', userId);
      return { status: 'hash_duplicate', entry: dup, dup_of: dup.id, weight, message: '已存在相同内容，未重复收录（权重+1）', jobs: [] as string[] };
    }
  }

  // 2) 收录/复用 URL 来源
  if (url && sourceUrl && !sourceId) {
    const { data: src2, error: se } = await client
      .from('sources')
      .insert({ user_id: userId, url: sourceUrl, url_hash: urlHash(sourceUrl), domain: canonicalizeUrl(sourceUrl).domain, title: title || null })
      .select('id')
      .single();
    if (se) throw new Error(`记录来源失败: ${se.message}`);
    sourceId = src2.id;
  }

  // 3) 插入条目（并发下唯一约束兜底）
  let entry: Entry;
  try {
    const { data, error } = await client
      .from('entries')
      .insert({
        user_id: userId,
        source_id: sourceId,
        title: title || (sourceUrl ? canonicalizeUrl(sourceUrl).domain : '未命名知识'),
        content: body,
        content_hash: cHash,
        source_url: sourceUrl,
        capture_type: captureType,
        status: needsParse ? 'pending' : 'parsed',
        classification_status: 'uncategorized',
      })
      .select(ENTRY_SELECT)
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        const { data: dup } = await client.from('entries').select('*').eq('user_id', userId).eq('content_hash', cHash).is('deleted_at', null).maybeSingle();
        if (dup) {
          const weight = (dup.weight ?? 1) + 1;
          await client.from('entries').update({ weight, updated_at: nowIso() }).eq('id', dup.id).eq('user_id', userId);
          return { status: 'hash_duplicate', entry: dup, dup_of: dup.id, weight, message: '并发触发去重（权重+1）', jobs: [] as string[] };
        }
      }
      throw new Error(`收录失败: ${error.message}`);
    }
    entry = data as unknown as Entry;
  } catch (e) {
    throw e;
  }

  // 4) 向量相近去重建议（保守：仅提示，不自动合并）
  let dupSuggestions: Array<{ entry_id: string; title: string; similarity: number }> = [];
  if (body) {
    try {
      const emb = await embedText(`${title} ${body}`);
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT e.id AS entry_id, e.title, ROUND((1 - (e.embedding <=> $1::vector))::numeric, 4)::float AS similarity
         FROM entries e
         WHERE e.user_id = $2 AND e.deleted_at IS NULL AND e.embedding IS NOT NULL AND e.id <> $3
           AND (1 - (e.embedding <=> $1::vector)) >= 0.90
         ORDER BY e.embedding <=> $1::vector ASC
         LIMIT 5`,
        [vec(emb), userId, entry.id],
      );
      dupSuggestions = rows;
    } catch {
      // 向量化失败不阻断收录
    }
  }

  // 5) 编排后续任务：解析（如需）→ 归类 → 互链
  const jobs: string[] = [];
  if (needsParse) {
    const j = await createJob({ user_id: userId, job_type: 'parse', payload: { entry_id: entry.id, url: sourceUrl } });
    jobs.push(j.id);
  }
  const cj = await createJob({ user_id: userId, job_type: 'classify', payload: { entry_id: entry.id } });
  jobs.push(cj.id);
  const lj = await createJob({ user_id: userId, job_type: 'link', payload: { entry_id: entry.id } });
  jobs.push(lj.id);

  return { status: 'created', entry, dup_suggestions: dupSuggestions, jobs };
}

// ---------------------------------------------------------------------------
// 解析：抓取 URL 正文，重试 3 次指数退避
// ---------------------------------------------------------------------------
export async function parseEntry(userId: string, entryId: string, url?: string | null): Promise<Entry> {
  const entry = await getEntry(userId, entryId);
  if (!entry) throw new Error('条目不存在');
  if (entry.content && entry.content.trim()) {
    return entry; // 已解析过正文
  }
  if (!url) throw new Error('缺少来源 URL，无法解析');

  const setStatus = async (status: EntryStatus, extra?: Partial<Entry>) => {
    await getSupabaseClient()
      .from('entries')
      .update({ status, updated_at: nowIso(), ...extra })
      .eq('id', entryId)
      .eq('user_id', userId);
  };

  await setStatus('parsing');
  let lastErr: unknown;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'KnowTreeBot/1.0' }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const body = normalizeContent(htmlToText(text));
      if (body.length < 1) throw new Error('解析结果为空');
      const patch: Partial<Entry> = {
        content: body,
        content_hash: contentHash(body),
        status: 'parsed',
        updated_at: nowIso(),
      };
      if (!entry.title || entry.title === canonicalizeUrl(url).domain) {
        // 尝试从标题标签提取
        const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text) ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text);
        if (m) patch.title = htmlToText(m[1]).slice(0, 200) || entry.title;
      }
      await getSupabaseClient().from('entries').update(patch).eq('id', entryId).eq('user_id', userId);
      const updated = await getEntry(userId, entryId);
      return updated!;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 800)); // 1.6s / 3.2s
      }
    }
  }
  await setStatus('failed');
  throw new Error(`解析失败（重试 ${maxAttempts} 次）: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

// ---------------------------------------------------------------------------
// AI 归类：0.75 自动 / 0.50-0.75 待确认 / <0.50 未分类（不新建）
// ---------------------------------------------------------------------------
export async function classifyEntry(userId: string, entryId: string, forwardHeaders?: Record<string, string>): Promise<Entry> {
  const entry = await getEntry(userId, entryId);
  if (!entry) throw new Error('条目不存在');
  if (!entry.content && !entry.summary) {
    throw new Error('条目无正文，无法归类');
  }
  const categories = await listCategories(userId);
  const profile = await ensureProfile(userId);
  const autoTh = Number(profile.auto_classify_threshold) || 0.75;
  const reviewTh = Number(profile.review_threshold) || 0.5;

  let suggestion: { name: string; confidence: number; summary?: string | null };
  try {
    suggestion = await classifyContent(
      { title: entry.title, content: entry.content || entry.summary || '', categories },
      forwardHeaders,
    );
  } catch (e) {
    throw new Error(`AI 归类失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  const patch: Partial<Entry> = { status: 'classified', updated_at: nowIso() };
  let autoCreatedId: string | null = null;

  if (suggestion.name) {
    const match = categories.find((c) => c.name.trim().toLowerCase() === suggestion.name.trim().toLowerCase());
    patch.classification_confidence = suggestion.confidence;

    if (suggestion.confidence >= autoTh) {
      if (match) {
        patch.category_id = match.id;
      } else {
        // 高置信度且无匹配分类 → 自动新建分类
        const created = await createCategory(userId, { name: suggestion.name });
        patch.category_id = created.id;
        autoCreatedId = created.id;
      }
      patch.classification_status = 'auto';
      patch.suggested_category_id = null;
    } else if (suggestion.confidence >= reviewTh) {
      // 待确认：暂不落库到正式分类，给出建议
      patch.classification_status = 'pending_review';
      patch.category_id = null;
      patch.suggested_category_id = match ? match.id : null;
    } else {
      // 低置信度 → 未分类，不新建
      patch.classification_status = 'uncategorized';
      patch.category_id = null;
      patch.suggested_category_id = null;
    }
    if (suggestion.summary) patch.summary = truncateText(suggestion.summary, 300);
  } else {
    patch.classification_status = 'uncategorized';
    patch.category_id = null;
    patch.classification_confidence = suggestion.confidence || null;
    patch.suggested_category_id = null;
  }

  await getSupabaseClient().from('entries').update(patch as Record<string, unknown>).eq('id', entryId).eq('user_id', userId);
  const updated = (await getEntry(userId, entryId)) as unknown as Entry & { suggested_category_id: string | null };
  return { ...updated, suggested_category_id: autoCreatedId ?? patch.suggested_category_id ?? updated.suggested_category_id };
}

// ---------------------------------------------------------------------------
// 互链：向量相似度分数 >=0.70，取 1-3 条
// ---------------------------------------------------------------------------
export async function linkEntry(userId: string, entryId: string): Promise<{ count: number; links: Array<{ target_id: string; score: number }> }> {
  const entry = await getEntry(userId, entryId);
  if (!entry) throw new Error('条目不存在');
  const text = `${entry.title} ${entry.summary ?? ''} ${entry.content ?? ''}`.trim();
  if (!text) throw new Error('条目无内容');

  // 确保本条目已向量化（复用，不重复嵌入）
  const emb = await ensureEntryEmbedding(userId, entryId);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT e.id AS entry_id, ROUND((1 - (e.embedding <=> $1::vector))::numeric, 4)::float AS similarity
     FROM entries e
     WHERE e.user_id = $2 AND e.deleted_at IS NULL AND e.embedding IS NOT NULL AND e.id <> $3
       AND (1 - (e.embedding <=> $1::vector)) >= 0.70
     ORDER BY e.embedding <=> $1::vector ASC
     LIMIT 5`,
    [vec(emb), userId, entryId],
  );
  const links = rows as Array<{ entry_id: string; similarity: number }>;
  const top = links.slice(0, 3); // 1-3 条

  const client = getSupabaseClient();
  // 清空该条目旧的出链
  await client.from('links').update({ deleted_at: nowIso() }).eq('user_id', userId).eq('source_entry_id', entryId).is('deleted_at', null);
  if (top.length > 0) {
    await client.from('links').insert(
      top.map((l) => ({
        user_id: userId,
        source_entry_id: entryId,
        target_entry_id: l.entry_id,
        score: l.similarity,
      })),
    );
  }
  await client.from('entries').update({ status: 'linked', updated_at: nowIso() }).eq('id', entryId).eq('user_id', userId);

  return { count: top.length, links: top.map((l) => ({ target_id: l.entry_id, score: l.similarity })) };
}

export async function ensureEntryEmbedding(userId: string, entryId: string): Promise<number[]> {
  const existing = await getEntryEmbedding(userId, entryId);
  if (existing && existing.length > 0) return existing;
  const entry = await getEntry(userId, entryId);
  if (!entry) throw new Error('条目不存在');
  const emb = await embedText(`${entry.title} ${entry.summary ?? ''} ${entry.content ?? ''}`.trim());
  await getSupabaseClient().from('entries').update({ embedding: emb, updated_at: nowIso() }).eq('id', entryId).eq('user_id', userId);
  return emb;
}

// ---------------------------------------------------------------------------
// 检索：关键词 + 语义，相关度 x 新鲜度
// ---------------------------------------------------------------------------
export interface SearchOptions {
  limit?: number;
  semanticWeight?: number;
  freshnessLambda?: number;
}

export async function searchEntries(userId: string, query: string, opts: SearchOptions = {}) {
  const limit = opts.limit ?? 20;
  const semanticWeight = opts.semanticWeight ?? 0.7;
  const freshLambda = opts.freshnessLambda ?? 0.015;
  const q = query.trim();
  if (!q) return { items: [] as unknown[], counts: {} };

  // 1) 语义
  let semanticMap = new Map<string, number>();
  try {
    const emb = await embedText(q);
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT e.id AS entry_id, ROUND((1 - (e.embedding <=> $1::vector))::numeric, 4)::float AS similarity
       FROM entries e
       WHERE e.user_id = $2 AND e.deleted_at IS NULL AND e.embedding IS NOT NULL
         AND (1 - (e.embedding <=> $1::vector)) > 0.05
       ORDER BY e.embedding <=> $1::vector ASC
       LIMIT $3`,
      [vec(emb), userId, limit * 2],
    );
    semanticMap = new Map((rows as Array<{ entry_id: string; similarity: number }>).map((r) => [r.entry_id, r.similarity]));
  } catch {
    // 语义检索失败时退化为关键词
  }

  // 2) 关键词
  const client = getSupabaseClient();
  let kw = client.from('entries').select(ENTRY_SELECT).eq('user_id', userId).is('deleted_at', null);
  kw = kw.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
  const { data: kwRows, error } = await kw.limit(limit * 2);
  if (error) throw new Error(`关键词检索失败: ${error.message}`);
  const keywordRows = (kwRows ?? []) as unknown as Entry[];

  // 3) 合并评分：relevance = semantic*semanticWeight + keyword*(1-semanticWeight)，再乘新鲜度衰减
  const now = Date.now();
  const kwSet = new Set(keywordRows.map((e) => e.id));
  const candidates = new Map<string, { entry: Entry; semantic: number; keyword: number }>();
  for (const e of keywordRows) {
    // 标题命中权重高
    const titleHit = e.title?.toLowerCase().includes(q.toLowerCase());
    const keywordScore = titleHit ? 1 : 0.6;
    candidates.set(e.id, { entry: e, semantic: semanticMap.get(e.id) ?? 0, keyword: keywordScore });
  }
  for (const [id, sim] of semanticMap) {
    if (!candidates.has(id)) {
      // 语义命中但关键词未命中：仅靠语义分
      candidates.set(id, { entry: null as unknown as Entry, semantic: sim, keyword: 0 });
    } else {
      candidates.get(id)!.semantic = Math.max(candidates.get(id)!.semantic, sim);
    }
  }

  // 语义命中的条目需要补充完整信息
  const needFetch = Array.from(candidates.entries()).filter(([, c]) => !c.entry).map(([id]) => id);
  const missingMap = new Map<string, Entry>();
  if (needFetch.length > 0) {
    const { data } = await client.from('entries').select(ENTRY_SELECT).in('id', needFetch.slice(0, 200));
    for (const r of (data ?? []) as unknown as Entry[]) missingMap.set(r.id, r);
  }

  const items: Array<Record<string, unknown>> = [];
  for (const [id, c] of candidates) {
    const entry = c.entry ?? missingMap.get(id);
    if (!entry) continue;
    const created = new Date(entry.created_at).getTime();
    const ageDays = Math.max(0, (now - created) / 86400000);
    const freshness = Math.exp(-freshLambda * ageDays);
    const relevance = c.semantic * semanticWeight + c.keyword * (1 - semanticWeight);
    const score = relevance * freshness;
    items.push({
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      source_url: entry.source_url,
      category_id: entry.category_id,
      classification_status: entry.classification_status,
      created_at: entry.created_at,
      score: Number(score.toFixed(4)),
      semantic_similarity: Number(c.semantic.toFixed(4)),
      keyword_hit: c.keyword > 0,
    });
  }
  items.sort((a, b) => (b.score as number) - (a.score as number));
  return { items: items.slice(0, limit), counts: { semantic: semanticMap.size, keyword: keywordRows.length } };
}

// ---------------------------------------------------------------------------
// 版本管理
// ---------------------------------------------------------------------------
export async function listVersions(userId: string, entryId: string): Promise<EntryVersion[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('entry_versions')
    .select('*')
    .eq('user_id', userId)
    .eq('entry_id', entryId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`查询版本失败: ${error.message}`);
  return (data ?? []) as unknown as EntryVersion[];
}

export async function createVersion(userId: string, entryId: string, note?: string): Promise<EntryVersion> {
  const entry = await getEntry(userId, entryId);
  if (!entry) throw new Error('条目不存在');
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('entry_versions')
    .insert({
      user_id: userId,
      entry_id: entryId,
      title: entry.title,
      content: entry.content ?? '',
      content_hash: entry.content_hash ?? null,
      note: note || null,
    })
    .select()
    .single();
  if (error) throw new Error(`创建版本失败: ${error.message}`);
  return data as unknown as EntryVersion;
}

// ---------------------------------------------------------------------------
// 去重合并（用户显式触发；源条目并入目标条目）
// ---------------------------------------------------------------------------
export async function mergeEntry(userId: string, sourceId: string, targetId: string): Promise<Entry> {
  const client = getSupabaseClient();
  const src = await getEntry(userId, sourceId);
  const tgt = await getEntry(userId, targetId);
  if (!src || !tgt) throw new Error('条目不存在');
  if (sourceId === targetId) throw new Error('不能合并自身');

  // 1) 目标条目的入链处理：指向源条目的入链改指目标（避免自链）
  await client.from('links').update({ target_entry_id: targetId }).eq('user_id', userId).eq('target_entry_id', sourceId).neq('source_entry_id', targetId);
  await client.from('links').delete().eq('user_id', userId).eq('source_entry_id', targetId).eq('target_entry_id', targetId);
  // 2) 清除源条目的出链
  await client.from('links').delete().eq('user_id', userId).eq('source_entry_id', sourceId);
  // 3) 将源条目内容快照为目标的版本
  await client.from('entry_versions').insert({
    user_id: userId,
    entry_id: targetId,
    title: src.title,
    content: src.content ?? '',
    content_hash: src.content_hash ?? null,
    note: `合并自「${src.title}」`,
  });
  // 4) 权重累加
  await client.from('entries').update({ weight: (tgt.weight ?? 1) + (src.weight ?? 1), updated_at: nowIso() }).eq('id', targetId).eq('user_id', userId);
  // 5) 硬删除源条目及其关联
  await client.from('entry_versions').delete().eq('user_id', userId).eq('entry_id', sourceId);
  await client.from('daily_recalls').delete().eq('user_id', userId).eq('entry_id', sourceId);
  await client.from('links').delete().eq('user_id', userId).eq('source_entry_id', sourceId);
  const { error } = await client.from('entries').delete().eq('id', sourceId).eq('user_id', userId);
  if (error) throw new Error(`合并失败: ${error.message}`);
  return (await getEntry(userId, targetId))!;
}

// ---------------------------------------------------------------------------
// 导出 MD / JSON
// ---------------------------------------------------------------------------
export async function exportAll(userId: string, format: 'md' | 'json' = 'md'): Promise<string> {
  const client = getSupabaseClient();
  const { data: entries, error } = await client
    .from('entries')
    .select(ENTRY_SELECT)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`导出失败: ${error.message}`);
  const list = (entries ?? []) as unknown as Entry[];

  if (format === 'json') {
    return JSON.stringify(
      { app: '知树 KnowTree', exported_at: new Date().toISOString(), entries: list.map((e) => ({ ...e, embedding: undefined })) },
      null,
      2,
    );
  }

  const lines: string[] = ['# 知树 KnowTree 知识导出', '', `> 导出时间：${new Date().toISOString()}`, '', '## 知识清单', ''];
  const { data: cats } = await getSupabaseClient().from('categories').select('id,name').eq('user_id', userId).is('deleted_at', null);
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  for (const e of list) {
    lines.push(`## ${e.title}`);
    lines.push('');
    const categoryLabel = e.category_id ? catName.get(e.category_id) : null;
    if (categoryLabel) lines.push(`- 分类：${categoryLabel}`);
    if (e.source_url) lines.push(`- 来源：${e.source_url}`);
    if (e.summary) lines.push(`- 摘要：${e.summary}`);
    lines.push(`- 收录时间：${e.created_at}`);
    lines.push('');
    if (e.content) {
      lines.push((e.content as string).slice(0, 5000));
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 注销：彻底删除该用户所有数据 + 删除 auth 账号
// ---------------------------------------------------------------------------
export async function deleteAccount(userId: string): Promise<{ deleted: boolean }> {
  const client = getSupabaseClient();
  const tables = ['links', 'daily_recalls', 'entry_versions', 'entries', 'sources', 'categories', 'jobs', 'profiles'];
  for (const t of tables) {
    const { error } = await client.from(t).delete().eq('user_id', userId);
    if (error) throw new Error(`清理 ${t} 失败: ${error.message}`);
  }
  // 删除 auth 用户
  const { error: authErr } = await client.auth.admin.deleteUser(userId);
  if (authErr) throw new Error(`删除账号失败: ${authErr.message}`);
  return { deleted: true };
}

export { sha256 };
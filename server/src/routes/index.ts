import { Router } from 'express';
import { requireAuth, ensureProfile } from '../middleware/auth';
import * as categorySvc from '../services/categories';
import * as entrySvc from '../services/entries';
import * as recallSvc from '../services/recalls';
import * as jobSvc from '../services/jobs';
import { getJob, listJobs } from '../lib/task';
import { getSupabaseClient } from '../storage/database/supabase-client';
import type { Request, Response } from 'express';

// 包装异步 handler，统一错误处理
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[api] ${req.method} ${req.originalUrl} -> ${message}`, '\n', e instanceof Error ? e.stack : '');
      res.status(500).json({ error: message });
    });
  };

const r = Router();
r.use(requireAuth);

// Express query 值可能是 string | string[]，统一取单个字符串
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined);
// 路径参数可能被类型化为 string | string[]，统一取字符串
const pid = (req: Request): string => {
  const v = req.params?.id;
  return typeof v === 'string' ? v : Array.isArray(v) ? v[0] ?? '' : (v ?? '');
};

// ---------------------------------------------------------------------------
// 我的账号 / 配置
// ---------------------------------------------------------------------------
r.get('/me', h(async (_req, res) => {
  const user = _req.user!;
  const profile = await ensureProfile(user.id);
  res.json({ user, profile });
}));

r.patch('/me', h(async (req, res) => {
  const user = req.user!;
  const allowed = ['display_name', 'avatar_url', 'daily_recall_enabled', 'daily_recall_count', 'auto_classify_threshold', 'review_threshold', 'auto_merge_enabled'];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  const { data, error } = await getSupabaseClient().from('profiles').update(patch).eq('user_id', user.id).select().single();
  if (error) throw new Error(`更新配置失败: ${error.message}`);
  res.json(data);
}));

// 注销：彻底删除该用户全部数据 + auth 账号
r.delete('/me/account', h(async (req, res) => {
  const user = req.user!;
  const result = await entrySvc.deleteAccount(user.id);
  res.json(result);
}));

// ---------------------------------------------------------------------------
// 分类
// ---------------------------------------------------------------------------
r.get('/categories', h(async (req, res) => {
  const user = req.user!;
  res.json(await categorySvc.listCategories(user.id));
}));

r.post('/categories', h(async (req, res) => {
  const user = req.user!;
  const c = await categorySvc.createCategory(user.id, {
    name: req.body.name,
    description: req.body.description,
    parent_id: req.body.parent_id,
    icon: req.body.icon,
  });
  res.status(201).json(c);
}));

r.patch('/categories/:id', h(async (req, res) => {
  const user = req.user!;
  res.json(await categorySvc.updateCategory(user.id, pid(req), req.body));
}));

r.delete('/categories/:id', h(async (req, res) => {
  const user = req.user!;
  await categorySvc.deleteCategory(user.id, pid(req));
  res.json({ deleted: true });
}));

// ---------------------------------------------------------------------------
// 收录（递归去重、向量相近保守提示、任务编排）
// ---------------------------------------------------------------------------
r.post('/entries/ingest', h(async (req, res) => {
  const user = req.user!;
  const result = await entrySvc.ingest(user.id, {
    url: req.body.url,
    content: req.body.content,
    title: req.body.title,
    captureType: req.body.captureType,
  });
  res.status(201).json(result);
}));

// 列表（静态优先于 :id）
r.get('/entries', h(async (req, res) => {
  const user = req.user!;
  const items = await entrySvc.listEntries(user.id, {
    status: str(req.query.status),
    category_id: str(req.query.category_id),
    classification: str(req.query.classification),
    query: str(req.query.q),
    page: req.query.page ? Number(str(req.query.page)) : 1,
    size: req.query.size ? Number(str(req.query.size)) : 20,
  });
  res.json(items);
}));

// 检索（关键词 + 语义）
r.get('/search', h(async (req, res) => {
  const user = req.user!;
  const q = str(req.query.q) ?? '';
  const result = await entrySvc.searchEntries(user.id, q, {
    limit: req.query.limit ? Number(str(req.query.limit)) : 20,
  });
  res.json(result);
}));

// 每日回溯
r.get('/recalls', h(async (req, res) => {
  const user = req.user!;
  res.json(await recallSvc.listRecalls(user.id, str(req.query.date)));
}));

r.post('/recalls/generate', h(async (req, res) => {
  const user = req.user!;
  res.json(await recallSvc.generateDailyRecall(user.id, req.body.date));
}));

r.patch('/recalls/:id', h(async (req, res) => {
  const user = req.user!;
  const status = req.body.status;
  if (!['pending', 'done', 'skipped'].includes(status)) throw new Error('无效的回溯状态');
  res.json(await recallSvc.updateRecall(user.id, pid(req), status));
}));

// 导出
r.get('/export', h(async (req, res) => {
  const user = req.user!;
  const format = str(req.query.format) === 'json' ? 'json' : 'md';
  const content = await entrySvc.exportAll(user.id, format);
  res.setHeader('Content-Type', format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8');
  res.send(content);
}));

// 任务队列
r.get('/jobs', h(async (req, res) => {
  const user = req.user!;
  res.json(await listJobs(user.id, { status: str(req.query.status) }));
}));

r.post('/jobs/run', h(async (_req, res) => {
  const result = await jobSvc.runDueJobs(5);
  res.json(result);
}));

r.get('/jobs/:id', h(async (req, res) => {
  const user = req.user!;
  const job = await getJob(user.id, pid(req));
  if (!job) return res.status(404).json({ error: '任务不存在' });
  res.json(job);
}));

// ---------------------------------------------------------------------------
// 单个条目（含嵌套操作）
// ---------------------------------------------------------------------------
r.get('/entries/:id', h(async (req, res) => {
  const user = req.user!;
  const entry = await entrySvc.getEntry(user.id, pid(req));
  if (!entry) return res.status(404).json({ error: '条目不存在' });
  res.json(entry);
}));

r.patch('/entries/:id', h(async (req, res) => {
  const user = req.user!;
  const entry = await entrySvc.updateEntry(user.id, pid(req), {
    title: req.body.title,
    content: req.body.content,
    summary: req.body.summary,
    category_id: req.body.category_id,
  });
  if (!entry) return res.status(404).json({ error: '条目不存在' });
  res.json(entry);
}));

r.delete('/entries/:id', h(async (req, res) => {
  const user = req.user!;
  await entrySvc.softDeleteEntry(user.id, pid(req));
  res.json({ deleted: true });
}));

// 版本
r.get('/entries/:id/versions', h(async (req, res) => {
  const user = req.user!;
  res.json(await entrySvc.listVersions(user.id, pid(req)));
}));

r.post('/entries/:id/versions', h(async (req, res) => {
  const user = req.user!;
  res.status(201).json(await entrySvc.createVersion(user.id, pid(req), req.body.note));
}));

// 出链
r.get('/entries/:id/links', h(async (req, res) => {
  const user = req.user!;
  const client = getSupabaseClient();
  const { data: links, error } = await client
    .from('links')
    .select('id,score,reason,target_entry_id,created_at')
    .eq('user_id', user.id)
    .eq('source_entry_id', pid(req))
    .is('deleted_at', null)
    .order('score', { ascending: false });
  if (error) throw new Error(`查询互链失败: ${error.message}`);
  const items = (links ?? []) as Array<{ target_entry_id: string; score: number; reason: string | null }>;
  if (items.length > 0) {
    const ids = Array.from(new Set(items.map((l) => l.target_entry_id)));
    const { data: entries } = await client.from('entries').select('id,title,summary,source_url').in('id', ids);
    const map = new Map((entries ?? []).map((e) => [e.id, e]));
    res.json(items.map((l) => ({ ...l, target: map.get(l.target_entry_id) ?? null })));
    return;
  }
  res.json([]);
}));

// 触发归类
r.post('/entries/:id/classify', h(async (req, res) => {
  const user = req.user!;
  // 分类由后台任务/服务内部调用即可，无需前台透传 headers（避免携带过大 header 对象）
  res.json(await entrySvc.classifyEntry(user.id, pid(req)));
}));

// 触发互链
r.post('/entries/:id/link', h(async (req, res) => {
  const user = req.user!;
  res.json(await entrySvc.linkEntry(user.id, pid(req)));
}));

// 去重合并：将本条目并入 target_entry_id
r.post('/entries/:id/merge', h(async (req, res) => {
  const user = req.user!;
  const targetId = req.body.target_entry_id;
  if (!targetId) throw new Error('缺少 target_entry_id');
  res.json(await entrySvc.mergeEntry(user.id, pid(req), targetId));
}));

export default r;
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, ensureProfile } from '../middleware/auth.js';
import * as categorySvc from '../services/categories.js';
import * as entrySvc from '../services/entries.js';
import * as recallSvc from '../services/recalls.js';
import * as jobSvc from '../services/jobs.js';
import { getJob, listJobs } from '../lib/task.js';
import { getSupabaseClient } from '../storage/database/supabase-client.js';
import { scheduleBackgroundTask } from '../lib/background.js';
import { DocumentImportError, parseDocument } from '../services/document-import.js';
import { EMBEDDING_DIM, isAiConfigured, testAiConnection } from '../services/ai.js';
import type { NextFunction, Request, Response } from 'express';

// 包装异步 handler，统一错误处理
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[api] ${req.method} ${req.originalUrl} -> ${message}`, '\n', e instanceof Error ? e.stack : '');
      const status = e instanceof entrySvc.EntryConflictError ? 409 : 500;
      res.status(status).json({ error: message });
    });
  };

const r = Router();
r.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const receiveDocument = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? '文件超过 10 MB 限制'
      : '文件上传失败';
    res.status(400).json({ error: message, code: 'FILE_UPLOAD_FAILED' });
  });
};

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
r.get('/bootstrap', h(async (req, res) => {
  const user = req.user!;
  const mePromise = ensureProfile(user.id).then((profile) => ({ user, profile })).catch(() => null);
  const [categories, entries, me, recalls] = await Promise.all([
    categorySvc.listCategories(user.id),
    entrySvc.listEntries(user.id, { page: 1, size: 100 }),
    mePromise,
    recallSvc.listRecalls(user.id).catch(() => []),
  ]);
  const settledCategories = categories.length > 0 || !me
    ? categories
    : await categorySvc.listCategories(user.id).catch(() => categories);
  res.json({ categories: settledCategories, entries, me, recalls });
}));

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

r.get('/ai/status', h(async (req, res) => {
  const profile = await ensureProfile(req.user!.id);
  res.json({
    configured: isAiConfigured(),
    mode: isAiConfigured() ? 'ai' : 'fallback',
    chatModel: process.env.OPENAI_CHAT_MODEL?.trim() || null,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL?.trim() || null,
    embeddingDimension: EMBEDDING_DIM,
    features: {
      autoTitle: profile.ai_auto_title !== false,
      autoSummary: profile.ai_auto_summary !== false,
      autoClassify: profile.ai_auto_classify !== false,
      embeddings: profile.ai_embeddings_enabled !== false,
    },
    lastError: profile.ai_last_error,
    lastErrorAt: profile.ai_last_error_at,
  });
}));

r.patch('/ai/preferences', h(async (req, res) => {
  const fields = {
    ai_auto_title: 'autoTitle',
    ai_auto_summary: 'autoSummary',
    ai_auto_classify: 'autoClassify',
    ai_embeddings_enabled: 'embeddings',
  } as const;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [column, key] of Object.entries(fields)) {
    if (typeof req.body[key] === 'boolean') patch[column] = req.body[key];
  }
  if (Object.keys(patch).length === 1) {
    res.status(400).json({ error: '没有可更新的 AI 设置' });
    return;
  }
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .update(patch)
    .eq('user_id', req.user!.id)
    .select()
    .single();
  if (error) throw new Error(`更新 AI 设置失败: ${error.message}`);
  res.json(data);
}));

r.post('/ai/test', h(async (_req, res) => {
  res.json(await testAiConnection());
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
  if ('jobs' in result && result.jobs.length > 0) {
    scheduleBackgroundTask(() => jobSvc.runDueJobs(10));
  }
  res.status(201).json(result);
}));

r.post('/entries/import', receiveDocument, h(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '请选择一个文档', code: 'FILE_MISSING' });
    return;
  }

  try {
    const parsed = await parseDocument({
      fileName: req.file.originalname,
      mime: req.file.mimetype,
      bytes: req.file.buffer,
    });
    const result = await entrySvc.ingest(req.user!.id, {
      content: parsed.markdown,
      title: str(req.body.title),
      captureType: 'file',
      sourceName: parsed.sourceName,
      sourceMime: parsed.sourceMime,
    });
    if ('jobs' in result && result.jobs.length > 0) {
      scheduleBackgroundTask(() => jobSvc.runDueJobs(10));
    }
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof DocumentImportError) {
      res.status(400).json({ error: error.message, code: error.code });
      return;
    }
    throw error;
  }
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
  res.json(await entrySvc.classifyEntry(user.id, pid(req)));
}));

r.post('/entries/:id/enrich', h(async (req, res) => {
  const user = req.user!;
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

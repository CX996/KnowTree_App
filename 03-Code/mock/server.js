/* ===== 知树 KnowTree · Mock 后端（仅供前端本地预览/联调演示）=====
 * 纯 Node 内置 http，零依赖。实现《知树KnowTree-后端接口契约.md》的核心接口，
 * 数据存内存。前端 api.js 默认连 http://localhost:9091/api/v1 即可。
 * 任意 x-session 值都接受（演示用，不校验 token）。
 */
'use strict';
const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 9091;
let seq = 1000;
const uid = (p) => p + '_' + (++seq).toString(36);

const now = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

/* ---------- 预置数据 ---------- */
let categories = [
  { id: 'cat_tech', user_id: 'u1', name: '技术', description: null, parent_id: null, icon: null, deleted_at: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: 'cat_rl', user_id: 'u1', name: '强化学习', description: null, parent_id: 'cat_tech', icon: null, deleted_at: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: 'cat_math', user_id: 'u1', name: '数学', description: null, parent_id: null, icon: null, deleted_at: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: 'cat_reading', user_id: 'u1', name: '阅读', description: null, parent_id: null, icon: null, deleted_at: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: 'cat_work', user_id: 'u1', name: '工作', description: null, parent_id: null, icon: null, deleted_at: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: 'cat_life', user_id: 'u1', name: '生活', description: null, parent_id: null, icon: null, deleted_at: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: 'cat_papers', user_id: 'u1', name: '论文', description: null, parent_id: 'cat_tech', icon: null, deleted_at: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
];

function mkEntry(over) {
  return Object.assign({
    id: uid('e'), user_id: 'u1', source_id: null, category_id: null, title: '',
    summary: null, content: '', content_hash: '', source_url: null,
    capture_type: 'manual', status: 'parsed', classification_status: 'uncategorized',
    classification_confidence: null, suggested_category_id: null,
    weight: 1, recall_count: 0, last_recalled_at: null,
    deleted_at: null, created_at: now(), updated_at: now()
  }, over);
}

let entries = [
  mkEntry({ id: 'e1', title: '强化学习中的PPO算法推导', category_id: 'cat_rl',
    content: 'PPO即近端策略优化，通过重要性采样限制策略更新幅度，使用clip目标函数。\n\n其目标函数为 clip(r_t(theta), 1-eps, 1+eps) * A_t。\n\n本文整理推导过程与伪代码实现。',
    summary: 'PPO近端策略优化算法推导与实现', status: 'classified', classification_status: 'auto',
    classification_confidence: 0.93, source_url: 'https://arxiv.org/abs/1707.06347', created_at: daysAgo(20) }),
  mkEntry({ id: 'e2', title: 'Transformer注意力机制笔记', category_id: 'cat_papers',
    content: '自注意力通过Q、K、V三个矩阵计算注意力权重。\n\nsoftmax(QK^T/sqrt(d_k))V，多头注意力并行学习不同子空间。\n\n记录多头注意力的维度设计细节。',
    summary: 'Transformer自注意力机制核心概念笔记', status: 'classified', classification_status: 'auto',
    classification_confidence: 0.9, source_url: 'https://arxiv.org/abs/1706.03762', created_at: daysAgo(18) }),
  mkEntry({ id: 'e3', title: '矩阵求导链式法则备忘', category_id: 'cat_math',
    content: '矩阵求导中的链式法则：给定标量对矩阵的导数，利用内积与微分法推导。\n\n核心公式：d(f) = tr(dX^T * df/dX)。\n\n这是神经网络反向传播的基础工具。',
    summary: '矩阵微分与链式法则速查表', status: 'classified', classification_status: 'auto',
    classification_confidence: 0.85, created_at: daysAgo(12) }),
  mkEntry({ id: 'e4', title: '读过《置身事内》的几点感受', category_id: 'cat_reading',
    content: '《置身事内》讲述中国政府与经济发展：土地财政、分税制改革、地方债务。\n\n启发：理解政策需结合激励机制与历史背景，而非简单线性因果。\n\n整理书中关键框架与个人思考。',
    summary: '中国经济政策与发展的读书笔记', status: 'classified', classification_status: 'auto',
    classification_confidence: 0.88, created_at: daysAgo(9) }),
  mkEntry({ id: 'e5', title: '周会分享：大模型部署要点', category_id: 'cat_work',
    content: '本周会分享大模型推理部署：量化（INT8/INT4）、vLLM批处理、显存估算。\n\n关键：KV cache 显存占用与 throughput 的权衡。\n\n整理为团队可参考的部署 checklist。',
    summary: '大模型推理部署实践要点', status: 'classified', classification_status: 'auto',
    classification_confidence: 0.9, created_at: daysAgo(6) }),
  mkEntry({ id: 'e6', title: '周末读《百年孤独》摘抄', category_id: 'cat_life',
    content: '「过去都是假的，回忆没有归路。」\n\n布恩迪亚家族的兴衰映射拉美百年历史。魔幻现实主义写法探讨孤独与循环。\n\n摘录若干段落与感想。',
    summary: '百年孤独阅读摘抄与感想', status: 'parsed', classification_status: 'pending_review',
    classification_confidence: 0.62, suggested_category_id: 'cat_reading', created_at: daysAgo(3) }),
  mkEntry({ id: 'e7', title: '未分类的新想法：关于每天写日志', category_id: null,
    content: '最近想坚持每天写晨间日志：记录三条感恩、一个目标、一个反思。\n\n提升觉察与长期主义。先不急着归档，观察几天。',
    summary: null, status: 'parsed', classification_status: 'uncategorized',
    classification_confidence: 0.42, suggested_category_id: null, created_at: daysAgo(1) }),
];

/* 模拟重复：e1 与 e8 内容高度相似（作为去重提示样例） */
let jobs = [];
let dups = {};

function newJob(job_type, payload, result) {
  const j = { id: uid('j'), user_id: 'u1', job_type, payload, status: 'succeeded', attempt_count: 1, max_attempts: 3, next_run_at: null, last_error: null, result: result || null, created_at: now(), updated_at: now() };
  jobs.unshift(j);
  return j;
}

let me = { user: { id: 'u1', email: 'demo@knowtree.dev', phone: null },
  profile: { user_id: 'u1', display_name: '演示用户', avatar_url: null,
    daily_recall_enabled: true, daily_recall_count: 3, auto_classify_threshold: 0.75,
    review_threshold: 0.5, auto_merge_enabled: false, created_at: daysAgo(30), updated_at: daysAgo(30) } };

let recalls = [];

function findBy(arr, id) { return arr.find(function (x) { return x.id === id; }); }

/* 简易 hash */
function hash(s) {
  let h = 0; s = String(s || '');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}

/* 关键词相似度（mock 语义）：命中关键词比例 */
function simTo(existingText, newText) {
  const toks = String(newText || '').split(/[\s，。,.、]+/).filter(Boolean);
  if (!toks.length) return 0.5;
  let hits = 0;
  toks.forEach((t) => { if (String(existingText || '').indexOf(t) >= 0) hits++; });
  return Math.min(0.99, 0.5 + hits / toks.length * 0.5);
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => d += c);
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve(extractParams(d)); } });
  });
}
function extractParams(qs) {
  const o = {};
  new URLSearchParams(qs).forEach((v, k) => { o[k] = v; });
  return o;
}

function visibleEntries() { return entries.filter((e) => !e.deleted_at); }

function withAuth(req, res, cb) {
  const token = req.headers['x-session'];
  if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '请先登录' })); return; }
  cb();
}
function json(res, code, obj, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE', 'Access-Control-Allow-Headers': 'Content-Type,x-session' }, headers || {});
  res.writeHead(code, h);
  res.end(JSON.stringify(obj));
}
function text(res, code, str, headers) {
  const h = Object.assign({ 'Content-Type': 'text/markdown; charset=utf-8', 'Access-Control-Allow-Origin': '*' }, headers || {});
  res.writeHead(code, h); res.end(str);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const q = u.searchParams;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE', 'Access-Control-Allow-Headers': 'Content-Type,x-session' });
    res.end(); return;
  }

  // /api/v1 前缀
  if (!p.startsWith('/api/v1')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'not found' })); return; }
  const base = p.replace(/^\/api\/v1/, '');

  // health 免鉴权
  if (base === '/health' && req.method === 'GET') { return json(res, 200, { status: 'ok' }); }

  withAuth(req, res, async () => {
    try {
      // accounts / me
      if (base === '/me' && req.method === 'GET') return json(res, 200, me);
      if (base === '/me' && req.method === 'PATCH') {
        const b = await readBody(req);
        me.profile = Object.assign(me.profile, b);
        me.profile.updated_at = now();
        return json(res, 200, me.profile);
      }
      if (base === '/me/account' && req.method === 'DELETE') {
        entries = []; categories = []; recalls = []; jobs = [];
        return json(res, 200, { deleted: true });
      }

      // categories
      if (base === '/categories' && req.method === 'GET')
        return json(res, 200, categories.filter((c) => !c.deleted_at).sort((a, b) => a.name.localeCompare(b.name)));
      if (base === '/categories' && req.method === 'POST') {
        const b = await readBody(req);
        const c = { id: uid('cat'), user_id: 'u1', name: b.name, description: b.description || null, parent_id: b.parent_id || null, icon: b.icon || null, deleted_at: null, created_at: now(), updated_at: now() };
        categories.push(c); return json(res, 201, c);
      }

      // entries list / create via ingest
      if (base === '/entries/ingest' && req.method === 'POST') {
        const b = await readBody(req);
        const content = String(b.content || '');
        const url = b.url || null;
        const existing = visibleEntries().find((e) => (url && e.source_url === url) || (content && e.content_hash === hash(content)));
        if (existing) {
          existing.weight = (existing.weight || 1) + 1;
          return json(res, 201, { status: 'hash_duplicate', entry: existing, dup_of: existing.id, weight: existing.weight, message: '已存在相同内容，未重复收录（权重+1）', jobs: [] });
        }
        const e = mkEntry({
          title: b.title || (content.split('\n')[0] || '').slice(0, 30) || url || '（无标题）',
          content: content, source_url: url, capture_type: b.captureType || 'manual',
          content_hash: hash(content), status: 'parsed', classification_status: 'uncategorized'
        });
        // 模拟 AI 归类：按关键词粗分类
        const cn = content + ' ' + (e.title || '');
        const catGuess = categories.find((c) => !c.deleted_at && cn.toLowerCase().indexOf(c.name.toLowerCase()) >= 0);
        const conf = catGuess ? Math.min(0.98, 0.6 + Math.random() * 0.3) : 0.3 + Math.random() * 0.4;
        if (catGuess && conf >= 0.75) { e.category_id = catGuess.id; e.classification_status = 'auto'; e.classification_confidence = conf; }
        else if (catGuess && conf >= 0.5) { e.classification_status = 'pending_review'; e.classification_confidence = conf; e.suggested_category_id = catGuess.id; }
        else { e.classification_status = 'uncategorized'; e.classification_confidence = conf; }
        entries.unshift(e);
        // 去重建议
        const sugg = visibleEntries().filter((x) => x.id !== e.id && x.content).map((x) => ({ entry_id: x.id, title: x.title, similarity: Math.round(simTo(x.content, content) * 100) / 100 })).filter((s) => s.similarity >= 0.9);
        const jobsArr = [];
        if (e.status === 'parsing') jobsArr.push(newJob('parse', { entry_id: e.id }).id);
        jobsArr.push(newJob('link', { entry_id: e.id }, { entry_id: e.id, count: 0, links: [] }).id);
        return json(res, 201, { status: 'created', entry: e, dup_suggestions: sugg, jobs: jobsArr });
      }
      if (base === '/entries' && req.method === 'GET') {
        let list = visibleEntries();
        const status = q.get('status'); if (status) list = list.filter((e) => e.status === status);
        const cat = q.get('category_id'); if (cat) list = list.filter((e) => e.category_id === cat);
        const cls = q.get('classification'); if (cls) list = list.filter((e) => e.classification_status === cls);
        const kw = q.get('q'); if (kw) list = list.filter((e) => ((e.title || '') + (e.content || '')).toLowerCase().indexOf(kw.toLowerCase()) >= 0);
        const page = parseInt(q.get('page') || '1'); const size = parseInt(q.get('size') || '20');
        list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return json(res, 200, list.slice((page - 1) * size, page * size));
      }

      // single entry
      const mEntry = base.match(/^\/entries\/([^/]+)$/);
      const mEntrySub = base.match(/^\/entries\/([^/]+)\/([a-z_]+)$/);
      if (mEntrySub) {
        const id = mEntrySub[1], sub = mEntrySub[2];
        const e = findBy(entries, id);
        if (!e || e.deleted_at) return json(res, 404, { error: '条目不存在' });
        if (sub === 'versions' && req.method === 'GET') return json(res, 200, []);
        if (sub === 'versions' && req.method === 'POST') return json(res, 201, { id: uid('v'), entry_id: id, title: e.title, content: e.content, note: null, created_at: now() });
        if (sub === 'links' && req.method === 'GET') return json(res, 200, []);
        if (sub === 'classify' && req.method === 'POST') {
          const c = categories.find((x) => e.suggested_category_id && x.id === e.suggested_category_id);
          if (c) { e.category_id = c.id; e.classification_status = 'auto'; e.classification_confidence = 0.95; }
          return json(res, 200, e);
        }
        if (sub === 'merge' && req.method === 'POST') {
          const b = await readBody(req);
          const target = findBy(entries, b.target_entry_id);
          if (!target) return json(res, 404, { error: '目标条目不存在' });
          target.weight = (target.weight || 1) + (e.weight || 1);
          target.content = target.content + '\n\n' + e.content;
          entries = entries.filter((x) => x.id !== e.id);
          return json(res, 200, target);
        }
        return json(res, 404, { error: 'unknown subresource' });
      }
      if (mEntry) {
        const id = mEntry[1]; const e = findBy(entries, id);
        if (!e || e.deleted_at) return json(res, 404, { error: '条目不存在' });
        if (req.method === 'GET') return json(res, 200, e);
        if (req.method === 'PATCH') {
          const b = await readBody(req);
          if (b.category_id !== undefined) {
            e.category_id = b.category_id || null;
            e.classification_status = e.category_id ? 'auto' : 'uncategorized';
            e.classification_confidence = e.category_id ? 1 : null;
            e.suggested_category_id = e.category_id ? null : e.suggested_category_id;
          }
          ['title', 'content', 'summary', 'source_url'].forEach((k) => { if (b[k] !== undefined) e[k] = b[k]; });
          if (b.content !== undefined) e.content_hash = hash(b.content);
          e.updated_at = now();
          return json(res, 200, e);
        }
        if (req.method === 'DELETE') { e.deleted_at = now(); return json(res, 200, { deleted: true }); }
      }

      // search
      if (base === '/search' && req.method === 'GET') {
        const kw = (q.get('q') || '').trim().toLowerCase(); const lim = parseInt(q.get('limit') || '20');
        if (!kw) return json(res, 200, { items: [], counts: { semantic: 0, keyword: 0 } });
        const items = visibleEntries().filter((e) => ((e.title || '') + (e.content || '')).toLowerCase().indexOf(kw) >= 0).slice(0, lim).map((e) => ({
          id: e.id, title: e.title, summary: e.summary, source_url: e.source_url, category_id: e.category_id,
          classification_status: e.classification_status, created_at: e.created_at,
          score: Math.round((0.5 + Math.random() * 0.5) * 100) / 100, semantic_similarity: Math.round(Math.random() * 100) / 100, keyword_hit: true
        }));
        return json(res, 200, { items, counts: { semantic: items.length, keyword: items.length } });
      }

      // recalls
      if (base === '/recalls' && req.method === 'GET') return json(res, 200, recalls);
      if (base === '/recalls/generate' && req.method === 'POST') {
        const pool = visibleEntries().filter((e) => e.status === 'classified' || e.classification_status === 'auto');
        if (!pool.length) return json(res, 200, { date: 'today', created: 0, items: [], existing: recalls });
        const pick = pool.slice(0, 3);
        recalls = pick.map((e) => ({ id: uid('r'), user_id: 'u1', entry_id: e.id, recall_date: new Date().toISOString().slice(0, 10), weight: e.weight || 1, status: 'pending', created_at: now(), entry: e }));
        return json(res, 200, { date: 'today', created: recalls.length, items: recalls, existing: [] });
      }
      const mRecall = base.match(/^\/recalls\/([^/]+)$/);
      if (mRecall && req.method === 'PATCH') {
        const b = await readBody(req); const r = findBy(recalls, mRecall[1]);
        if (!r) return json(res, 404, { error: '回溯不存在' });
        r.status = b.status || 'done'; return json(res, 200, r);
      }

      // export
      if (base === '/export' && req.method === 'GET') {
        const fmt = q.get('format') || 'md';
        if (fmt === 'json') {
          return json(res, 200, { app: '知树 KnowTree', exported_at: now(), entries: visibleEntries() }, { 'Content-Type': 'application/json' });
        }
        let md = '# 知树 KnowTree 导出\n\n';
        visibleEntries().forEach((e) => {
          const c = categories.find((x) => x.id === e.category_id);
          md += `## ${e.title || '（无标题）'}\n**分类**：${c ? c.name : '未分类'} · **来源**：${e.source_url || e.capture_type || '手动'}\n\n${(e.summary || '').slice(0, 5000)}\n\n---\n\n`;
        });
        return text(res, 200, md);
      }

      // jobs
      const mJob = base.match(/^\/jobs\/([^/]+)$/);
      if (mJob && req.method === 'GET') { const j = findBy(jobs, mJob[1]); return j ? json(res, 200, j) : json(res, 404, { error: '任务不存在' }); }
      if (base === '/jobs' && req.method === 'GET') return json(res, 200, jobs);

      json(res, 404, { error: '接口不存在: ' + req.method + ' ' + base });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log('[KnowTree Mock 后端] 已启动: http://localhost:' + PORT + '/api/v1');
});
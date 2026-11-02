# 知树采集、文档解析与 Markdown 阅读 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成文本与文档采集、自动标题摘要、AI 能力管理、正确返回历史，以及安全的 Markdown 阅读和编辑闭环。

**Architecture:** 文件在 Vercel Function 内以 multipart 上传并在内存中解析，不保存原文件。解析后的 Markdown 进入现有 Express/Supabase 流程，由一次结构化 AI 请求生成标题、摘要、分类和关键词。前端使用本地 Markdown 渲染器和显式编辑态展示内容。

**Tech Stack:** Node.js 24、pnpm 11、TypeScript、Express 4、Supabase、Vercel Functions、Mammoth、unpdf、Turndown、Multer、Marked、DOMPurify、原生 HTML/CSS/JS。

**Spec:** `docs/superpowers/specs/2026-11-02-capture-document-ai-reading-design.md`

## Global Constraints

- 单文件上限 10 MB，提取正文上限 500,000 字符。
- 仅支持 `.md`、`.txt`、`.html`、`.docx`、文本型 `.pdf`；不支持 OCR。
- 原文件不得写入 Supabase Storage 或服务器磁盘。
- AI API Key、Base URL 和认证头不得返回浏览器。
- Embedding 维度固定为 1024。
- 公开注册继续保持关闭。
- Markdown 资源必须本地部署，不加载第三方 CDN。
- 已有 API 路径、状态枚举和 RLS 所有权模型不得破坏。
- 每个任务结束前必须运行对应测试，提交必须只包含该任务的文件。

---

### Task 1: 数据库字段与 TypeScript 类型

**Files:**
- Create: 由 `supabase migration new capture_document_ai` 生成的 migration 文件
- Modify: `apps/api/src/types/index.ts`
- Modify: `apps/api/test/governance.test.ts`

**Interfaces:**
- Produces: `CaptureType` 包含 `'file'`。
- Produces: `Entry.source_name: string | null`、`Entry.source_mime: string | null`、`Entry.title_source: ContentSource`、`Entry.summary_source: ContentSource | null`。
- Produces: `Profile.ai_auto_title`、`ai_auto_summary`、`ai_auto_classify`、`ai_embeddings_enabled`，均为 `boolean`。

- [ ] **Step 1: 写失败的 migration 约束测试**

在 `apps/api/test/governance.test.ts` 增加：

```ts
test('capture migration adds file metadata and AI preferences', async () => {
  const files = (await readdir(path.join(root, 'supabase/migrations')))
    .filter((file) => file.endsWith('_capture_document_ai.sql'));
  assert.equal(files.length, 1);
  const sql = await readFile(path.join(root, 'supabase/migrations', files[0]), 'utf8');
  assert.match(sql, /'file'/);
  assert.match(sql, /source_name/);
  assert.match(sql, /source_mime/);
  assert.match(sql, /title_source/);
  assert.match(sql, /summary_source/);
  assert.match(sql, /ai_auto_title/);
  assert.match(sql, /ai_embeddings_enabled/);
});
```

补充 imports：

```ts
import { readdir } from 'node:fs/promises';
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm --dir apps/api exec tsx --test test/governance.test.ts`

Expected: FAIL，因为 migration 文件不存在。

- [ ] **Step 3: 用 Supabase CLI 创建 migration**

Run: `pnpm dlx supabase@2.122.0 migration new capture_document_ai`

Expected: 在 `supabase/migrations/` 生成一个以时间戳开头、以 `_capture_document_ai.sql` 结尾的文件。

- [ ] **Step 4: 写 migration**

在生成文件中写入：

```sql
alter table public.entries
  drop constraint if exists entries_capture_type_check;

alter table public.entries
  add constraint entries_capture_type_check
  check (capture_type in ('web', 'manual', 'clip', 'image', 'file'));

alter table public.entries
  add column source_name text,
  add column source_mime text,
  add column title_source text not null default 'legacy'
    check (title_source in ('manual', 'ai', 'fallback', 'imported', 'legacy')),
  add column summary_source text
    check (summary_source in ('manual', 'ai', 'fallback', 'imported', 'legacy'));

alter table public.profiles
  add column ai_auto_title boolean not null default true,
  add column ai_auto_summary boolean not null default true,
  add column ai_auto_classify boolean not null default true,
  add column ai_embeddings_enabled boolean not null default true;
```

- [ ] **Step 5: 更新 TypeScript 类型**

在 `apps/api/src/types/index.ts` 增加：

```ts
export type ContentSource = 'manual' | 'ai' | 'fallback' | 'imported' | 'legacy';
```

把 `CaptureType` 更新为包含 `'file'`，并给 `Entry`、`Profile` 增加 migration 对应字段。

- [ ] **Step 6: 运行测试和类型检查并确认 GREEN**

Run: `pnpm --dir apps/api exec tsx --test test/governance.test.ts`

Run: `pnpm lint`

Expected: 全部通过。

- [ ] **Step 7: 提交**

```powershell
git add supabase/migrations apps/api/src/types/index.ts apps/api/test/governance.test.ts
git commit -m "feat: add capture metadata and ai preferences"
```

---

### Task 2: Markdown 归一化、哈希与确定性标题

**Files:**
- Modify: `apps/api/src/lib/text.ts`
- Create: `apps/api/test/content.test.ts`

**Interfaces:**

```ts
export function normalizeMarkdown(content: string): string;
export function markdownToPlainText(content: string): string;
export function deriveTitle(input: {
  title?: string | null;
  fileName?: string | null;
  content: string;
}): { title: string; source: ContentSource };
export function deriveSummary(content: string): string;
```

- [ ] **Step 1: 写失败测试**

创建 `apps/api/test/content.test.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveSummary,
  deriveTitle,
  markdownToPlainText,
  normalizeMarkdown,
} from '../src/lib/text.js';

test('normalizeMarkdown preserves structure and limits blank lines', () => {
  assert.equal(normalizeMarkdown('# 标题\r\n\r\n\r\n正文  '), '# 标题\n\n正文');
});

test('markdownToPlainText ignores formatting differences', () => {
  assert.equal(markdownToPlainText('# 标题\n\n**重点** [链接](https://example.com)'), '标题 重点 链接');
});

test('deriveTitle uses heading before filename and first sentence', () => {
  assert.deepEqual(
    deriveTitle({ fileName: 'notes.md', content: '# 强化学习\n\nPPO 训练记录。' }),
    { title: '强化学习', source: 'imported' },
  );
});

test('deriveTitle uses filename when content has no heading', () => {
  assert.deepEqual(
    deriveTitle({ fileName: '会议纪要.md', content: '今天讨论了下周计划。' }),
    { title: '会议纪要', source: 'imported' },
  );
});

test('deriveTitle uses first sentence as fallback', () => {
  assert.deepEqual(
    deriveTitle({ content: '这是第一句。后面还有内容。' }),
    { title: '这是第一句', source: 'fallback' },
  );
});

test('deriveSummary skips headings and truncates paragraphs', () => {
  assert.equal(deriveSummary('# 标题\n\n这是摘要正文。'), '这是摘要正文。');
});
```

- [ ] **Step 2: 确认 RED**

Run: `pnpm --dir apps/api exec tsx --test test/content.test.ts`

Expected: FAIL，导出函数不存在。

- [ ] **Step 3: 实现最小工具函数**

在 `apps/api/src/lib/text.ts` 实现：

```ts
export function normalizeMarkdown(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function markdownToPlainText(content: string): string {
  return normalizeMarkdown(content)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveTitle(input: { title?: string | null; fileName?: string | null; content: string }) {
  const explicit = input.title?.trim();
  if (explicit) return { title: explicit.slice(0, 200), source: 'manual' as const };

  const extractedSource = input.fileName ? 'imported' as const : 'fallback' as const;
  const heading = normalizeMarkdown(input.content).match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return { title: heading.slice(0, 200), source: extractedSource };

  const fileTitle = input.fileName?.replace(/\.[^.]+$/, '').trim();
  if (fileTitle) return { title: fileTitle.slice(0, 200), source: 'imported' as const };

  const sentence = markdownToPlainText(input.content).split(/[。！？.!?]/)[0]?.trim();
  return { title: sentence ? sentence.slice(0, 60) : '未命名知识', source: 'fallback' as const };
}

export function deriveSummary(content: string): string {
  const paragraph = normalizeMarkdown(content)
    .split(/\n{2,}/)
    .map((part) => markdownToPlainText(part))
    .find((part) => part.length > 0);
  return paragraph ? paragraph.slice(0, 120) : '';
}
```

- [ ] **Step 4: 确认 GREEN**

Run: `pnpm --dir apps/api exec tsx --test test/content.test.ts`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/lib/text.ts apps/api/test/content.test.ts
git commit -m "feat: add markdown and title normalization"
```

---

### Task 3: 文档类型检测与正文解析

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/services/document-import.ts`
- Create: `apps/api/test/document-import.test.ts`

**Interfaces:**

```ts
export type DocumentCode =
  | 'FILE_TOO_LARGE'
  | 'FILE_TYPE_UNSUPPORTED'
  | 'FILE_CORRUPT'
  | 'DOCUMENT_EMPTY'
  | 'PDF_TEXT_LAYER_MISSING';

export interface ParsedDocument {
  markdown: string;
  sourceName: string;
  sourceMime: string;
  titleFromFile: string;
}

export class DocumentImportError extends Error {
  constructor(public code: DocumentCode, message: string);
}

export async function parseDocument(input: {
  fileName: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<ParsedDocument>;
```

- [ ] **Step 1: 安装固定依赖**

Run:

```powershell
pnpm --dir apps/api add mammoth@1.13.0 unpdf@2.1.0 turndown@7.2.4 multer@2.5.0
pnpm --dir apps/api add -D @types/turndown@5.0.6 @types/multer@2.3.0 docx@9.15.1 pdf-lib@1.17.1
```

- [ ] **Step 2: 写失败的解析测试**

创建 `apps/api/test/document-import.test.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { DocumentImportError, parseDocument } from '../src/services/document-import.js';

test('parses markdown as markdown', async () => {
  const result = await parseDocument({
    fileName: 'notes.md',
    mime: 'text/markdown',
    bytes: Buffer.from('# 标题\n\n正文'),
  });
  assert.match(result.markdown, /^# 标题/);
  assert.equal(result.titleFromFile, 'notes');
});

test('converts html to markdown', async () => {
  const result = await parseDocument({
    fileName: 'page.html',
    mime: 'text/html',
    bytes: Buffer.from('<h1>标题</h1><p>正文</p>'),
  });
  assert.match(result.markdown, /# 标题/);
  assert.match(result.markdown, /正文/);
});

test('extracts docx text', async () => {
  const doc = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun('DOCX 正文')] })] }],
  });
  const bytes = await Packer.toBuffer(doc);
  const result = await parseDocument({
    fileName: 'report.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes,
  });
  assert.match(result.markdown, /DOCX 正文/);
});

test('extracts text-layer pdf', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('PDF body text', { x: 40, y: 700, font, size: 12 });
  const result = await parseDocument({
    fileName: 'report.pdf',
    mime: 'application/pdf',
    bytes: await pdf.save(),
  });
  assert.match(result.markdown, /PDF body text/);
});

test('reports scanned pdf without text layer', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await assert.rejects(
    parseDocument({ fileName: 'scan.pdf', mime: 'application/pdf', bytes: await pdf.save() }),
    (error: unknown) => error instanceof DocumentImportError
      && error.code === 'PDF_TEXT_LAYER_MISSING',
  );
});

test('rejects mismatched pdf magic bytes', async () => {
  await assert.rejects(
    parseDocument({ fileName: 'fake.pdf', mime: 'application/pdf', bytes: Buffer.from('not a pdf') }),
    (error: unknown) => error instanceof DocumentImportError && error.code === 'FILE_CORRUPT',
  );
});
```

- [ ] **Step 3: 确认 RED**

Run: `pnpm --dir apps/api exec tsx --test test/document-import.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现解析模块**

`document-import.ts` 必须：

- 用扩展名选择格式，MIME 只作为辅助。
- PDF 检查 `%PDF-`，DOCX 检查 ZIP 头 `PK`。
- PDF 页面数不超过 200。
- `unpdf` 调用 `extractText(bytes, { mergePages: true })`。
- 文本少于 20 个有效字符时抛出 `PDF_TEXT_LAYER_MISSING`。
- DOCX 使用 `mammoth.convertToHtml({ buffer })`，再用 Turndown。
- HTML 直接交给 Turndown。
- 最终结果经 `normalizeMarkdown`，空正文抛 `DOCUMENT_EMPTY`。
- 文件超过 `10 * 1024 * 1024` 抛 `FILE_TOO_LARGE`。

- [ ] **Step 5: 确认 GREEN**

Run: `pnpm --dir apps/api exec tsx --test test/document-import.test.ts`

Run: `pnpm lint`

Expected: 全部通过。

- [ ] **Step 6: 提交**

```powershell
git add apps/api/package.json apps/api/src/services/document-import.ts apps/api/test/document-import.test.ts pnpm-lock.yaml
git commit -m "feat: parse imported documents"
```

---

### Task 4: 结构化 AI 整理

**Files:**
- Modify: `apps/api/src/services/ai.ts`
- Modify: `apps/api/test/ai.test.ts`

**Interfaces:**

```ts
export interface EnrichmentInput {
  title: string;
  content: string;
  categories: Array<{ id: string; name: string; description?: string | null }>;
  allowTitle: boolean;
  allowSummary: boolean;
  allowClassification: boolean;
}

export interface EnrichmentResult {
  title: string | null;
  summary: string | null;
  category: string | null;
  confidence: number;
  keywords: string[];
  mode: 'ai' | 'fallback';
}

export async function enrichContent(input: EnrichmentInput): Promise<EnrichmentResult>;

export type AiServiceCode = 'AI_TIMEOUT' | 'AI_INVALID_RESPONSE' | 'AI_REQUEST_FAILED';

export class AiServiceError extends Error {
  constructor(public code: AiServiceCode, message: string);
}
```

- [ ] **Step 1: 写失败测试**

在 `apps/api/test/ai.test.ts` 增加无 AI 降级测试和结构化 AI 响应测试：

```ts
test('AI enrichment falls back without a provider', async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await enrichContent({
    title: '',
    content: '# PPO 训练\n\n记录强化学习的稳定性。',
    categories: [{ id: '1', name: '技术' }],
    allowTitle: true,
    allowSummary: true,
    allowClassification: true,
  });
  assert.equal(result.mode, 'fallback');
  assert.equal(result.title, 'PPO 训练');
  assert.equal(result.category, '技术');
});

test('AI enrichment parses one structured response', async (t) => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_CHAT_MODEL = 'test-model';
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      title: 'PPO 稳定性笔记',
      summary: '记录 PPO 训练中的稳定性问题。',
      category: '技术',
      confidence: 0.91,
      keywords: ['PPO', '强化学习'],
    }) } }],
  }), { status: 200 }));

  const result = await enrichContent({
    title: '未命名知识',
    content: 'PPO 训练记录',
    categories: [{ id: '1', name: '技术' }],
    allowTitle: true,
    allowSummary: true,
    allowClassification: true,
  });
  assert.equal(result.mode, 'ai');
  assert.equal(result.title, 'PPO 稳定性笔记');
  assert.deepEqual(result.keywords, ['PPO', '强化学习']);
});
```

- [ ] **Step 2: 确认 RED**

Run: `pnpm --dir apps/api exec tsx --test test/ai.test.ts`

Expected: FAIL，`enrichContent` 不存在。

- [ ] **Step 3: 实现一次结构化请求**

要求：

- system prompt 同时要求 title、summary、category、confidence、keywords。
- `allowTitle=false` 时忽略返回标题。
- `allowSummary=false` 时忽略返回摘要。
- `allowClassification=false` 时 category 置空。
- AI 不可用时返回 `mode: 'fallback'`，标题和摘要使用 Task 2 工具。
- 无效 JSON 或字段类型错误抛 `AiServiceError('AI_INVALID_RESPONSE', ...)`，由调用方决定降级。
- 保留 `classifyContent` 导出，内部委托 `enrichContent`，避免破坏旧测试。

- [ ] **Step 4: 确认 GREEN**

Run: `pnpm --dir apps/api exec tsx --test test/ai.test.ts`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/services/ai.ts apps/api/test/ai.test.ts
git commit -m "feat: add structured ai enrichment"
```

---

### Task 5: 入库、编辑、AI 偏好和文件 API

**Files:**
- Modify: `apps/api/src/services/entries.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/app.test.ts`
- Create: `apps/api/test/entry-update.test.ts`

**Interfaces:**

```ts
export interface IngestPayload {
  url?: string;
  content?: string;
  title?: string;
  captureType?: 'web' | 'manual' | 'clip' | 'image' | 'file';
  sourceName?: string;
  sourceMime?: string;
}

export function buildEditedEntryPatch(input: {
  current: Entry;
  patch: { title?: string; summary?: string | null; content?: string };
  hash(content: string): string;
}): Partial<Entry>;
```

- [ ] **Step 1: 写失败的编辑补丁测试**

创建 `apps/api/test/entry-update.test.ts`，断言：

```ts
assert.equal(patch.title_source, 'manual');
assert.equal(patch.summary_source, 'manual');
assert.equal(patch.content_hash, 'hash:new body');
assert.equal(patch.content, '新版正文');
```

并用真实 `createHash` 或固定字符串哈希函数验证正文未改时不重算。

- [ ] **Step 2: 确认 RED**

Run: `pnpm --dir apps/api exec tsx --test test/entry-update.test.ts`

Expected: FAIL，`buildEditedEntryPatch` 不存在。

- [ ] **Step 3: 修改入库**

在 `entries.ts`：

- `content` 使用 `normalizeMarkdown`。
- `content_hash` 使用 `contentHash(markdownToPlainText(body))`。
- 标题使用 `deriveTitle`。
- 写入 `source_name`、`source_mime`、`title_source`、`summary_source`。
- 文件正文空时直接拒绝。
- 保留现有 URL、哈希去重、任务编排和 RLS 行为。

- [ ] **Step 4: 修改归类为结构化整理**

`classifyEntry` 改为调用 `enrichContent`：

- `title_source !== 'manual'` 时才写 AI/降级标题。
- `summary_source !== 'manual'` 时才写摘要。
- 用户关闭对应开关时保留原值。
- AI 失败写入 job error，条目保持可读。

- [ ] **Step 5: 增加 AI 偏好 API**

在 `routes/index.ts` 增加：

```ts
r.get('/ai/status', ...)
r.patch('/ai/preferences', ...)
r.post('/ai/test', ...)
r.post('/entries/:id/enrich', ...)
```

`GET /ai/status` 只返回：

```ts
{
  configured,
  mode,
  chatModel,
  embeddingModel,
  embeddingDimension: 1024,
  features,
  lastError
}
```

不返回 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 或请求头。

- [ ] **Step 6: 增加 multipart 文件入口**

在 `app.ts` 或独立路由模块配置 Multer memory storage：

```ts
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
```

`POST /api/v1/entries/import`：

1. 调用 `parseDocument`。
2. 把解析后的 Markdown、`sourceName`、`sourceMime`、`captureType: 'file'` 传给 `ingest`。
3. 将 `DocumentImportError.code` 映射为 400。
4. 不把文件 Buffer 写日志。

- [ ] **Step 7: 修改编辑接口**

`PATCH /entries/:id` 使用 `buildEditedEntryPatch`：

- 标题、摘要、正文可同时更新。
- 正文变化时重算 hash。
- 手动字段写 `manual`。
- 唯一冲突返回 409。

- [ ] **Step 8: 运行测试**

Run: `pnpm --dir apps/api exec tsx --test test/entry-update.test.ts test/app.test.ts`

Run: `pnpm lint`

Expected: 全部通过。

- [ ] **Step 9: 提交**

```powershell
git add apps/api/src apps/api/test
git commit -m "feat: connect document import and ai preferences"
```

---

### Task 6: 前端采集与历史导航

**Files:**
- Modify: `apps/web/capture.html`
- Modify: `apps/web/assets/api.js`
- Modify: `apps/web/assets/app.css`
- Modify: `apps/api/test/client-static.test.ts`

**Interfaces:**

```js
KT.importFile = function (file, opts) {};
KT.aiStatus = function () {};
KT.updateAiPreferences = function (patch) {};
KT.enrichEntry = function (id) {};
KT.updateEntry = function (id, patch) {};
```

- [ ] **Step 1: 写失败的前端契约测试**

在 `client-static.test.ts` 增加：

```ts
assert.match(capture, /type="file"/);
assert.match(capture, /accept="\.md,\.txt,\.html,\.docx,\.pdf"/);
assert.match(capture, /id="dropZone"/);
assert.match(capture, /location\.replace\('detail\.html\?id='/);
assert.equal(capture.includes("UI.go('detail.html?id='"), false);
```

- [ ] **Step 2: 确认 RED**

Run: `pnpm --dir apps/api exec tsx --test test/client-static.test.ts`

Expected: FAIL，文件控件和 replace 导航不存在。

- [ ] **Step 3: 实现 API 数据层**

把现有 `req()` 扩展为两种 body 模式：

```js
function req(path, opts) {
  opts = opts || {};
  var headers = {};
  if (!opts.form) headers['Content-Type'] = 'application/json';
  var t = token();
  if (t) headers['x-session'] = t;
  var timeout = opts.timeoutMs || 15000;
  var body = opts.form ? opts.form : opts.body ? JSON.stringify(opts.body) : undefined;
}
```

增加 multipart 上传：

```js
function importFile(file, opts) {
  var form = new FormData();
  form.append('file', file, file.name);
  if (opts && opts.title) form.append('title', opts.title);
  return req('/entries/import', { method: 'POST', form: form, timeoutMs: 120000 })
    .then(normalizeIngestResult);
}
```

不要设置 multipart `Content-Type`，由浏览器生成 boundary。

- [ ] **Step 4: 重做采集页**

采集页包含：

- 可选标题输入。
- Markdown textarea。
- 文件选择按钮和拖放区。
- 选中文件后的名称、大小和移除按钮。
- 提交阶段文案：解析文档、生成标题、分类、完成。
- 成功和重复都使用 `location.replace` 进入详情。
- 失败保留页面，显示 `DocumentImportError` 中文消息。

- [ ] **Step 5: 修复返回来源**

采集成功时：

```js
location.replace('detail.html?id=' + encodeURIComponent(c.id));
```

详情页自定义返回：

```js
if (document.referrer && new URL(document.referrer).origin === location.origin) {
  history.back();
} else {
  location.href = 'library.html';
}
```

- [ ] **Step 6: 运行测试**

Run: `pnpm --dir apps/api exec tsx --test test/client-static.test.ts`

Expected: 全部通过。

- [ ] **Step 7: 提交**

```powershell
git add apps/web/capture.html apps/web/assets/api.js apps/web/assets/app.css apps/api/test/client-static.test.ts
git commit -m "feat: add document capture flow"
```

---

### Task 7: Markdown 阅读与编辑

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/sync-web-assets.mjs`
- Create: `apps/web/assets/markdown.js`
- Modify: `apps/web/detail.html`
- Modify: `apps/web/assets/app.css`
- Modify: `apps/api/test/client-static.test.ts`

**Interfaces:**

```js
export function renderMarkdown(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'],
  });
}
```

- [ ] **Step 1: 写失败测试**

在 `client-static.test.ts` 增加：

```ts
assert.match(detail, /type="module"/);
assert.match(detail, /assets\/markdown\.js/);
assert.match(detail, /id="editBtn"/);
assert.match(detail, /id="editPane"/);
assert.match(detail, /id="preview"/);
assert.match(detail, /id="saveBtn"/);
```

- [ ] **Step 2: 确认 RED**

Run: `pnpm --dir apps/api exec tsx --test test/client-static.test.ts`

Expected: FAIL，Markdown 模块和编辑控件不存在。

- [ ] **Step 3: 安装和同步本地资源**

Run:

```powershell
pnpm add -D marked@18.1.2 dompurify@3.4.17
```

`scripts/sync-web-assets.mjs` 复制：

- `node_modules/marked/lib/marked.esm.js`
- `node_modules/dompurify/dist/purify.es.mjs`

到 `apps/web/assets/vendor/`。

根 `build` 改为：

```json
"build": "node scripts/sync-web-assets.mjs && pnpm --dir apps/api build"
```

根 `dev` 也先执行同一个同步脚本，确保本地直接打开详情页时 vendor 文件存在。

- [ ] **Step 4: 实现安全渲染器**

`apps/web/assets/markdown.js`：

- import Marked 和 DOMPurify 本地 ESM 文件。
- 配置 GFM。
- 删除 `style/script/iframe/object/embed`。
- 给外部链接添加 `target="_blank" rel="noopener noreferrer"`。
- 导出 `renderMarkdown`。

- [ ] **Step 5: 重做详情渲染**

阅读态：

```js
html += '<article class="markdown-body">' + renderMarkdown(c.rawContent) + '</article>';
```

编辑态：

- 标题 input。
- 摘要 textarea。
- 正文 textarea。
- 右侧或下方实时 preview。
- 保存调用 `KT.updateEntry`，成功后更新 cache 并回到阅读态。
- 未保存时监听 `beforeunload`。

- [ ] **Step 6: 增加阅读样式**

为 `.markdown-body` 补齐标题、段落、列表、blockquote、代码、表格和链接样式。表格和代码容器使用 `overflow-x:auto`。

- [ ] **Step 7: 运行测试和构建**

Run: `pnpm --dir apps/api exec tsx --test test/client-static.test.ts`

Run: `pnpm build`

Expected: 测试通过，vendor 文件和 API dist 均生成。

- [ ] **Step 8: 提交**

```powershell
git add package.json pnpm-lock.yaml scripts/sync-web-assets.mjs apps/web/assets/markdown.js apps/web/detail.html apps/web/assets/app.css apps/api/test/client-static.test.ts
git commit -m "feat: add safe markdown reader and editor"
```

---

### Task 8: “我的” AI 管理面板

**Files:**
- Modify: `apps/web/me.html`
- Modify: `apps/web/assets/api.js`
- Modify: `apps/web/assets/app.css`
- Modify: `apps/api/test/client-static.test.ts`

**Interfaces:**
- Consumes: `KT.aiStatus()`、`KT.updateAiPreferences()`。
- Produces: 四个开关和状态展示。

- [ ] **Step 1: 写失败测试**

在 `client-static.test.ts` 增加：

```ts
assert.match(me, /id="aiSettings"/);
assert.match(me, /id="aiAutoTitle"/);
assert.match(me, /id="aiAutoSummary"/);
assert.match(me, /id="aiAutoClassify"/);
assert.match(me, /id="aiEmbeddings"/);
assert.match(me, /id="aiTest"/);
```

- [ ] **Step 2: 确认 RED**

Run: `pnpm --dir apps/api exec tsx --test test/client-static.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现设置面板**

“我的”页面增加“AI 整理”行。打开 sheet 后显示：

- 已配置/未配置。
- Chat 和 Embedding 模型。
- 四个 `role="switch"`，全部带 `aria-checked`。
- 最近失败原因。
- 测试连接按钮。

AI 未配置时开关 `disabled`，显示“当前使用规则降级”。

- [ ] **Step 4: 保存偏好**

开关变更立即调用 `PATCH /api/v1/ai/preferences`。失败时回滚 UI 并 toast。

- [ ] **Step 5: 运行测试**

Run: `pnpm --dir apps/api exec tsx --test test/client-static.test.ts`

Expected: 全部通过。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/me.html apps/web/assets/api.js apps/web/assets/app.css apps/api/test/client-static.test.ts
git commit -m "feat: add ai management panel"
```

---

### Task 9: 迁移、整体验证与 Preview

**Files:**
- Modify: `README.md`
- Modify: `docs/ops/deployment.md`
- Modify: `docs/ops/environment.md`
- Test: `pnpm test`、`pnpm lint`、`pnpm build`、`pnpm preflight`

- [ ] **Step 1: 更新文档**

记录支持格式、10 MB 限制、无 OCR、原文件不保存、AI 管理边界和新数据库字段。

- [ ] **Step 2: 应用 migration 到 `knowtree-prod`**

Run:

```powershell
pnpm dlx supabase@2.122.0 link --project-ref wkwoukdjckyrgvhseaqf
pnpm dlx supabase@2.122.0 db push
```

Expected: migration 成功，已有行保持可读。

- [ ] **Step 3: 运行全部验证**

```powershell
pnpm test
pnpm lint
pnpm build
pnpm preflight
```

Expected: 全部退出码 0。

- [ ] **Step 4: 提交并推送**

```powershell
git add README.md docs/ops
git commit -m "docs: document capture and ai capabilities"
git push origin master
```

Expected: Vercel Git 自动创建 Production。

- [ ] **Step 5: 生产浏览器验收**

使用真实账号和 agent-browser 验证：

- 上传 Markdown、DOCX、文本型 PDF。
- 无标题内容生成标题。
- 扫描 PDF 得到明确错误。
- 详情 Markdown 正确渲染。
- 编辑后保存并重新加载。
- 返回到原始业务页面。
- AI 面板四个开关和错误状态。
- 390px 移动端无横向页面溢出。


# 知树采集、文档解析与 Markdown 阅读设计

日期：2026-11-02

## 1. 目标

把现有“只能粘贴纯文本、自动标题缺失、Markdown 不渲染、返回来源错误、AI 不可管理”的流程，收敛为一条完整闭环：

```text
粘贴文本或丢入文档
  -> 服务端提取内容
  -> 自动标题、摘要、分类和关键词
  -> 去重与入库
  -> 进入 Markdown 详情
  -> 返回原始来源
```

本阶段优先解决真实使用阻断，不扩展到 OCR、原文件管理或公开注册。

## 2. 非目标

- 不保存 PDF、DOCX、HTML 等原始文件。
- 不做扫描版 PDF 或图片 OCR。
- 不允许在浏览器填写 AI API Key、Base URL 或 Embedding 密钥。
- 不公开注册，账号继续由管理员预先创建。
- 不引入新的前端框架或第二套设计系统。
- 不尝试恢复历史条目已经丢失的换行和 Markdown 结构。

## 3. 用户流程

### 3.1 文本或 Markdown 采集

1. 用户从首页进入“丢一条”。
2. 用户可以输入 Markdown，也可以拖放或选择一个文件。
3. 标题、摘要和分类均为空时，由系统自动生成。
4. 提交按钮展示解析、整理和入库阶段，避免只显示模糊的“加载中”。
5. 成功后直接替换当前采集页为详情页。
6. 重复内容不重新创建，跳到已有条目并提示“已存在，权重已增加”。
7. 文件解析失败时保留采集页，显示具体原因，允许重新选择文件。

### 3.2 返回行为

- 从首页进入采集，详情页返回首页。
- 从知识库进入采集，详情页返回知识库。
- 从收件箱进入采集，详情页返回收件箱。
- 直接打开详情 URL 时，返回按钮回退到知识库。
- 相关条目之间使用正常 history push；返回回到上一条详情。
- 删除详情后使用 replace 进入知识库，避免返回已删除页面。

## 4. 文档导入

### 4.1 支持格式

- `.md`：按 UTF-8 读取并保留 Markdown 结构。
- `.txt`：按 UTF-8 读取，保留段落。
- `.html`：提取正文并转换为 Markdown。
- `.docx`：Mammoth 转 HTML，再转 Markdown。
- `.pdf`：`unpdf` 提取文本层；空文本明确提示暂不支持 OCR。

单文件限制为 10 MB，提取后正文限制为 500,000 字符。一次提交一个文件，多文件批量导入不在本阶段。

### 4.2 校验

- 同时检查扩展名、声明 MIME 和文件魔数。
- PDF 必须包含 `%PDF-`，DOCX 必须为 ZIP 容器。
- 文本类文件去除 BOM，统一 CRLF/LF。
- 文件名只作为展示来源，不用于拼接服务器路径。
- 不支持、损坏、空正文和超限文件返回稳定错误码和中文提示。

### 4.3 存储

- 原文件不写入 Supabase Storage。
- `entries.content` 保存解析后的 Markdown 或纯文本。
- `entries.source_name` 保存清洗后的文件名。
- `entries.source_mime` 保存检测后的 MIME。
- `entries.capture_type` 新增 `file`。

## 5. 内容与标题

### 5.1 内容归一化

- 展示内容只统一换行、去除行尾空白并把连续空行限制为两个。
- 去重哈希使用压平空白和 Markdown 标记后的文本，不使用展示正文本身。
- 编辑正文时必须重新计算 `content_hash`，并处理唯一索引冲突。

### 5.2 标题降级顺序

1. 用户显式填写的标题。
2. Markdown 的第一个一级或二级标题。
3. 文件名去掉扩展名。
4. 正文第一句，最多 60 字。
5. “未命名知识”。

### 5.3 摘要降级顺序

1. AI 生成摘要。
2. 第一个非标题正文段落，最多 120 字。
3. 空摘要。

### 5.4 来源标记

`entries.title_source` 与 `entries.summary_source` 使用以下值：

- `manual`
- `ai`
- `fallback`
- `imported`
- `legacy`

历史记录迁移为 `legacy`。用户手动编辑标题或摘要后，对应来源改为 `manual`，后续自动任务不得覆盖。

## 6. AI 整理

### 6.1 单次结构化请求

每次采集只发起一次聊天模型请求，返回：

```json
{
  "title": "精炼标题",
  "summary": "80 字以内摘要",
  "category": "已有或建议分类",
  "confidence": 0.82,
  "keywords": ["关键词"]
}
```

AI 失败、超时或 JSON 无效时不回滚已入库内容；保留确定性标题、摘要和规则分类，并把失败原因关联到任务。

### 6.2 Embedding

只有全局 Embedding 已配置且用户开启语义检索时，才发起 embedding 请求。维度继续固定为 1024；维度不符时该任务失败，但不影响条目阅读。

### 6.3 手动重新整理

详情页提供“重新整理”操作：

- 只在用户主动点击时覆盖非手动标题和摘要。
- 分类仍遵循自动分类阈值。
- 手动标题或摘要永不被覆盖。
- 执行期间按钮进入忙碌状态；失败只显示错误，不丢失正文。

## 7. AI 管理

“我的”页面增加“AI 整理”面板：

- 全局配置状态：已配置或未配置。
- 当前聊天模型、Embedding 模型和向量维度。
- 自动标题、自动摘要、自动分类、语义检索四个开关。
- 当前模式：AI 或规则降级。
- 最近 AI 任务失败原因。
- “测试连接”按钮。

密钥、Base URL 和真实认证头不返回浏览器。未配置 AI 时，四个开关保持可见但禁用，并说明当前使用规则降级。

用户开关保存到 `profiles`：

- `ai_auto_title`
- `ai_auto_summary`
- `ai_auto_classify`
- `ai_embeddings_enabled`

## 8. API

### 8.1 文件导入

`POST /api/v1/entries/import`

- `Content-Type: multipart/form-data`
- `file`：单个文件。
- `title`：可选。

响应复用现有 ingest 结果结构，返回 entry、jobs、去重状态和错误信息。

### 8.2 AI

- `GET /api/v1/ai/status`：配置、模型、能力和最近错误。
- `PATCH /api/v1/ai/preferences`：更新四个布尔开关。
- `POST /api/v1/ai/test`：用最小请求验证聊天模型连通性。
- `POST /api/v1/entries/:id/enrich`：手动重新整理。

### 8.3 条目编辑

继续使用 `PATCH /api/v1/entries/:id`，但：

- 允许同时更新标题、摘要和正文。
- 正文变化时重算哈希。
- 手动字段更新来源标记。
- 返回冲突错误，不静默覆盖已有内容。

## 9. Markdown 阅读与编辑

详情页分为阅读态和编辑态。

### 9.1 阅读态

- 使用本地 `marked` 解析 Markdown。
- 使用本地 `DOMPurify` 清洗 HTML。
- 支持标题、列表、引用、代码块、表格、链接和分隔线。
- 外部链接增加 `rel="noopener noreferrer"`。
- 代码块和表格在移动端允许横向滚动。
- 长链接强制换行。
- 不依赖 CDN。

### 9.2 编辑态

- 标题使用单行输入。
- 摘要和正文使用 textarea。
- 正文提供实时预览。
- 保存按钮显式提交，不自动覆盖。
- 有未保存修改时离开页面会提示。
- 保存成功后回到阅读态并刷新页面数据。

## 10. 数据库迁移

新增一个 migration，包含：

1. 更新 `entries.capture_type` 约束，增加 `file`。
2. 增加 `entries.source_name`、`source_mime`。
3. 增加 `entries.title_source`、`summary_source`，历史行填 `legacy`。
4. 增加 `profiles` 四个 AI 布尔开关，默认均为 `true`。
5. 保持 RLS、grant 和所有权规则不变。

不新增附件表，不新增 Storage bucket。

## 11. 技术边界

后端模块：

- `document-import.ts`：类型检测、魔数校验、格式解析和正文提取。
- `enrichment.ts`：标题、摘要、分类、关键词和手动重试。
- `markdown.ts`：Markdown 归一化和去重文本生成。

前端模块：

- `markdown.js`：本地 Markdown 渲染和清洗。
- `capture.html`：文本、拖放、文件选择和阶段状态。
- `detail.html`：阅读、编辑、预览和来源标记。
- `me.html`：AI 状态与能力开关。

依赖固定版本并提交 lockfile：

- `mammoth`
- `unpdf`
- `turndown`
- `multer`
- `marked`
- `dompurify`

Markdown 浏览器依赖以本地静态资产部署，不从第三方 CDN 加载。

## 12. 错误处理

稳定错误类型至少包括：

- `FILE_TOO_LARGE`
- `FILE_TYPE_UNSUPPORTED`
- `FILE_CORRUPT`
- `DOCUMENT_EMPTY`
- `PDF_TEXT_LAYER_MISSING`
- `AI_NOT_CONFIGURED`
- `AI_TIMEOUT`
- `AI_INVALID_RESPONSE`
- `CONTENT_CONFLICT`

页面把错误映射为可操作的中文提示。安全细节和密钥不得出现在浏览器错误中。

## 13. 测试与验收

### 13.1 自动化

- 文本、Markdown、HTML、DOCX、文本型 PDF 的解析夹具测试。
- 超限、伪造扩展名、损坏文件、扫描 PDF 和空正文测试。
- Markdown 归一化不丢失必要结构，去重哈希不受排版差异影响。
- AI 开关、结构化响应、超时和失败降级测试。
- 手动标题/摘要不被自动任务覆盖。
- 编辑正文后哈希更新和冲突处理测试。
- Markdown XSS、危险链接和外部链接属性测试。
- 文件导入 API 的 multipart 集成测试。
- 数据库 migration 的约束、默认值和 RLS 回归测试。

### 13.2 浏览器

- 390px 和桌面端均可完成文本与文档采集。
- 采集成功后浏览器返回上一业务页面，不回采集页。
- 详情阅读、编辑、实时预览和保存可用。
- AI 状态、四个开关和错误提示可用。
- 控制台无错误，axe 无 serious/critical 违规。

## 14. 上线与兼容

1. 先应用数据库 migration。
2. 部署 Preview，使用真实 DOCX 和文本型 PDF 验证。
3. 检查 Vercel Function 包体积、内存和超时。
4. 验证 AI 未配置与已配置两种模式。
5. Preview 通过后合并 `master`，由 Git 集成自动发布 Production。

已有条目的文本继续可读，但历史换行和 Markdown 不会重建。用户需要更完整的格式时，可以重新导入原文档。

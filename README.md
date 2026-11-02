# 知树 KnowTree

个人知识管理网站：**丢一条 → 自动入树 → 每日送回**。

当前 M0 采用一个 Vercel 项目承载网站与 `/api/v1`，数据、登录和向量检索使用 Supabase。生产代码不再依赖扣子运行时、扣子 CDN、Coze SDK 或直连 Postgres。

## 架构

```text
浏览器
  │  同源页面 + /api/v1
  ▼
Vercel / Express
  │
  ├─ Supabase Auth       邮箱密码登录
  ├─ Supabase Postgres   业务数据 + RLS
  ├─ pgvector            语义搜索与互链
  └─ OpenAI 兼容服务     归类、摘要、embedding（可选）
```

- **用户请求**通过 Supabase publishable key + 用户 access token 执行，受 RLS 约束。
- **后台任务**使用只存在 Vercel 服务端的 Supabase secret key。
- **即时任务**在收录响应后通过 Vercel `waitUntil` 执行。
- **补偿任务**由受 `CRON_SECRET` 保护的 Vercel Cron 每日执行一次。
- **无 AI 配置**时，分类自动降级为确定性规则，搜索降级为关键词；网站仍可使用。

## 目录

| 路径 | 内容 |
|---|---|
| `client/` | 生产静态 H5，多页 HTML/CSS/JS，无前端构建步骤 |
| `server/` | Express API、领域服务、Supabase 访问层、测试 |
| `server.ts` | Vercel 的 Express 入口 |
| `supabase/` | Supabase CLI 配置与数据库 migration |
| `01-Docs/` | 产品、设计、接口资料；旧平台交付记录属于历史归档 |
| `02-Design/` | 原型、设计 token、视觉参考 |
| `03-Code/` | 本地 mock 联调服务说明 |
| `04-Archive/` | 历史前端快照 |

## 本地运行

环境要求：Node.js 20+、pnpm 11、可选的 Docker（仅本地 Supabase 需要）。

```bash
pnpm install
cp .env.example .env
pnpm dev
```

打开 `http://localhost:9091/`。Express 同时提供网站和 API，所以浏览器默认走同源 `/api/v1`，不需要再手填 API Base 或 access token。

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env
pnpm dev
```

### 本地 Supabase

```bash
pnpm dlx supabase@2.122.0 start
pnpm dlx supabase@2.122.0 db reset
```

本地启动后，把 CLI 输出的项目 URL、publishable key 和 secret key 填入 `.env`。`.env` 已被 Git 忽略，不能提交。

## 环境变量

完整模板见 `.env.example`。

| 变量 | 必填 | 说明 |
|---|---:|---|
| `SUPABASE_URL` | 是 | Supabase Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | 是 | `sb_publishable_...`，可返回给浏览器 |
| `SUPABASE_SECRET_KEY` | 是 | `sb_secret_...`，只放服务端 |
| `OPENAI_API_KEY` | 否 | OpenAI 兼容服务密钥；不填则启用规则降级 |
| `OPENAI_BASE_URL` | 否 | 默认 `https://api.openai.com/v1` |
| `OPENAI_CHAT_MODEL` | 否 | 归类模型 |
| `OPENAI_EMBEDDING_MODEL` | 否 | 1024 维 embedding 模型 |
| `CRON_SECRET` | 生产必填 | Vercel Cron 请求鉴权 |
| `ALLOWED_ORIGIN` | 否 | 仅跨域本地开发时需要 |

`SUPABASE_SECRET_KEY`、`OPENAI_API_KEY`、`CRON_SECRET` 不得写入前端、Git 或截图。

## 数据库

Migration 位于 `supabase/migrations/`，包含：

- 8 张业务表：`profiles`、`categories`、`sources`、`entries`、`entry_versions`、`links`、`jobs`、`daily_recalls`
- 全表 RLS、显式 grant、用户所有权策略
- pgvector `vector(1024)` 与 HNSW 索引
- `match_entries` 语义检索函数
- `claim_due_jobs` 原子任务抢占函数
- `updated_at` 触发器与常用查询索引

这份 migration 以空项目为基线。如果旧扣子环境已经有同名表，不要直接 `db push` 覆盖；应先把线上 schema 导出并做差异核对，或者新建一个干净的 Supabase 项目。

推送到 Supabase 项目：

```bash
pnpm dlx supabase@2.122.0 link --project-ref <PROJECT_REF>
pnpm dlx supabase@2.122.0 db push
```

第一阶段不开放公开注册：`supabase/config.toml` 已关闭本地 signup。远程项目也应在 Supabase Auth 中关闭公开注册，并通过 Dashboard 或管理员 API 预先创建账号。

## Vercel 部署

在 Vercel 导入本 GitHub 仓库，Root Directory 保持仓库根目录。Vercel 会识别根级 `server.ts` 的 Express 应用，无需把前端和后端拆成两个项目。

在 Vercel Project Settings → Environment Variables 添加上述服务端变量，然后部署。`vercel.json` 已配置：

- Node Function 最大执行时间 300 秒
- Express 函数包含 `client/**/*` 静态资产
- 每日任务：`GET /api/v1/cron/jobs`

Vercel Cron 会携带 `Authorization: Bearer $CRON_SECRET`。不要在客户端调用该地址。

## 验证

```bash
pnpm test
pnpm lint
pnpm build
```

测试覆盖应用入口、公共配置隔离、AI 无密钥降级、后台调度、前端去扣子、同源 API、RLS migration 和无直连 Postgres 约束。

## 当前边界

| 项 | 当前实现 |
|---|---|
| 登录 | 邮箱密码；账号预先创建 |
| AI | OpenAI 兼容接口；可完全关闭 |
| 语义向量 | 固定 1024 维，模型配置必须与数据库一致 |
| 任务补偿 | Vercel Hobby 支持每日 Cron；即时任务由 `waitUntil` 触发 |
| 收藏 / 回收站 | 尚未提供 |
| 分类计数 | 前端按 `parent_id` 递归聚合 |
| 历史文档 | `01-Docs`、`02-Design` 中的旧平台描述仅作设计溯源，以本 README 和当前代码为准 |

接口字段与行为以代码和 [后端接口契约](01-Docs/接口/后端接口契约.md) 为准。

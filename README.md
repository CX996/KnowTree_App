# 知树 KnowTree

个人知识管理网站：**丢一条 → 自动入树 → 每日送回**。

当前 M0 使用一个 Vercel 项目同时托管网站和 `/api/v1`，Supabase 提供 Auth、Postgres 与 pgvector。生产代码不依赖扣子运行时、扣子 CDN、Coze SDK 或直连 Postgres。

## 生产界面

只保留真实可用的核心流程：

1. 登录。
2. 知识树首页。
3. 知识库与分类筛选。
4. 搜索。
5. 收录。
6. 待确认收件箱。
7. 知识详情。
8. 每日回溯。
9. 完整账户中心、会话退出、导出和 7 天冷静期注销。
10. Owner 邀请管理、两级分类管理和 30 天回收站。
11. 常驻、可拖动、三档尺寸的小黑狐。

不展示假统计或演示数据。知树当前是邀请制产品，不开放公开注册。

## 收录方式

- 直接输入文字或 Markdown。
- 拖放或选择 `.md`、`.txt`、`.html`、`.docx` 和文本型 `.pdf`，单文件最大 10 MB。
- 原文件不会上传到 Supabase Storage，只保存解析后的正文和来源文件名。
- 未填写标题时，从 Markdown 标题、文件名、首句或 AI 结果自动生成。
- 详情页支持安全 Markdown 阅读、标题/摘要/正文编辑和实时预览。
- 扫描版 PDF 和图片 OCR 暂不支持。

## 架构

```text
浏览器
  │  同源页面 + /api/v1
  ▼
Vercel / Express
  │
  ├─ Supabase Auth       邀请注册、登录、密码和安全会话
  ├─ Supabase Postgres   业务数据 + RLS
  ├─ pgvector            语义搜索与互链
  └─ OpenAI 兼容服务     归类、摘要、embedding（可选）
```

- 用户请求使用 publishable key + access token，执行受 RLS 约束。
- 浏览器登录和邀请注册走同源 `/api/v1/auth/*` 代理，不直接依赖手机访问 Supabase 域名。
- 每个受保护请求校验 JWT `session_id` 仍在 `auth.sessions`；JWT 有效期为 15 分钟。
- 后台任务和账号管理使用只存在服务端的 Supabase secret key。
- 收录后由 Vercel `waitUntil` 处理任务，Cron 负责补偿重试。
- 未配置 AI 时使用规则分类和关键词搜索降级。

## 目录

| 路径 | 职责 |
|---|---|
| `apps/web/` | 生产静态 H5，多页 HTML/CSS/JS |
| `apps/api/` | Express API、领域服务、Supabase 访问和测试 |
| `docs/product/` | 当前产品方案 |
| `docs/design/` | 设计契约与 UI 稿 |
| `docs/api/` | 后端接口契约 |
| `docs/ops/` | 部署与环境变量手册 |
| `design/references/` | 视觉参考，不参与生产部署 |
| `tools/mock/` | 本地 mock 联调服务 |
| `supabase/` | Supabase CLI 配置与数据库 migration |
| `scripts/` | 仓库检查和部署预检 |
| `api/index.js` | Vercel Serverless API 入口，导入构建后的 Express App |

## 本地运行

环境要求：Node.js 24 LTS、pnpm 11；本地 Supabase 额外需要 Docker。

```powershell
pnpm install
Copy-Item .env.example .env
pnpm dev
```

打开 `http://localhost:9091/`。网站和 API 同源，无需填写 API Base 或 access token。

## 常用命令

```powershell
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm preflight
pnpm worker
```

## Supabase

本地启动与重建：

```powershell
pnpm dlx supabase@2.122.0 start
pnpm dlx supabase@2.122.0 db reset
```

远程空项目：

```powershell
pnpm dlx supabase@2.122.0 login
pnpm dlx supabase@2.122.0 link --project-ref <PROJECT_REF>
pnpm dlx supabase@2.122.0 db push
```

Migration 包含业务表、邀请/审计/错误事件、RLS、显式 grant、pgvector、HNSW、语义检索函数、原子任务抢占函数和会话校验函数。

如果旧项目已有同名表，不要直接推送。先导出线上 schema 并核对，或新建空项目。

当前阶段：

- Supabase 全局公开注册关闭。
- 邮箱密码登录提供方保持开启。
- 新用户只能通过 Owner 创建的专属邀请注册，邀请 7 天有效且只能使用一次。
- 邀请阶段不发送邀请邮件，邀请链接由 Owner 手动复制。
- 邮箱确认暂时关闭；受邀账号在知树中显示“邮箱待验证”，不冒充已验证。
- 密码至少 8 位并同时包含字母和数字，匿名登录保持关闭。

首个 Owner 需要由部署者在 Supabase Dashboard 创建 Auth 用户，设置
`app_metadata.role = "owner"`，并确保对应 `profiles` 行存在。应用不提供自助
提升 Owner。

## Vercel

在 Vercel 导入 GitHub 仓库，Root Directory 保持仓库根目录。Vercel 使用 `api/index.js` 提供共享 API 入口，并用 `vercel.json` rewrite 接收 `/api/:path*`；`apps/web` 作为静态输出目录。

`api/index.js` 只导入 `apps/api/dist/app.js`，并把 rewrite 传入的 `path` 恢复为 Express 需要的 `/api/v1/...` 请求路径。API 的 TypeScript 类型检查由 `pnpm lint` 在本地和 CI 中完成，Vercel 函数构建只消费已生成的 JavaScript，避免其临时函数目录缺少类型依赖。

上线前阅读：

- [部署手册](docs/ops/deployment.md)
- [环境变量](docs/ops/environment.md)

Vercel 环境变量至少包括：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `CRON_SECRET`

AI 配置可选。任何服务端密钥都不得写入前端、Git 或截图。

## 验证

```powershell
pnpm test
pnpm lint
pnpm build
pnpm preflight
```

自动化覆盖目录边界、公共配置隔离、AI 降级、后台调度、前端核心流程、表单语义、访问标准、RLS migration 和 Vercel 入口。

真实环境验证可运行：

```powershell
pnpm --dir apps/api exec node --use-env-proxy --import tsx scripts/verify-foundation-live.ts
```

该脚本创建临时 Owner 和受邀账号，验证邀请、账户、分类、回收站、重新认证与错误诊断后自动删除测试数据，不输出密码或令牌。

## 当前边界

| 项 | 当前实现 |
|---|---|
| 登录 | 邮箱密码和找回密码；新账号必须使用 Owner 邀请 |
| 账户安全 | 昵称、当前会话、修改密码、退出当前/全部设备、7 天注销冷静期 |
| 错误 | 稳定中文摘要、字段错误、可复制 requestId；Owner 查看脱敏诊断 |
| AI | 一次结构化请求生成标题、摘要、分类和关键词；在“我的 → AI 整理”管理能力 |
| 文档导入 | MD、TXT、HTML、DOCX、文本型 PDF；不保存原文件、不含 OCR |
| Markdown | 本地解析与 XSS 清洗；详情页支持和编辑实时预览 |
| 移动端 | 响应式 H5；登录、注册、采集、阅读和编辑支持手机浏览器 |
| 向量 | 固定 1024 维 |
| 任务补偿 | Vercel Cron 每日检查 |
| 分类 | 最多两级；只允许删除空分类 |
| 回收站 | 30 天搜索/恢复/永久删除；到期后台清理 |
| 收藏 | 不提供 |
| 分类计数 | 前端按 `parent_id` 递归聚合 |

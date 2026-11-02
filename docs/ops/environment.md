# 知树环境变量

所有密钥只放在本机 `.env` 或 Vercel 环境变量中。不要提交 `.env`、截图密钥或把服务端密钥写入前端代码。

## 服务端变量

| 变量 | 必填 | 公开范围 | 说明 |
|---|---:|---|---|
| `SUPABASE_URL` | 是 | 可公开 | Supabase Project URL，必须使用 HTTPS |
| `SUPABASE_PUBLISHABLE_KEY` | 是 | 可公开 | `sb_publishable_...`，由 `/api/v1/config` 返回给浏览器 |
| `SUPABASE_SECRET_KEY` | 是 | 仅 Vercel 服务端 | `sb_secret_...`，后台任务和账号管理使用 |
| `CRON_SECRET` | 是 | 仅 Vercel 服务端 | 至少 16 字符，保护 `/api/v1/cron/jobs` |
| `OPENAI_API_KEY` | 否 | 仅 Vercel 服务端 | OpenAI 兼容服务密钥；留空时启用规则降级 |
| `OPENAI_BASE_URL` | 否 | 仅 Vercel 服务端 | 默认 `https://api.openai.com/v1` |
| `OPENAI_CHAT_MODEL` | 否 | 仅 Vercel 服务端 | 结构化整理模型：标题、摘要、分类和关键词；配置 Key 时必填 |
| `OPENAI_EMBEDDING_MODEL` | 否 | 仅 Vercel 服务端 | 适配 1024 维向量的 embedding 模型 |
| `ALLOWED_ORIGIN` | 否 | 可公开 | 仅跨域本地开发使用，多个来源用逗号分隔 |
| `PORT` | 否 | 可公开 | 本地 Express 端口，默认 `9091` |

## 安全边界

- `SUPABASE_PUBLISHABLE_KEY` 可以由浏览器读取，但数据权限由 RLS 决定。
- `SUPABASE_SECRET_KEY` 绕过 RLS，只允许出现在 Vercel 环境变量和受控服务端。
- `OPENAI_API_KEY` 与 `CRON_SECRET` 不得进入 `apps/web` 或 Git 历史。
- 配置 AI 后，模型 embedding 维度必须为 1024；切换 embedding 模型时应重新生成旧向量。
- “我的 → AI 整理”只管理自动标题、自动摘要、自动分类和语义检索开关；API Key 与 Base URL 永不下发浏览器。
- AI 失败时保留确定性标题、摘要和规则分类，并在 profile 中记录最近错误。
- 公开注册保持关闭，第一阶段账号由管理员预先创建。

## 本机配置

```powershell
Copy-Item .env.example .env
pnpm preflight
pnpm dev
```

`apps/api` 启动时读取仓库根目录 `.env`。该文件已被 `.gitignore` 忽略。

## Vercel 配置

在 Vercel Project Settings → Environment Variables 中为 Production 和 Preview 配置相同变量。密钥类型变量应使用 Sensitive/Encrypted 设置。

部署前执行：

```powershell
pnpm preflight
```

预检只报告变量名和格式问题，不输出变量值。

# 知树环境变量

所有密钥只放在本机 `.env` 或 Vercel 环境变量中。不要提交 `.env`、截图密钥或把服务端密钥写入前端代码。

## 服务端变量

| 变量 | 必填 | 公开范围 | 说明 |
|---|---:|---|---|
| `SUPABASE_URL` | 是 | 可公开 | Supabase Project URL，必须使用 HTTPS |
| `SUPABASE_PUBLISHABLE_KEY` | 是 | 可公开 | `sb_publishable_...`，由 `/api/v1/config` 返回给浏览器 |
| `SUPABASE_SECRET_KEY` | 是 | 仅 Vercel 服务端 | `sb_secret_...`，后台任务和账号管理使用 |
| `CRON_SECRET` | 是 | 仅 Vercel 服务端 | 至少 16 字符，保护 `/api/v1/cron/jobs` |
| `PUBLIC_APP_ORIGIN` | 否 | 可公开 | 生成邀请链接的稳定站点 Origin；未设置时使用请求 Host |
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
- Supabase 全局自助注册关闭；邮箱密码登录提供方保持开启。
- 新用户只能通过绑定邮箱的邀请注册，邀请 token 只保存哈希。
- 当前 SMTP 未配置阶段关闭邮件确认；账户中心明确显示“邮箱待验证”。
- 密码至少 8 位且同时包含字母和数字；匿名登录保持关闭。
- 邀请接口、密码重新认证和邮件服务使用限速；用户端不显示第三方原始错误。

## 本机配置

```powershell
Copy-Item .env.example .env.local
pnpm preflight
pnpm dev
```

`apps/api` 启动时优先读取仓库根目录 `.env.local`，再补充 `.env`。这些文件均不得提交。

## Vercel 配置

在 Vercel Project Settings → Environment Variables 中为 Production 和 Preview 配置相同变量。密钥类型变量应使用 Sensitive/Encrypted 设置。

部署前执行：

```powershell
pnpm preflight
```

预检只报告变量名和格式问题，不输出变量值。

## Supabase Auth

- Site URL：`https://knowtree-app.vercel.app`
- Redirect URLs：生产域名 `/**`，本地开发允许 `http://localhost:8080/**` 和 `http://localhost:9091/**`
- Global signup：关闭
- Email password provider：开启
- Email confirmation：临时关闭，注册后直接登录
- JWT expiry：900 秒
- Anonymous sign-in：关闭
- Password：至少 8 位，同时包含字母和数字

Supabase 默认邮件服务每小时通常只能发送 2 封邮件。配置自有 SMTP 后应重新开启
Email confirmation；公开推广前必须恢复邮件验证。

Leaked Password Protection 需要 Supabase Pro 及以上计划。当前项目若未启用该项，
Advisor 会保留一条外部认证提醒；在升级计划前应继续执行至少 8 位的字母加数字
密码规则。

# 知树部署手册

目标架构：一个 Vercel 项目同时托管 `apps/web` 和 `/api/v1`，Supabase 提供 Auth、Postgres 和 pgvector。

主数据库部署在 Supabase `ap-southeast-1`（新加坡），因此 Vercel Functions
固定使用 `sin1`，避免每次鉴权和数据库读写跨太平洋往返。若以后迁移 Supabase
项目区域，必须同步修改 `vercel.json` 的 `regions`。

## 1. 创建 Supabase 项目

在 Supabase Dashboard 新建一个空项目，记录 Project Ref、Project URL、publishable key 和 secret key。

不要直接对已有同名表的旧项目执行 migration。已有项目应先导出 schema 并核对差异。

## 2. 推送数据库迁移

```powershell
pnpm dlx supabase@2.122.0 login
pnpm dlx supabase@2.122.0 link --project-ref <PROJECT_REF>
pnpm dlx supabase@2.122.0 db push
```

迁移会创建 8 张业务表、RLS、pgvector 与任务函数。执行后检查：

- Supabase Table Editor 中能看到业务表。
- 所有业务表已启用 RLS。
- `vector` 扩展已安装。
- migration 列表只有本次基线。

## 3. 配置邮箱注册

在 Supabase Auth 设置中：

- 开启 Email signup。当前无自有 SMTP 的测试阶段临时关闭 Email confirmation；配置 SMTP 后必须重新开启。
- 关闭 Anonymous sign-in。
- 密码最小长度设为 8，并要求同时包含字母和数字。
- Site URL 设为 `https://knowtree-app.vercel.app`。
- Redirect URLs 至少包含 `https://knowtree-app.vercel.app/**`、`http://localhost:8080/**` 和 `http://localhost:9091/**`。

公开推广前配置自有 SMTP。Supabase 默认邮件服务只适合小规模测试，且每小时通常最多发送 2 封邮件。

## 4. 创建首个账号

打开 `/register.html`，使用真实邮箱完成注册和邮件确认。首次登录后，应用会自动创建 profile 和 4 个默认分类。

## 5. 配置 Vercel 环境变量

按 `docs/ops/environment.md` 在 Vercel 项目环境变量中配置：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `CRON_SECRET`
- 可选 AI 变量

## 6. 导入 Vercel 项目

在 Vercel 中导入 GitHub 仓库 `CX996/KnowTree_App`：

- Root Directory：仓库根目录
- API Function：`api/index.js`
- Output Directory：`apps/web`
- 不需要拆成前端和后端两个项目

推送分支后创建 Preview Deployment，不要先升级 Production。

如果 `vercel git connect` 提示无法连接仓库，先在 Vercel 项目 Settings → Git 中完成 GitHub 授权。授权完成前仍可使用 `vercel deploy --prod` 手动发布；GitHub 推送本身不受影响。

GitHub 授权完成后，Vercel 会跟踪 `master`：推送到 `master` 自动创建 Production，推送到其他分支自动创建 Preview。

## 7. Preview 上线检查

在 Preview 域名上依次检查：

1. `GET /api/v1/health` 返回 `{"status":"ok"}`。
2. `GET /api/v1/config` 返回 Supabase URL 和 publishable key，不包含 secret key。
3. 注册新账号，确认收到验证邮件，并通过邮件链接回到登录页。
4. 首页知识树和统计正常加载。
5. 收录一条文字，任务完成并出现在知识库。
6. 分别导入 Markdown、DOCX 和文本型 PDF，确认标题、摘要和来源信息生成。
7. 上传扫描版 PDF，确认提示没有文字层而不是静默失败。
8. 详情页 Markdown 标题、列表、引用、代码和表格正常渲染。
9. 编辑标题、摘要和正文，保存后刷新仍保留。
10. 从首页进入采集，详情返回首页而不是采集页。
11. “我的 → AI 整理”显示配置状态、模型和四个能力开关。
12. 分类筛选、搜索、收件箱和每日回溯可用。
13. 测试忘记密码，确认重置链接可打开并设置新密码。
14. 浏览器控制台无错误，刷新页面后登录状态可恢复。

## 8. 发布 Production

Preview 检查全部通过后，将 Preview 提升为 Production：

```powershell
vercel promote <preview-url>
```

生产域名确认后，再在 Vercel Cron 中验证 `/api/v1/cron/jobs` 能携带 `CRON_SECRET` 被调用。

Deployment Protection 建议设为仅保护 Preview；Production 自动域名应允许访客访问。

## 9. 回滚

- Web/API 故障：在 Vercel 中回滚到上一个 READY Production Deployment。
- 数据库故障：停止写入，从 Supabase Backup 恢复；不要在故障状态继续执行新 migration。
- 密钥泄露：立即在 Supabase/OpenAI 轮换密钥，并更新 Vercel 环境变量后重新部署。

## 10. 上线后观察

- 检查 Vercel Functions 错误日志和超时。
- 检查 Supabase Auth 登录失败和数据库连接数。
- 检查后台 jobs 是否长期停留在 `running` 或 `failed`。
- 检查 AI 成本、embedding 维度和 1024 维数据库字段是否一致。

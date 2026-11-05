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

迁移会创建业务表、邀请/审计/错误事件、RLS、pgvector、会话校验和任务函数。执行后检查：

- Supabase Table Editor 中能看到业务表。
- 所有业务表已启用 RLS。
- `vector` 扩展已安装。
- migration 列表包含 `init_knowtree`、`capture_document_ai`、`foundation_security` 和 `invited_email_status`。

## 3. 配置邀请制 Auth

在 Supabase Auth 设置中：

- 关闭全局 User Signup。
- 保持 Email Password Provider 开启，让现有用户仍可登录。
- 当前无自有 SMTP 阶段关闭 Email confirmation；配置 SMTP 后必须重新开启。
- JWT expiry 设为 `900` 秒。
- 关闭 Anonymous sign-in。
- 密码最小长度设为 8，并要求同时包含字母和数字。
- Site URL 设为 `https://knowtree-app.vercel.app`。
- Redirect URLs 至少包含 `https://knowtree-app.vercel.app/**`、`http://localhost:8080/**` 和 `http://localhost:9091/**`。

公开推广前配置自有 SMTP。Supabase 默认邮件服务只适合小规模测试，且每小时通常最多发送 2 封邮件。

## 4. 创建首个 Owner

公开注册已关闭，首个 Owner 需要由受控部署者创建：

1. 在 Supabase Dashboard → Authentication → Users 创建或邀请 Owner 邮箱。
2. 在服务端设置该用户 `app_metadata.role = "owner"`，不要写入用户可编辑元数据。
3. 确保 `public.profiles` 存在对应 `user_id`；可运行：

```sql
insert into public.profiles (user_id, display_name)
values ('<OWNER_USER_ID>', '<DISPLAY_NAME>')
on conflict (user_id) do nothing;
```

后续普通用户由 Owner 在 `admin-invites.html` 创建邀请。

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
3. 直接访问 Supabase `/auth/v1/signup` 被拒绝。
4. Owner 创建绑定邮箱邀请，链接 7 天内可用且只能注册一次。
5. 受邀账号注册后进入账户中心，邮箱显示“待验证”。
6. 首页、知识树、统计和分类正常加载。
7. 收录一条文字，删除后立即撤销，并能在回收站恢复。
8. 分类最多两级，有知识或子分类时删除返回冲突。
9. 详情页 Markdown 和编辑预览正常，失败不丢失输入。
10. 修改密码或退出所有设备后旧会话失效。
11. 普通用户看不到 Owner 页面；错误只显示中文摘要与 requestId。
12. 注销进入 7 天冷静期，恢复页可以取消和导出。
13. 宠物三档尺寸、拖动、重置和指针中断后仍保持可见。
14. 手机和桌面浏览器控制台无错误。

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

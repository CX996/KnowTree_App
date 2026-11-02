# 知树单仓整合与部署准备设计

日期：2026-11-02

## 1. 目标

将当前“编号资料目录 + 根级源码目录”整理成标准单仓，保留一个 Vercel 项目、同源 `/api/v1` 和现有业务接口，并为首次上线提供可执行的预检、迁移和部署流程。

## 2. 非目标

- 不修改业务 API 路径、字段、状态枚举和前端交互。
- 不重写静态前端框架。
- 不拆成两个 Vercel 项目。
- 不在没有 Supabase/Vercel 凭据的情况下创建线上资源。
- 不自动向已有非空 Supabase 项目覆盖迁移。

## 3. 目标结构

```text
/
├─ apps/
│  ├─ web/                 # 原 client/
│  └─ api/                 # 原 server/
├─ docs/
│  ├─ product/             # 原 01-Docs/产品
│  ├─ design/              # 原 01-Docs/设计
│  ├─ api/                 # 原 01-Docs/接口
│  ├─ archive/             # 原 01-Docs/归档
│  ├─ ops/                 # 部署、环境和上线手册
│  └─ superpowers/specs/   # 设计与实施规格
├─ design/                 # 原 02-Design
├─ archive/                # 原 04-Archive
├─ tools/                  # 原 03-Code/mock
├─ scripts/                # 部署预检等可执行工具
├─ supabase/
├─ server.ts               # 薄 Vercel 入口
├─ vercel.json
├─ package.json
├─ pnpm-lock.yaml
└─ README.md
```

根目录只保留跨应用集成、部署和仓库级配置。任何业务页面、API 服务或 mock 实现都必须位于上述明确目录。

## 4. 目录职责

### `apps/web`

- 保存生产静态页面、样式和数据层。
- 默认请求同源 `/api/v1`。
- 不包含部署平台脚本、服务端密钥或文档资产。

### `apps/api`

- 保存 Express 应用、路由、领域服务、Supabase 访问和测试。
- 对外暴露 `createApp` 与默认应用实例。
- 不负责静态页面的构建，不负责根目录 Vercel 入口。

### 根级 `server.ts`

- 只导入 `apps/api` 的应用创建函数。
- 显式把 `apps/web` 设置为静态目录。
- 不包含业务路由或服务逻辑。

### `docs`

- `product`：产品方案。
- `design`：设计契约、UI 稿和前端交付说明。
- `api`：接口契约和接入记录。
- `archive`：历史文档与预览。
- `ops`：部署手册、环境变量说明和上线检查。

### `design`

保存原型、设计 token 和视觉参考，不参与生产部署。

### `archive`

保存旧前端快照，仅用于追溯。

### `tools`

保存本地 mock 服务等非生产工具。

### `scripts`

保存仓库级自动化脚本。至少提供部署预检，检查：

- Node/pnpm 版本与锁文件存在。
- 必需环境变量名称存在，不输出值。
- Vercel 入口、静态目录和 Cron 配置存在。
- Supabase migration 文件存在。
- 前端不存在扣子运行时引用。

## 5. 应用与部署数据流

```text
浏览器
  -> Vercel 根级 server.ts
  -> apps/api Express App
  -> Supabase Auth / Postgres / pgvector
  -> apps/web 静态资产
```

保持以下边界：

- 用户请求使用 publishable key + access token，并进入请求级 RLS 上下文。
- 后台任务和账号管理使用服务端 secret key。
- 收录后由 Vercel `waitUntil` 消费任务。
- Vercel Cron 调用受 `CRON_SECRET` 保护的补偿入口。
- 未配置 AI 时继续使用规则降级。

## 6. 迁移顺序

1. 创建新目录。
2. 使用 Git 移动文件而不是复制，保留文件历史。
3. 调整 package、workspace、TypeScript、测试、Vercel 和文档内链接。
4. 更新根 README，使新路径成为唯一可信入口。
5. 运行部署预检。
6. 运行测试、类型检查和生产构建。
7. 运行 `vercel dev --local`，验证静态页、API、登录页和浏览器控制台。
8. 本地提交并推送一次。

## 7. 错误处理与回滚

- 移动文件前后均保持工作树可审查，不使用强制覆盖。
- 如果路径调整导致测试或构建失败，在本地提交前修复；不推送半完成结构。
- 旧目录内容在验证前不删除。
- 线上部署失败时保留上一生产部署，可使用 Vercel 回滚。
- 数据库迁移只用于空项目；已有项目先导出 schema 并核对，禁止直接覆盖。

## 8. 测试与验收

必须全部通过：

- 现有 17 项以上自动化测试。
- `pnpm lint`。
- `pnpm build`。
- Supabase SQL 语法解析。
- 部署预检脚本。
- `vercel dev --local`。
- 桌面与移动端浏览器检查：页面可加载、登录表单存在、API 健康、无页面错误、无控制台错误、扣子脚本为 0。

验收标准：

- 仓库中不再存在 `01-Docs`、`02-Design`、`03-Code`、`04-Archive`、`client`、`server`。
- 业务接口和前端用户流程保持不变。
- 所有源码、文档、设计、工具和归档都有唯一归属目录。
- GitHub `master` 上的最终提交与本地一致。

## 9. 部署准备产物

最终应包含：

- `docs/ops/deployment.md`：Supabase、Vercel、账号和环境变量步骤。
- `docs/ops/environment.md`：环境变量及密钥边界。
- `scripts/deploy-preflight.mjs`：不泄露值的上线前检查。
- 根 README：快速开始、目录导航、部署入口和已知边界。

外部资源创建与生产部署需要用户提供或配置真实凭据；本次代码准备不提交任何密钥。

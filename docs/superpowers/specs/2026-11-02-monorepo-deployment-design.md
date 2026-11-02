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

## 3. 最简界面与行业标准

生产界面只保留真实可用的核心闭环：

1. 登录。
2. 知识树首页。
3. 知识库与分类筛选。
4. 搜索。
5. 收录。
6. 待确认收件箱。
7. 知识详情。
8. 每日回溯。
9. 我的、导出和注销。

具体处理：

- 将 `node.html` 合并到 `library.html` 的分类筛选，不保留重复页面。
- 删除硬编码示例数据，包括首页假统计和“从笔记导入”的演示 PPO 文本。
- 删除没有后端能力支撑的收藏、回收站、恢复、撤销、重置等无效入口。
- 删除配置后端、手填 API Base、手填 access token 等开发者操作。
- 保留三项主导航：知识树、知识库、我的。
- 删除重复前端原型、旧前端 zip、过期交付报告和历史归档预览，避免多套界面并存。
- 设计参考图保留在 `design/references/`，仅作视觉依据，不进入生产部署。

明确删除项：

- `01-Docs/产品/v0.3-产品方案.html`
- `01-Docs/归档/整合预览.html`
- `01-Docs/接口/前端接入报告.md`
- `01-Docs/设计/前端交付说明.md`
- `02-Design/prototype/`
- `02-Design/tokens/`
- `04-Archive/`

明确保留项：

- `01-Docs/产品/v0.4-产品方案.html`
- `01-Docs/设计/DESIGN-设计契约.md`
- `01-Docs/设计/UI初版设计.html`
- `01-Docs/接口/后端接口契约.md`
- `02-Design/references/`
- `03-Code/mock/`，迁移为 `tools/`

行业标准要求：

- 移动优先，360–430px 可用，同时桌面居中呈现。
- 表单使用 `form`、`label`、正确 `type` 和 `autocomplete`，按钮有明确 `type`。
- 关键交互元素触控尺寸不小于 44px，键盘可操作。
- 提供 `:focus-visible`、`prefers-reduced-motion`、加载、空态和错误状态。
- 页面只依赖同源资源和本地静态资产，不加载第三方运行时脚本。
- 生产页面不得引用不存在、未实现或后端不支持的控件。
- 基础可访问性检查无严重问题，浏览器控制台无错误。

## 4. 目标结构

```text
/
├─ apps/
│  ├─ web/                 # 原 client/
│  └─ api/                 # 原 server/
├─ docs/
│  ├─ product/             # 原 01-Docs/产品
│  ├─ design/              # 原 01-Docs/设计
│  ├─ api/                 # 原 01-Docs/接口
│  ├─ ops/                 # 部署、环境和上线手册
│  └─ superpowers/specs/   # 设计与实施规格
├─ design/references/      # 只保留视觉参考
├─ tools/                  # 原 03-Code/mock
├─ scripts/                # 部署预检等可执行工具
├─ supabase/
├─ api/index.js           # Vercel 共享 Serverless API 入口
├─ vercel.json
├─ package.json
├─ pnpm-lock.yaml
└─ README.md
```

根目录只保留跨应用集成、部署和仓库级配置。任何业务页面、API 服务或 mock 实现都必须位于上述明确目录。

## 5. 目录职责

### `apps/web`

- 保存生产静态页面、样式和数据层。
- 默认请求同源 `/api/v1`。
- 不包含部署平台脚本、服务端密钥或文档资产。

### `apps/api`

- 保存 Express 应用、路由、领域服务、Supabase 访问和测试。
- 对外暴露 `createApp` 与默认应用实例。
- 不负责静态页面的构建，不负责根目录 Vercel 入口。

### 根级 `api/index.js`

- 只导入构建后的 `apps/api/dist/app.js` Express 应用。
- 作为 Vercel 共享 Serverless API 函数入口，并用 rewrite 接收 `/api/v1/...`。
- API 的 TypeScript 类型检查由本地/CI 的 `pnpm lint` 完成，Vercel 入口保持纯 JavaScript。
- 静态页面由 Vercel 从 `apps/web` 输出目录直接提供。
- 不包含业务路由或服务逻辑。

### `docs`

- `product`：产品方案。
- `design`：设计契约与 UI 稿。
- `api`：接口契约和接入记录。
- `ops`：部署手册、环境变量说明和上线检查。

### `design`

只保存视觉参考，不保存第二套可运行界面，不参与生产部署。生产 token 与样式以 `apps/web/assets/app.css` 为唯一来源。

### `tools`

保存本地 mock 服务等非生产工具。

### `scripts`

保存仓库级自动化脚本。至少提供部署预检，检查：

- Node/pnpm 版本与锁文件存在。
- 必需环境变量名称存在，不输出值。
- Vercel 入口、静态目录和 Cron 配置存在。
- Supabase migration 文件存在。
- 前端不存在扣子运行时引用。

## 6. 应用与部署数据流

```text
浏览器
  -> Vercel api/index.js
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

## 7. 迁移顺序

1. 创建新目录。
2. 使用 Git 移动文件而不是复制，保留文件历史。
3. 删除重复原型、旧快照、过期报告、演示数据和无效 UI 控件。
4. 将分类页合并到知识库筛选。
5. 调整 package、workspace、TypeScript、测试、Vercel 和文档内链接。
6. 更新根 README，使新路径成为唯一可信入口。
7. 运行部署预检。
8. 运行测试、类型检查和生产构建。
9. 运行 `vercel dev --local`，验证静态页、API、登录页和浏览器控制台。
10. 本地提交并推送一次。

## 8. 错误处理与回滚

- 移动文件前后均保持工作树可审查，不使用强制覆盖。
- 如果路径调整导致测试或构建失败，在本地提交前修复；不推送半完成结构。
- 旧目录内容在验证前不删除。
- 线上部署失败时保留上一生产部署，可使用 Vercel 回滚。
- 数据库迁移只用于空项目；已有项目先导出 schema 并核对，禁止直接覆盖。

## 9. 测试与验收

必须全部通过：

- 现有 17 项以上自动化测试。
- `pnpm lint`。
- `pnpm build`。
- Supabase SQL 语法解析。
- 部署预检脚本。
- `vercel dev --local`。
- 桌面与移动端浏览器检查：页面可加载、登录表单存在、API 健康、无页面错误、无控制台错误、扣子脚本为 0。
- 基础可访问性检查无严重问题。

验收标准：

- 仓库中不再存在 `01-Docs`、`02-Design`、`03-Code`、`04-Archive`、`client`、`server`。
- 生产前端只有一套实现，不再存在重复可运行原型或旧前端快照。
- 页面不再展示假数据、演示数据和后端不支持的按钮。
- `node.html` 已合并到知识库分类筛选。
- 业务接口和前端用户流程保持不变。
- 所有源码、文档、设计、工具和归档都有唯一归属目录。
- GitHub `master` 上的最终提交与本地一致。

## 10. 部署准备产物

最终应包含：

- `docs/ops/deployment.md`：Supabase、Vercel、账号和环境变量步骤。
- `docs/ops/environment.md`：环境变量及密钥边界。
- `scripts/deploy-preflight.mjs`：不泄露值的上线前检查。
- 根 README：快速开始、目录导航、部署入口和已知边界。

外部资源创建与生产部署需要用户提供或配置真实凭据；本次代码准备不提交任何密钥。

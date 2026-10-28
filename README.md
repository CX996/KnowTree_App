# 知树 KnowTree

个人知识储备 App：丢一条 → 自动入树 → 每日送回。

本仓库同时收纳**前端（静态 H5 站点）**与**后端（Express API）**两部分源码：

- **前端**：`./`（根目录），纯静态多页站点（MPA），原生 HTML + CSS + JS，无框架、无构建、无 npm 依赖，任意静态服务器都能跑。
- **后端**：`./server/`，Node.js Express API，挂载在 `/api/v1`，连接 Supabase/Postgres（pgvector + RLS），AI 归类与互链通过 LLM/embedding 完成，后台任务队列处理异步重活。

## 前端

### 目录

```
.
├── index.html     知识树（入口）
├── library.html   知识库（全部 / 待确认 / 未分类）
├── search.html    搜索（后端语义 + 关键词）
├── inbox.html     待确认收件箱（含解析中、疑似重复）
├── detail.html    卡片详情（正文 / 相关 / 操作）
├── node.html      分类下的条目
├── review.html    每日回溯（记得 / 忘了）
├── capture.html   收录（粘贴文字 / 导入文件）
├── me.html        我的（统计 / 导出 / 设置 / 注销）
├── login.html     连接后端：API Base + access_token
└── assets/
    ├── api.js     数据层：/api/v1 + x-session，对外暴露 window.KT
    ├── ui.js      壳层与组件（顶栏、底栏、卡片、弹层、toast）
    └── app.css    设计 token 与全部样式（暗底 + 单一暖金 #C9A96B）
```

## 本地运行

```bash
cd knowtree-app
python3 -m http.server 8080
# 打开 http://localhost:8080/login.html
```

（不能直接双击打开 `file://`，跨页跳转和 localStorage 会异常。）

## 连接后端

后端 Base 默认 `http://localhost:9091/api/v1`，在 `login.html` 里可改，配置存在 localStorage（键 `knowtree_cfg`），token 存在 `knowtree_token`。

- 鉴权：请求头 `x-session: <Supabase access_token>`，不是 Bearer、不是 Cookie。
- 401 会清 token 并跳回 `login.html`。
- 也可填 Supabase URL + anon key 用邮箱密码登录（需要后端 Auth 项目配好）。

## 关键交互

- **收录**：`POST /entries/ingest` 拿 entry + jobs → 每 1.2s 轮询 `GET /jobs/:id`（20s 上限）→ `GET /entries/:id` 刷终态 → 已归类进详情，待确认/未分类进收件箱。
- **待确认**：`classification_status = pending_review` 给建议分类；`uncategorized` 不给建议（对应 0.50 阈值）。「全部处理」串行 PATCH。
- **去重**：`status: 'hash_duplicate'` 与 `dup_suggestions[].similarity` 落本地提示表，刷新后仍标「疑似重复」，合并走 `POST /entries/:id/merge`。
- **回溯**：`GET /recalls` 为空自动 `POST /recalls/generate`；两档 `PATCH /recalls/:id {status: done|skipped}`（产品方案 06 节设定，不做四级）。

## 部署

纯静态，无构建步骤。Vercel 直接导入仓库：Framework 选 **Other**，Build Command 留空，Output Directory 填 `.`（或根目录）。不需要环境变量——后端地址在前端登录页配置。

> 目前 `assets/api.js` 的默认 Base 还是 `http://localhost:9091/api/v1`；后端公网地址确定后会回填为默认值，届时需再提交一次。

## 已知限制

| 项 | 现状 |
| --- | --- |
| 列表分页 | 后端只回数组，前端按 `size=100` 拉一页，超 100 条统计会偏 |
| 收藏 | 后端 Entry 无 `starred`，详情页按钮提示「暂未提供」 |
| 回收站 / 恢复 | 无接口，删除不可撤销 |
| 分类计数 | 后端无 count，前端按 `parent_id` 递归聚合 |
| 回溯粒度 | 仅两档（pending / done / skipped） |

## 相关文档

- 后端接口契约：`../知树KnowTree-后端接口契约.md`
- 前端接入报告（字段映射、验证范围、缺口处置）：`../知树KnowTree-前端接入报告.md`
- 产品方案：`../知树KnowTree-产品方案.html`

---

## 后端（./server）

Node.js Express API，业务统一挂在 `/api/v1`。技术栈：Express + Supabase/Postgres（drizzle 风格 SQL，pgvector 语义检索、RLS 数据隔离）+ AI 归类/互链 + jobs 后台任务队列。

```bash
cd server
pnpm install
# 配置环境变量（见下方），然后
pnpm build && pnpm start   # 生产，默认 :9091
```

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 监听端口，默认 `9091` |
| `COZE_SUPABASE_URL` | Supabase Project URL |
| `COZE_SUPABASE_ANON_KEY` | Supabase anon（public）key，用于签发 x-session 校验 |
| `COZE_SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key，用于服务端写操作 / 注销删用户 |
| `PGDATABASE_URL` | Postgres 连接串（业务查询走直连 Pool） |

> 原始版本通过 Coze 运行时的 `coze_workload_identity`（Python）自动注入上述凭据；脱离 Coze 沙箱部署时改用环境变量直接注入。

### AI 归类 / embedding

原实现调用 `coze-coding-dev-sdk` 的 LLM / Embedding 接口（豆包模型）。如需脱离 Coze 运行时部署（如 Vercel），替换 `server/src/services/ai.ts` 中的 `classifyContent`（DeepSeek 兼容 OpenAI 接口）与 `embedText`（改用 DeepSeek/第三方 embedding，或按向量维度对齐）即可，其余业务代码不变。

### API 概览

系统：`GET /health`（免鉴权）｜账号：`GET/PATCH /me`、`DELETE /me/account`
分类：`GET/POST /categories`、`PATCH/DELETE /categories/:id`
条目：`POST /entries/ingest`、`GET/PATCH/DELETE /entries(/:id)`、版本/互链/归类/合并
检索：`GET /search`；回溯：`GET /recalls`、`POST /recalls/generate`、`PATCH /recalls/:id`
导出：`GET /export`；任务：`GET /jobs(/:id)`、`POST /jobs/run`

完整字段与枚举见 `../知树KnowTree-后端接口契约.md`。

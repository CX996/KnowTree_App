# 知树单仓整合与部署准备 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将仓库整理成 `apps + docs + design + tools + supabase` 标准单仓，删除重复界面与非功能入口，并准备可执行的 Vercel + Supabase 上线流程。

**Architecture:** 根目录仅保留跨应用配置和 Vercel 函数入口；静态前端位于 `apps/web`，Express API 位于 `apps/api`，文档、设计参考、mock、脚本和数据库迁移各有唯一目录。一个 Vercel 项目通过 `api/index.js` 和 API rewrite 导入构建后的 Express App，并从 `apps/web` 提供静态站点。

**Tech Stack:** Node.js 24、pnpm 11、TypeScript、Express 4、Vercel Functions/Cron、Supabase Postgres/Auth/pgvector、原生 HTML/CSS/JS、Node test runner。

**Spec:** `docs/superpowers/specs/2026-11-02-monorepo-deployment-design.md`

## Global Constraints

- 业务 API 路径、字段、状态枚举和前端用户流程保持不变。
- 只保留一套生产前端；删除重复原型、旧快照和过期报告。
- 生产页面只保留登录、知识树、知识库、搜索、收录、收件箱、详情、回溯、我的。
- `node.html` 合并到 `library.html` 分类筛选。
- 不展示假统计、演示 PPO 文本、收藏、回收站、恢复、撤销或重置入口。
- 移动优先，360–430px 可用；触控目标不小于 44px；表单使用 `form`、`label`、正确 `type` 和 `autocomplete`。
- 页面只依赖同源资源和本地静态资产。
- 不提交任何 Supabase、OpenAI、Cron 密钥。
- SQL migration 只用于空项目；已有项目先核对 schema。

---

### Task 1: 收敛仓库目录和所有路径

**Files:**
- Create: `scripts/tests/repository-layout.test.mjs`
- Move: `client/` -> `apps/web/`
- Move: `server/` -> `apps/api/`
- Move: `01-Docs/产品/v0.4-产品方案.html` -> `docs/product/v0.4-产品方案.html`
- Move: `01-Docs/设计/DESIGN-设计契约.md` -> `docs/design/DESIGN-设计契约.md`
- Move: `01-Docs/设计/UI初版设计.html` -> `docs/design/UI初版设计.html`
- Move: `01-Docs/接口/后端接口契约.md` -> `docs/api/后端接口契约.md`
- Move: `02-Design/references/` -> `design/references/`
- Move: `03-Code/mock/` -> `tools/mock/`
- Delete: `01-Docs/产品/v0.3-产品方案.html`
- Delete: `01-Docs/归档/整合预览.html`
- Delete: `01-Docs/接口/前端接入报告.md`
- Delete: `01-Docs/设计/前端交付说明.md`
- Delete: `02-Design/prototype/`
- Delete: `02-Design/tokens/`
- Delete: `03-Code/README.md`
- Delete: `04-Archive/`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Create: `api/index.js`
- Modify: `vercel.json`
- Modify: `tsconfig.json`
- Modify: `apps/api/package.json`
- Modify: `apps/api/tsconfig.test.json`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/app.test.ts`
- Modify: `apps/api/test/client-static.test.ts`
- Modify: `apps/api/test/governance.test.ts`

**Interfaces:**
- Consumes: existing `configureApp(app, options)` and default Express app.
- Produces: workspace packages `apps/web` and `@knowtree/api`; `api/index.js` is the only Vercel function entry.

- [ ] **Step 1: Write the failing repository layout test**

Create `scripts/tests/repository-layout.test.mjs`:

```js
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const required = [
  'apps/web/index.html',
  'apps/api/src/app.ts',
  'docs/product/v0.4-产品方案.html',
  'docs/api/后端接口契约.md',
  'docs/design/DESIGN-设计契约.md',
  'design/references',
  'tools/mock/server.js',
  'supabase/migrations/20261102055337_init_knowtree.sql',
];
const legacy = [
  'client',
  'server',
  '01-Docs',
  '02-Design',
  '03-Code',
  '04-Archive',
  'api',
];

test('repository uses the standard monorepo layout', () => {
  for (const relative of required) {
    assert.equal(existsSync(path.join(root, relative)), true, `missing ${relative}`);
  }
});

test('legacy numbered and duplicate source directories are removed', () => {
  for (const relative of legacy) {
    assert.equal(existsSync(path.join(root, relative)), false, `legacy path remains: ${relative}`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test scripts/tests/repository-layout.test.mjs
```

Expected: FAIL because `apps/web/index.html` is missing and legacy directories exist.

- [ ] **Step 3: Move retained directories with Git**

Run:

```powershell
New-Item -ItemType Directory -Force apps, docs\product, docs\design, docs\api, design, tools | Out-Null
git mv client apps\web
git mv server apps\api
git mv '01-Docs\产品\v0.4-产品方案.html' 'docs\product\v0.4-产品方案.html'
git mv '01-Docs\设计\DESIGN-设计契约.md' 'docs\design\DESIGN-设计契约.md'
git mv '01-Docs\设计\UI初版设计.html' 'docs\design\UI初版设计.html'
git mv '01-Docs\接口\后端接口契约.md' 'docs\api\后端接口契约.md'
git mv '02-Design\references' 'design\references'
git mv '03-Code\mock' 'tools\mock'
git rm -r '01-Docs'
git rm -r '02-Design'
git rm -r '03-Code'
git rm -r '04-Archive'
if ((Test-Path api) -and -not (Get-ChildItem api -Force)) { Remove-Item -LiteralPath api }
```

- [ ] **Step 4: Update workspace and path configuration**

Use these exact values:

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*

allowBuilds:
  esbuild: true
```

Root `package.json` scripts and dependency names:

```json
{
  "scripts": {
    "build": "pnpm --dir apps/api build",
    "dev": "pnpm --dir apps/api dev",
    "lint": "pnpm --dir apps/api lint && pnpm --dir apps/api exec tsc -p ../../tsconfig.json",
    "test": "node --test scripts/tests/*.test.mjs && pnpm --dir apps/api test",
    "worker": "pnpm --dir apps/api worker"
  },
  "dependencies": {
    "@knowtree/api": "workspace:*",
    "express": "4.22.3"
  }
}
```

`apps/api/package.json`:

```json
{
  "name": "@knowtree/api"
}
```

`apps/api/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test", "../../api"]
}
```

`api/index.js`:

```js
import app from '../apps/api/dist/app.js';

export default function handler(req, res) {
  const incoming = new URL(req.url || '/', 'http://localhost');
  const forwardedPath = incoming.searchParams.get('path');

  if (forwardedPath) {
    incoming.searchParams.delete('path');
    req.url = `/api/${forwardedPath}${incoming.search}`;
  }

  return app(req, res);
}
```

`vercel.json` shared function and rewrite:

```json
{
  "functions": {
    "api/index.js": {
      "maxDuration": 300
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index?path=$1"
    }
  ]
}
```

`apps/api/src/app.ts` local static fallback:

```ts
const defaultStaticDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web',
);
```

Update test-relative paths:

```ts
// apps/api/test/app.test.ts
await import('../../../api/index.js');

// apps/api/test/client-static.test.ts
const clientDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../web',
);

// apps/api/test/governance.test.ts
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

// Replace the existing `server`/`client` path arguments with:
path.join(root, 'apps/api/src')
path.join(root, 'apps/web')
path.join(root, 'apps/api/package.json')
path.join(root, 'apps/api/src/app.ts')
```

- [ ] **Step 5: Refresh the workspace lockfile**

Run:

```powershell
pnpm install
```

Expected: root `pnpm-lock.yaml` updates; no `apps/api/pnpm-lock.yaml` exists.

- [ ] **Step 6: Verify layout and existing behavior**

Run:

```powershell
node --test scripts/tests/repository-layout.test.mjs
pnpm test
pnpm lint
pnpm build
```

Expected: all commands pass.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "refactor: adopt standard monorepo layout"
```

---

### Task 2: 最简 UI 与分类筛选

**Files:**
- Modify: `apps/api/test/client-static.test.ts`
- Modify: `apps/web/index.html`
- Modify: `apps/web/library.html`
- Modify: `apps/web/detail.html`
- Modify: `apps/web/capture.html`
- Modify: `apps/web/me.html`
- Modify: `apps/web/search.html`
- Modify: `apps/web/login.html`
- Modify: `apps/web/assets/api.js`
- Modify: `apps/web/assets/ui.js`
- Delete: `apps/web/node.html`

**Interfaces:**
- Consumes: `KT.visible()`, `KT.NODES`, `KT.uncategorized()`, `UI.q('category')`.
- Produces: `library.html?category=<id>` replaces every `node.html?id=<id>` link.

- [ ] **Step 1: Add failing UI simplification assertions**

Append to `apps/api/test/client-static.test.ts`:

```ts
test('production UI exposes only supported core flows', async () => {
  const pages = new Set(await readdir(clientDir));
  assert.equal(pages.has('node.html'), false);

  for (const page of ['index.html', 'library.html', 'detail.html', 'capture.html', 'me.html']) {
    const html = await readFile(path.join(clientDir, page), 'utf8');
    for (const forbidden of ['收藏', '回收站', '重置演示数据', '配置后端', 'node.html?id=']) {
      assert.equal(html.includes(forbidden), false, `${page} still contains ${forbidden}`);
    }
  }

  const index = await readFile(path.join(clientDir, 'index.html'), 'utf8');
  const capture = await readFile(path.join(clientDir, 'capture.html'), 'utf8');
  assert.equal(index.includes('7 个节点 · 9 条知识'), false);
  assert.equal(capture.includes('PPO'), false);
  assert.equal(capture.includes('从笔记导入'), false);
});

test('login uses standard form semantics', async () => {
  const login = await readFile(path.join(clientDir, 'login.html'), 'utf8');
  assert.match(login, /<form[^>]+id="loginForm"/);
  assert.match(login, /<label[^>]+for="email"/);
  assert.match(login, /type="email"/);
  assert.match(login, /autocomplete="current-password"/);
  assert.match(login, /type="submit"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
pnpm --dir apps/api exec tsx --test test/client-static.test.ts
```

Expected: FAIL on `node.html`, unsupported labels, fake stats, demo import, or login form semantics.

- [ ] **Step 3: Replace node links with library category links**

Use these exact link patterns:

```js
// index.html tree node
function open() {
  UI.go('library.html?category=' + encodeURIComponent(cat.id));
}
```

```html
<!-- detail.html breadcrumb -->
<a href="library.html?category=...">知识库 / 分类名</a>

<!-- search.html category chip -->
<a href="library.html?category=...">分类名</a>
```

Delete `apps/web/node.html`.

- [ ] **Step 4: Merge category filtering into `library.html`**

Add an accessible native selector below the existing segmented control:

```html
<label class="t3 s12 mt16" for="categoryFilter">按分类筛选</label>
<select class="textarea mt8" id="categoryFilter" style="min-height:48px">
  <option value="">全部分类</option>
</select>
```

Implement these exact behaviors:

```js
function syncSegments() {
  seg.querySelectorAll('button').forEach(function (button) {
    button.classList.toggle('on', button.getAttribute('data-f') === filter);
  });
}

var categoryFilter = document.getElementById('categoryFilter');
var requestedCategory = UI.q('category') || '';

KT.NODES.forEach(function (node) {
  var option = document.createElement('option');
  option.value = node.id;
  option.textContent = node.name;
  categoryFilter.appendChild(option);
});

categoryFilter.value = KT.NODES.some(function (node) {
  return node.id === requestedCategory;
}) ? requestedCategory : '';

categoryFilter.addEventListener('change', function () {
  filter = 'all';
  syncSegments();
  render();
});

if (categoryFilter.value) cards = cards.filter(function (card) {
  return card.nodeId === categoryFilter.value;
});
```

`syncSegments()` must set the active state on the `全部` segment.

- [ ] **Step 5: Remove fake and unsupported UI**

Apply these removals:

- In `index.html`, replace initial stats text with `正在加载…`; remove initial inbox count `3`; make initial SVG labels/counts empty until `KT.load()` fills them.
- In `capture.html`, remove the import button and the entire sample typing block.
- In `detail.html`, remove `starBtn`, its icon, text, listener, and toast.
- In `me.html`, remove `trashRow`, `reset`, `conn`, `trashCount`, and their listeners; replace demo-prototype footer with `数据存储在你的 Supabase 账号中`.
- In `search.html`, replace demo query examples with `输入标题、标签或正文中的关键词`.
- In `apps/web/assets/api.js`, remove exports `starred`, `trash`, `restoreCard`, `toggleStar`, `undo`, and `reset` after confirming no references remain.
- In `apps/web/assets/ui.js`, remove the `undo` option from flash/restore helpers after confirming no references remain.

- [ ] **Step 6: Convert login to a semantic form**

Use:

```html
<form id="loginForm" novalidate>
  <label class="t3 s12" for="email">邮箱</label>
  <input class="textarea mt8" id="email" type="email" autocomplete="email" required />
  <label class="t3 s12 mt16" for="pwd">密码</label>
  <input class="textarea mt8" id="pwd" type="password" autocomplete="current-password" required />
  <button class="btn btn-primary btn-block mt16" id="login" type="submit">登录</button>
</form>
```

The submit handler must call `event.preventDefault()` and validate non-empty email/password before `KT.loginWithPassword`.

- [ ] **Step 7: Run focused and full tests**

Run:

```powershell
pnpm --dir apps/api exec tsx --test test/client-static.test.ts
pnpm test
pnpm lint
```

Expected: all tests pass; no unsupported labels remain.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "refactor: simplify production interface"
```

---

### Task 3: 部署预检工具

**Files:**
- Create: `scripts/tests/deploy-preflight.test.mjs`
- Create: `scripts/deploy-preflight.mjs`
- Modify: `package.json`
- Create: `docs/ops/deployment.md`
- Create: `docs/ops/environment.md`

**Interfaces:**
- Consumes: repository paths, `process.env`, `vercel.json`, `.env.example`, migration directory.
- Produces: `runPreflight({ root, env }) -> { ok: boolean, errors: string[] }` and CLI exit code.

- [ ] **Step 1: Write failing preflight tests**

Create `scripts/tests/deploy-preflight.test.mjs`:

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runPreflight } from '../deploy-preflight.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_real',
  SUPABASE_SECRET_KEY: 'sb_secret_real',
  CRON_SECRET: 'a-long-random-cron-secret',
};

test('preflight accepts a complete deployment configuration', () => {
  const result = runPreflight({ root, env: validEnv });
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('preflight reports missing and placeholder secrets', () => {
  const result = runPreflight({
    root,
    env: {
      SUPABASE_URL: 'not-a-url',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xxx',
      SUPABASE_SECRET_KEY: '',
      CRON_SECRET: 'replace-with-a-long-random-value',
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /SUPABASE_URL/);
  assert.match(result.errors.join('\n'), /SUPABASE_SECRET_KEY/);
  assert.match(result.errors.join('\n'), /CRON_SECRET/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test scripts/tests/deploy-preflight.test.mjs
```

Expected: FAIL because `deploy-preflight.mjs` does not exist.

- [ ] **Step 3: Implement `runPreflight` and CLI**

Use this complete module structure:

```js
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function runPreflight({ root = process.cwd(), env = process.env } = {}) {
  const errors = [];
  const required = [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'CRON_SECRET',
  ];

  for (const name of required) {
    const value = String(env[name] || '').trim();
    if (!value) {
      errors.push(`${name} is missing`);
      continue;
    }
    if (/xxx|your-project|replace-with|test-secret|example\.supabase\.co/i.test(value)) {
      errors.push(`${name} still contains a placeholder`);
    }
    if (name === 'SUPABASE_PUBLISHABLE_KEY' && !value.startsWith('sb_publishable_')) {
      errors.push('SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_');
    }
    if (name === 'SUPABASE_SECRET_KEY' && !value.startsWith('sb_secret_')) {
      errors.push('SUPABASE_SECRET_KEY must start with sb_secret_');
    }
  }

  try {
    const url = new URL(String(env.SUPABASE_URL || ''));
    if (url.protocol !== 'https:') errors.push('SUPABASE_URL must use https');
  } catch {
    errors.push('SUPABASE_URL is not a valid URL');
  }

  const requiredFiles = [
    'api/index.js',
    'vercel.json',
    'apps/web/index.html',
    'apps/api/src/app.ts',
    'supabase/migrations',
  ];
  for (const relative of requiredFiles) {
    if (!existsSync(path.join(root, relative))) errors.push(`${relative} is missing`);
  }

  const vercelPath = path.join(root, 'vercel.json');
  if (existsSync(vercelPath)) {
    try {
      const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
      if (!vercel.functions?.['api/index.js']) errors.push('vercel.json has no API function');
      if (!vercel.crons?.some((cron) => cron.path === '/api/v1/cron/jobs')) {
        errors.push('vercel.json has no jobs cron');
      }
    } catch {
      errors.push('vercel.json is invalid JSON');
    }
  }

  const index = path.join(root, 'apps/web/index.html');
  if (existsSync(index) && readFileSync(index, 'utf8').includes('lf-cdn.coze.cn')) {
    errors.push('production frontend still loads Coze scripts');
  }

  const migrationDir = path.join(root, 'supabase/migrations');
  if (existsSync(migrationDir) && !readdirSync(migrationDir).some((file) => file.endsWith('.sql'))) {
    errors.push('supabase/migrations contains no SQL files');
  }

  return { ok: errors.length === 0, errors };
}
```

CLI behavior:

```js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runPreflight();
  if (!result.ok) {
    console.error(`Deployment preflight failed:\n- ${result.errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('Deployment preflight passed.');
  }
}
```

Add root script:

```json
"preflight": "node scripts/deploy-preflight.mjs"
```

- [ ] **Step 4: Write deployment and environment docs**

`docs/ops/environment.md` must list the exact variables from `.env.example`, required/optional status, public/secret boundary, and state that values are entered in Vercel or local `.env`, never committed.

`docs/ops/deployment.md` must include these ordered sections:

1. Create an empty Supabase project.
2. Link and push migration.
3. Disable public signup.
4. Pre-create the first account.
5. Add Vercel environment variables.
6. Import GitHub repository into Vercel without changing Root Directory.
7. Deploy preview.
8. Verify `/api/v1/health`, `/api/v1/config`, login, capture, library, detail, and review.
9. Promote production only after preview checks pass.
10. Roll back the Vercel deployment or restore the previous Supabase backup on failure.

- [ ] **Step 5: Verify preflight**

Run:

```powershell
node --test scripts/tests/deploy-preflight.test.mjs
$env:SUPABASE_URL='https://example.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='sb_publishable_test'
$env:SUPABASE_SECRET_KEY='sb_secret_test'
$env:CRON_SECRET='test-cron-secret-long-enough'
pnpm preflight
```

Expected: tests pass and CLI prints `Deployment preflight passed.`

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "chore: add deployment preflight and runbooks"
```

---

### Task 4: UI 行业标准与可访问性收口

**Files:**
- Modify: `apps/web/assets/app.css`
- Modify: `apps/web/login.html`
- Modify: `apps/web/library.html`
- Modify: `apps/api/test/client-static.test.ts`

**Interfaces:**
- Consumes: simplified UI from Task 2.
- Produces: focus-visible, reduced-motion, minimum target and form interaction standards.

- [ ] **Step 1: Add failing style assertions**

Append to `apps/api/test/client-static.test.ts`:

```ts
test('production styles include keyboard, motion and minimum target standards', async () => {
  const css = await readFile(path.join(clientDir, 'assets/app.css'), 'utf8');
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-height:\s*44px/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --dir apps/api exec tsx --test test/client-static.test.ts
```

Expected: FAIL if a standard is missing.

- [ ] **Step 3: Add standard CSS**

Add:

```css
:where(button, a, input, textarea, select):focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
}

button,
[role="button"],
.icon-btn,
.row {
  min-height: 44px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}
```

Keep the existing visual language and do not add decorative panels.

- [ ] **Step 4: Verify tests**

Run:

```powershell
pnpm --dir apps/api exec tsx --test test/client-static.test.ts
pnpm lint
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "style: enforce accessible interaction standards"
```

---

### Task 5: README、文档链接与部署入口收口

**Files:**
- Modify: `README.md`
- Modify: `docs/api/后端接口契约.md`
- Modify: `docs/product/v0.4-产品方案.html`
- Modify: `docs/superpowers/specs/2026-11-02-monorepo-deployment-design.md`
- Modify: `docs/superpowers/plans/2026-11-02-monorepo-deployment.md`
- Modify: `apps/api/test/governance.test.ts`

**Interfaces:**
- Consumes: final paths from Tasks 1–4.
- Produces: documentation containing no old directory paths and one deployment entry sequence.

- [ ] **Step 1: Add a failing stale-path test**

Append to `apps/api/test/governance.test.ts`:

```ts
test('documentation does not point to removed source directories', async () => {
  const files = [
    'README.md',
    'docs/api/后端接口契约.md',
    'docs/ops/deployment.md',
    'docs/ops/environment.md',
  ];
  for (const relative of files) {
    const text = await readFile(path.join(root, relative), 'utf8');
    for (const legacy of ['`client/', '`server/', '01-Docs/', '02-Design/', '03-Code/', '04-Archive/']) {
      assert.equal(text.includes(legacy), false, `${relative} still references ${legacy}`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --dir apps/api exec tsx --test test/governance.test.ts
```

Expected: FAIL on stale paths.

- [ ] **Step 3: Rewrite README navigation and commands**

README must show:

```text
apps/web       production static web
apps/api       production Express API
docs/          product, design, API and operations docs
design/        visual references
tools/         local mock tools
supabase/      config and migrations
scripts/       deployment preflight
api/           Vercel Serverless API entry
```

Commands must use:

```powershell
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm preflight
```

- [ ] **Step 4: Update API contract and design references**

- Replace local API startup references with `http://localhost:9091/api/v1`.
- Replace any removed page name with `library.html?category=<id>`.
- Keep endpoint fields and behavior unchanged.
- Point deployment readers to `docs/ops/deployment.md`.

- [ ] **Step 5: Verify docs**

Run:

```powershell
pnpm --dir apps/api exec tsx --test test/governance.test.ts
rg -n 'client/|server/|01-Docs/|02-Design/|03-Code/|04-Archive/' README.md docs apps -g '*.md' -g '*.ts' -g '*.html'
```

Expected: test passes; ripgrep finds no stale production-doc references.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "docs: align repository and deployment guidance"
```

---

### Task 6: 完整验证、Vercel 本地运行和整体推送

**Files:**
- Modify: none expected; if verification fails, add a failing regression test first and then fix the responsible file.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified, pushed `master` with matching local and remote SHA.

- [ ] **Step 1: Run complete static verification**

Run:

```powershell
pnpm test
pnpm lint
pnpm build
node --test scripts/tests/repository-layout.test.mjs scripts/tests/deploy-preflight.test.mjs
```

Expected: zero failures.

- [ ] **Step 2: Parse the Supabase migration**

Run with a temporary `pglast` installation:

```powershell
$env:PYTHONPATH='C:\Users\50538\AppData\Local\Temp\knowtree-pglast'
python -c "from pathlib import Path; import pglast; pglast.parse_sql(Path('supabase/migrations/20261102055337_init_knowtree.sql').read_text(encoding='utf-8')); print('SQL parse: OK')"
```

Expected: `SQL parse: OK`.

- [ ] **Step 3: Run the real Vercel local runtime**

Use the isolated Vercel CLI already installed outside the repository:

```powershell
$env:SUPABASE_URL='https://example.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY='sb_publishable_test'
$env:SUPABASE_SECRET_KEY='sb_secret_test'
$env:CRON_SECRET='cron-test'
& 'C:\Users\50538\AppData\Local\Temp\knowtree-vercel-cli\node_modules\.bin\vercel.cmd' dev --local --yes --listen 127.0.0.1:9092
```

Verify:

```powershell
curl.exe --noproxy "*" -i http://127.0.0.1:9092/api/v1/health
curl.exe --noproxy "*" -i http://127.0.0.1:9092/api/v1/config
curl.exe --noproxy "*" -I http://127.0.0.1:9092/
curl.exe --noproxy "*" -I http://127.0.0.1:9092/login.html
```

Expected: health/config/pages return 200; config contains no secret key.

- [ ] **Step 4: Browser and accessibility verification**

Use `agent-browser` with Edge:

```powershell
$env:AGENT_BROWSER_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
pnpm dlx agent-browser@0.41.1 --session knowtree-final open http://127.0.0.1:9092/
pnpm dlx agent-browser@0.41.1 --session knowtree-final errors
pnpm dlx agent-browser@0.41.1 --session knowtree-final console
pnpm dlx agent-browser@0.41.1 --session knowtree-final eval "JSON.stringify({coze:document.querySelectorAll('script[src*=coze]').length,email:Boolean(document.getElementById('email'))})"
pnpm dlx agent-browser@0.41.1 --session knowtree-final a11y --tags wcag2a,wcag2aa --json
pnpm dlx agent-browser@0.41.1 --session knowtree-final close
```

Expected: zero Coze scripts, login form exists, no page/console errors, no severe accessibility violations.

- [ ] **Step 5: Review final diff**

Run:

```powershell
git status --short --branch
git diff --check
git diff --stat origin/master..HEAD
```

Expected: no whitespace errors; only intended files.

- [ ] **Step 6: Push once**

Run:

```powershell
git push origin master
```

If the Git HTTPS channel is reset, use the same verified GitHub Git Data API tree/ref flow used for commit `1d783e8b00b341201f4932ae36085abb8527a3aa`: upload changed blobs, verify tree SHA, create commit, and update the ref without force.

Expected: local `HEAD`, `origin/master`, and GitHub `refs/heads/master` share one SHA.

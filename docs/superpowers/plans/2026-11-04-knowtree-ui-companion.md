# KnowTree UI and Companion Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有静态多页知树升级为统一、手机优先、流畅且带动态灵狐陪伴的界面，同时保持认证、采集、AI、阅读、编辑、审核和部署行为不变。

**Architecture:** 保留静态 HTML 多页架构，通过共享应用壳层、分层 CSS、小型原生 JavaScript 模块、预取和跨文档 View Transitions 获得应用感。宠物由独立状态机驱动已批准的透明动作帧，只提示和导航，不调用写接口。

**Tech Stack:** 原生 HTML/CSS/JavaScript、ES Modules、Node 24 test runner、现有 Express/Vercel 静态托管、WebP

**Spec:** `docs/superpowers/specs/2026-11-04-knowtree-ui-companion-design.md`

## Global Constraints

- 不引入 React、Vue、Next.js 或新的前端构建框架。
- 不新增数据库迁移，不改变认证、API 所有权、RLS 或现有写入协议。
- 宠物是 L2 助手，只能提示、移动和打开页面，不能保存、归类、合并、删除或发布。
- 验收宽度：360、390、768、1280、1440 px；触控目标至少 44 × 44 px。
- 支持 `prefers-reduced-motion`；停止动画后全部功能仍可用。
- 固定色彩：`#10110E`、`#0A0B09`、`#171813`、`#20211B`、`#E7DDC7`、`#F2EBDC`、`#28241B`、`#F1EBDD`、`#AAA393`、`#C6A15B`、`#DFC27F`、`#4D5947`、`#D46A5E`。
- 宠物六帧 WebP 总计不得大于 250 KB；当前为 181,800 bytes。
- 宠物主动提示每页最多一条，间隔至少 45 秒，输入期间不弹新提示。
- 生产代码不得引用 `.superpowers/`。
- 每个任务完成对应测试并创建独立 commit。
- 未获得明确发布授权前只创建 Preview，不提升 Production。

## File Structure

- `apps/web/assets/styles/tokens.css`：设计令牌。
- `apps/web/assets/styles/base.css`：reset、字体、焦点和全局可访问性。
- `apps/web/assets/styles/components.css`：按钮、卡片、表单、弹层等通用组件。
- `apps/web/assets/styles/shell.css`：手机底部导航、平板图标栏、桌面侧栏。
- `apps/web/assets/styles/pages.css`：首页、知识库、正文、回顾、账户和认证布局。
- `apps/web/assets/styles/pet.css`：宠物安全区、状态动画和气泡。
- `apps/web/assets/styles/transitions.css`：页面转场和减少动态效果。
- `apps/web/assets/shell.js`：共享导航壳层。
- `apps/web/assets/pet/pet-core.mjs`：宠物纯状态机、动作映射和提示规则。
- `apps/web/assets/pet.js`：宠物 DOM、事件和本地偏好。
- `apps/web/assets/transitions.js`：预取与滚动恢复。
- `apps/web/assets/tree-summary.mjs`：首页分类与月度新叶汇总。
- `scripts/tests/ui-refresh.test.mjs`：页面结构、资源和样式静态契约。
- `scripts/tests/tree-summary.test.mjs`：知识树汇总单元测试。
- `scripts/tests/pet-core.test.mjs`：宠物状态机单元测试。

---

### Task 1: 建立设计令牌与样式层

**Files:**

- Create: `apps/web/assets/styles/tokens.css`
- Create: `apps/web/assets/styles/base.css`
- Create: `apps/web/assets/styles/pages.css`
- Move: `apps/web/assets/app.css` → `apps/web/assets/styles/components.css`
- Modify: `apps/web/*.html`
- Modify: `apps/api/test/client-static.test.ts`
- Create: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Produces: CSS 变量 `--bg`、`--bg-deep`、`--surface`、`--surface-raised`、`--paper`、`--paper-high`、`--ink`、`--text`、`--text-muted`、`--gold`、`--gold-soft`、`--moss`、`--danger`、`--line`。
- Produces: 所有页面按 `tokens → base → components → pages` 顺序加载样式。
- Consumes: 现有组件类继续保留，逐页迁移期间不改业务逻辑。

- [ ] **Step 1: 写失败测试**

```js
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'apps/web');

async function htmlPages() {
  return (await readdir(web)).filter((name) => name.endsWith('.html')).sort();
}

test('every page loads style layers in cascade order', async () => {
  const expected = [
    'assets/styles/tokens.css',
    'assets/styles/base.css',
    'assets/styles/components.css',
    'assets/styles/pages.css',
  ];
  for (const page of await htmlPages()) {
    const html = await readFile(path.join(web, page), 'utf8');
    const positions = expected.map((href) => html.indexOf(href));
    assert.ok(positions.every((position) => position >= 0), `${page} missing style`);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${page} order`);
  }
});

test('design tokens expose the approved palette', async () => {
  const css = (await readFile(path.join(web, 'assets/styles/tokens.css'), 'utf8')).toLowerCase();
  for (const value of ['#10110e', '#e7ddc7', '#c6a15b', '#4d5947', '#d46a5e']) {
    assert.ok(css.includes(value), value);
  }
});
```

- [ ] **Step 2: 运行测试并确认失败**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL，`tokens.css` 尚不存在。

- [ ] **Step 3: 创建设计令牌和基础样式**

创建 `tokens.css`：

```css
:root {
  --bg: #10110E;
  --bg-deep: #0A0B09;
  --surface: #171813;
  --surface-raised: #20211B;
  --paper: #E7DDC7;
  --paper-high: #F2EBDC;
  --ink: #28241B;
  --text: #F1EBDD;
  --text-muted: #AAA393;
  --gold: #C6A15B;
  --gold-soft: #DFC27F;
  --moss: #4D5947;
  --danger: #D46A5E;
  --line: rgba(241, 235, 221, .10);
  --line-strong: rgba(241, 235, 221, .18);
  --font-display: "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif;
  --font-ui: "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei UI", sans-serif;
  --font-reading: "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 22px;
  --shadow-float: 0 18px 48px rgba(0, 0, 0, .24);
  --motion-fast: 120ms;
  --motion-base: 200ms;
  --motion-page: 320ms;
  --sat: env(safe-area-inset-top, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
}
```

创建 `base.css`：

```css
* { box-sizing: border-box; }
html { min-height: 100%; color-scheme: dark; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100dvh;
  color: var(--text);
  background: var(--bg);
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
img, svg { display: block; max-width: 100%; }
button, input, textarea, select { font: inherit; color: inherit; }
a { color: inherit; text-decoration: none; }
[hidden] { display: none !important; }
:where(a, button, input, textarea, select):focus-visible {
  outline: 2px solid var(--gold-soft);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

创建 `pages.css`，先放共享页头：

```css
.app-page {
  width: 100%;
  max-width: 920px;
  margin-inline: auto;
}
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 28px 0 16px;
}
.page-head h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(28px, 7vw, 42px);
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: -.035em;
}
.page-head__meta { color: var(--text-muted); font-size: 12px; }
```

将 `apps/web/assets/app.css` 移到 `apps/web/assets/styles/components.css`，删除其中旧的 `:root`、reset、`body` 和焦点规则，避免覆盖新基础层。

每个 HTML 使用：

```html
<link rel="stylesheet" href="assets/styles/tokens.css" />
<link rel="stylesheet" href="assets/styles/base.css" />
<link rel="stylesheet" href="assets/styles/components.css" />
<link rel="stylesheet" href="assets/styles/pages.css" />
```

将 `theme-color` 统一为 `#10110E`，并把现有 `client-static.test.ts` 的 CSS 路径改为 `assets/styles/components.css`。

- [ ] **Step 4: 运行测试**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
pnpm test
```

Expected: 新测试通过，原 79 项测试通过。

- [ ] **Step 5: 提交**

```powershell
git add apps/web apps/api/test/client-static.test.ts scripts/tests/ui-refresh.test.mjs
git commit -m "refactor: establish KnowTree design foundations"
```

---

### Task 2: 加入共享应用壳层

**Files:**

- Create: `apps/web/assets/shell.js`
- Create: `apps/web/assets/styles/shell.css`
- Modify: `apps/web/assets/ui.js`
- Modify: `apps/web/index.html`
- Modify: `apps/web/library.html`
- Modify: `apps/web/detail.html`
- Modify: `apps/web/inbox.html`
- Modify: `apps/web/search.html`
- Modify: `apps/web/review.html`
- Modify: `apps/web/me.html`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Consumes: `window.UI.svg(name: string): string`。
- Consumes: `body[data-tab]` 的 `tree | lib | review | me`。
- Produces: `window.KTShell.mount(): void`、`window.KTShell.refreshActive(tab: string): void`。
- Produces: `.app-rail`、`.app-rail__nav`、`.app-rail__capture`、`.app-rail__pet`。

- [ ] **Step 1: 写壳层测试**

追加到 `ui-refresh.test.mjs`：

```js
test('business pages declare active tabs and load the shared shell', async () => {
  const pages = new Map([
    ['index.html', 'tree'], ['library.html', 'lib'], ['detail.html', 'lib'],
    ['inbox.html', 'lib'], ['search.html', 'lib'],
    ['review.html', 'review'], ['me.html', 'me'],
  ]);
  for (const [page, tab] of pages) {
    const html = await readFile(path.join(web, page), 'utf8');
    assert.match(html, new RegExp(`<body[^>]+data-tab="${tab}"`));
    assert.match(html, /assets\/shell\.js/);
    assert.match(html, /assets\/styles\/shell\.css/);
  }
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL，`shell.js` 尚不存在。

- [ ] **Step 3: 实现一套导航两种布局**

创建 `shell.js`：

```js
(function () {
  'use strict';
  var ITEMS = [
    { id: 'tree', label: '知识树', href: 'index.html', icon: 'tree' },
    { id: 'lib', label: '知识库', href: 'library.html', icon: 'layers' },
    { id: 'review', label: '回顾', href: 'review.html', icon: 'clock' },
    { id: 'me', label: '我的', href: 'me.html', icon: 'user' }
  ];

  function mount() {
    var active = document.body.dataset.tab;
    if (!active || document.querySelector('.app-rail')) return;
    var rail = document.createElement('aside');
    rail.className = 'app-rail';
    rail.setAttribute('aria-label', '应用导航');
    rail.innerHTML =
      '<a class="app-rail__brand" href="index.html"><span class="app-rail__mark"></span>知树</a>' +
      '<a class="app-rail__capture" href="capture.html"><b>＋</b>丢一条进树里</a>' +
      '<nav class="app-rail__nav" aria-label="主导航"></nav>' +
      '<div class="app-rail__pet" data-pet-mount></div>';
    var nav = rail.querySelector('nav');
    ITEMS.forEach(function (item) {
      var link = document.createElement('a');
      link.href = item.href;
      link.dataset.tab = item.id;
      link.className = 'app-rail__item' + (item.id === active ? ' is-active' : '');
      link.setAttribute('aria-current', item.id === active ? 'page' : 'false');
      link.innerHTML = window.UI.svg(item.icon) + '<span>' + item.label + '</span>';
      nav.appendChild(link);
    });
    document.body.prepend(rail);
    document.body.classList.add('has-app-shell');
  }

  function refreshActive(tab) {
    document.querySelectorAll('.app-rail__item').forEach(function (link) {
      var active = link.dataset.tab === tab;
      link.classList.toggle('is-active', active);
      link.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  window.KTShell = { mount: mount, refreshActive: refreshActive };
  mount();
})();
```

创建 `shell.css`：

```css
.app-rail {
  position: fixed;
  z-index: 60;
  right: 12px;
  bottom: calc(10px + var(--sab));
  left: 12px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  min-height: 58px;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 19px;
  background: color-mix(in srgb, var(--bg-deep) 88%, transparent);
  backdrop-filter: blur(18px);
}
.app-rail__brand, .app-rail__capture { display: none; }
.app-rail__nav { display: contents; }
.app-rail__item {
  display: flex;
  min-height: 46px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  border-radius: 13px;
  font-size: 10px;
}
.app-rail__item svg { width: 20px; height: 20px; }
.app-rail__item.is-active { color: var(--gold-soft); background: rgba(198, 161, 91, .09); }
body.has-app-shell { padding-bottom: calc(74px + var(--sab)); }

@media (min-width: 768px) {
  .app-rail {
    inset: 0 auto 0 0;
    width: 80px;
    padding: 18px 10px;
    border-width: 0 1px 0 0;
    border-radius: 0;
  }
  .app-rail__nav { display: grid; align-content: start; gap: 7px; }
  .app-rail__item span { position: absolute; width: 1px; height: 1px; overflow: hidden; }
  body.has-app-shell { padding-bottom: 0; padding-left: 80px; }
}

@media (min-width: 1200px) {
  .app-rail { width: 232px; padding: 24px 18px; }
  .app-rail__brand { display: flex; min-height: 44px; align-items: center; gap: 9px; padding: 0 9px; color: var(--gold-soft); font: 18px var(--font-display); }
  .app-rail__mark { width: 18px; height: 18px; border: 1px solid var(--gold); border-radius: 50%; }
  .app-rail__capture { display: flex; min-height: 46px; align-items: center; gap: 9px; margin: 14px 0 16px; padding: 0 12px; color: var(--ink); border-radius: 12px; background: var(--paper); }
  .app-rail__item { flex-direction: row; justify-content: flex-start; padding: 0 12px; }
  .app-rail__item span { position: static; width: auto; height: auto; }
  .app-rail__pet { position: absolute; right: 18px; bottom: 18px; left: 18px; min-height: 132px; }
  body.has-app-shell { padding-left: 232px; }
}
```

从 `ui.js` 删除 `tabbar()` 和 DOMContentLoaded 中的调用。业务页按 `api.js → ui.js → shell.js` 加载；为详情、收件箱、搜索补 `data-tab="lib"`，为回顾补 `data-tab="review"`。认证页和采集页不加载壳层。

业务页在 `pages.css` 之后加载：

```html
<link rel="stylesheet" href="assets/styles/shell.css" />
```

- [ ] **Step 4: 运行测试**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
pnpm test
```

Expected: PASS。手机显示四项底部导航，768 px 为图标栏，1200 px 为完整侧栏。

- [ ] **Step 5: 提交**

```powershell
git add apps/web scripts/tests/ui-refresh.test.mjs
git commit -m "feat: add responsive KnowTree app shell"
```

---

### Task 3: 重构行动优先首页与动态知识树

**Files:**

- Create: `apps/web/assets/tree-summary.mjs`
- Create: `scripts/tests/tree-summary.test.mjs`
- Modify: `apps/web/index.html`
- Modify: `apps/web/assets/styles/pages.css`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Produces: `selectHomeCategories(items, limit = 5): Array<{ id: string, name: string, count: number }>`。
- Produces: `countSince(entries, since: Date): number`。
- Produces: `startOfMonth(now = new Date()): Date`。
- Consumes: `KT.NODES`、`KT.countInNode(id)`、`KT.visible()`、`KT.inbox()`。

- [ ] **Step 1: 写树汇总单元测试**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectHomeCategories, countSince, startOfMonth,
} from '../../apps/web/assets/tree-summary.mjs';

test('selects five highest category counts without deleting the rest', () => {
  const nodes = Array.from({ length: 9 }, (_, index) => ({
    id: `n${index}`, name: `分类${index}`, count: index,
  }));
  assert.deepEqual(
    selectHomeCategories(nodes, 5).map((node) => node.id),
    ['n8', 'n7', 'n6', 'n5', 'n4']
  );
  assert.equal(nodes.length, 9);
});

test('monthly leaves use createdAt only', () => {
  const now = new Date('2026-11-04T12:00:00+08:00');
  const entries = [
    { createdAt: '2026-11-01T00:00:00+08:00' },
    { createdAt: '2026-10-31T23:59:59+08:00' },
    { createdAt: '2026-11-03T00:00:00+08:00' },
  ];
  assert.equal(countSince(entries, startOfMonth(now)), 2);
  assert.equal(countSince([], startOfMonth(now)), 0);
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/tree-summary.test.mjs
```

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现汇总模块和首页结构**

创建 `tree-summary.mjs`：

```js
export function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
export function countSince(entries, since) {
  const threshold = since instanceof Date ? since.getTime() : Date.parse(since);
  return entries.filter((entry) => Date.parse(entry.createdAt) >= threshold).length;
}
export function selectHomeCategories(items, limit = 5) {
  return items.slice().sort((a, b) =>
    b.count - a.count || a.name.localeCompare(b.name, 'zh-CN')
  ).slice(0, limit);
}
```

首页改为采集主卡在首屏，树只显示最多五个分类：

```html
<main class="page app-page home-page" data-page="home">
  <header class="page-head">
    <div><p class="page-kicker">KNOWTREE · 晚上好</p><h1>今晚想留下什么？</h1></div>
    <p class="page-head__meta" id="stats"></p>
  </header>
  <a class="capture-hero" href="capture.html" data-home-capture>
    <span>新的一条</span><strong>写下想法，或丢进一份文档</strong><small>文字 · 链接 · 文件 ↗</small>
  </a>
  <a class="inbox-strip" href="inbox.html" id="inboxBanner" hidden>
    <b id="inboxNum">0</b> 片叶子还没归位 <span>带我去看</span>
  </a>
  <section class="tree-preview" aria-labelledby="treeTitle">
    <div class="section-row"><h2 id="treeTitle">我的知识树</h2><span id="leafCount"></span></div>
    <svg id="homeTree" viewBox="0 0 360 300" role="group" aria-label="知识分类树"></svg>
    <a class="text-link" href="library.html">查看全部知识</a>
  </section>
</main>
```

首页脚本改为 `type="module"`，导入 `selectHomeCategories` 和 `countSince`。五个节点坐标固定为：

```js
const positions = [
  { x: 180, y: 72 }, { x: 72, y: 132 }, { x: 288, y: 132 },
  { x: 104, y: 224 }, { x: 256, y: 224 },
];
const categories = KT.NODES.map((node) => ({
  id: node.id, name: node.name, count: KT.countInNode(node.id),
}));
const visible = selectHomeCategories(categories, 5);
```

每个 SVG 节点包含 `data-node`、`tabindex="0"`、`role="link"`，Enter/Space 使用 `location.href = 'library.html?category=' + encodeURIComponent(id)`。分类少于五个时只画已有节点；分类多于五个时首页必须保留“查看全部知识”。

在 `pages.css` 添加 `.home-page`、`.page-kicker`、`.capture-hero`、`.inbox-strip`、`.tree-preview`、`.tree-node` 和 `.section-row` 样式。采集主卡使用 `--paper-high` 与 `--ink`，树区域使用暗色 `--surface`。

- [ ] **Step 4: 运行首页、结构和回归测试**

```powershell
node --test scripts/tests/tree-summary.test.mjs
node --test scripts/tests/ui-refresh.test.mjs
pnpm test
```

Expected: PASS；9 个分类时首页只画前 5 个，但知识库仍可访问全部 9 个。

- [ ] **Step 5: 提交**

```powershell
git add apps/web/index.html apps/web/assets/tree-summary.mjs apps/web/assets/styles/pages.css scripts/tests/tree-summary.test.mjs scripts/tests/ui-refresh.test.mjs
git commit -m "feat: rebuild action-first home and dynamic tree"
```

---

### Task 4: 重构知识库、搜索和收件箱

**Files:**

- Modify: `apps/web/library.html`
- Modify: `apps/web/search.html`
- Modify: `apps/web/inbox.html`
- Modify: `apps/web/assets/styles/pages.css`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Consumes: `KT.NODES`、`KT.visible()`、`KT.inbox()`、`UI.cardHTML(card)`。
- Produces: `.knowledge-page`、`.filter-scroll`、`.filter-chip`、`.status-switch`、`.knowledge-list`。
- Produces: 分类筛选按钮 `button[data-category]`，不再依赖七个固定节点或隐藏分类。

- [ ] **Step 1: 写页面结构测试**

追加：

```js
test('knowledge pages use the new shared browsing structure', async () => {
  const library = await readFile(path.join(web, 'library.html'), 'utf8');
  const search = await readFile(path.join(web, 'search.html'), 'utf8');
  const inbox = await readFile(path.join(web, 'inbox.html'), 'utf8');
  assert.match(library, /class="page-head"/);
  assert.match(library, /id="categoryRail"/);
  assert.match(library, /class="filter-scroll"/);
  assert.match(search, /class="search-hero"/);
  assert.match(inbox, /class="page app-page knowledge-page"/);
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL，页面尚未使用共享结构。

- [ ] **Step 3: 实现动态分类筛选**

知识库头部和筛选区改为：

```html
<main class="page app-page knowledge-page">
  <header class="page-head">
    <div><p class="page-kicker">ALL KNOWLEDGE</p><h1>知识库</h1></div>
    <a class="icon-btn" href="search.html" aria-label="搜索知识" data-ic="search"></a>
  </header>
  <div class="filter-scroll" id="categoryRail" role="group" aria-label="按分类筛选"></div>
  <div class="status-switch" id="seg" role="tablist" aria-label="知识状态">
    <button data-f="all" role="tab" aria-selected="true">全部</button>
    <button data-f="pending" role="tab" aria-selected="false">待确认</button>
    <button data-f="uncategorized" role="tab" aria-selected="false">未分类</button>
  </div>
  <section class="knowledge-list" id="list" aria-live="polite"></section>
</main>
```

删除原生分类 `<select>`，用现有 `requestedCategory` 初始化：

```js
let selectedCategory = KT.NODES.some((node) => node.id === requestedCategory)
  ? requestedCategory
  : '';

function renderCategoryRail() {
  const items = [{ id: '', name: '全部', count: KT.visible().length }]
    .concat(KT.NODES.map((node) => ({
      id: node.id, name: node.name, count: KT.countInNode(node.id),
    })));
  document.getElementById('categoryRail').innerHTML = items.map((item) =>
    `<button class="filter-chip${item.id === selectedCategory ? ' is-active' : ''}" ` +
    `data-category="${UI.esc(item.id)}" aria-pressed="${item.id === selectedCategory}">` +
    `${UI.esc(item.name)}<span>${item.count}</span></button>`
  ).join('');
}
```

分类点击更新 `selectedCategory` 后调用 `renderCategoryRail()` 和 `render()`。状态筛选同步更新 `aria-selected`。

- [ ] **Step 4: 更新搜索和收件箱**

搜索头部改为不可滚走的 `search-hero`，保留 `#q`、`#cancel`、搜索 API 和防抖逻辑：

```html
<header class="search-hero">
  <button class="icon-btn" id="cancel" aria-label="返回知识库" data-ic="back"></button>
  <label class="search-field">
    <span class="sr-only">搜索知识</span>
    <input id="q" type="search" placeholder="搜索标题、标签或正文" autocomplete="off" />
  </label>
</header>
```

收件箱保留 `#content` 和 `#ctaBar`，增加确认范围说明：

```html
<div class="cta-bar" id="ctaBar" hidden>
  <p>只确认高置信度建议，低置信度会继续保留。</p>
  <button class="btn btn-primary btn-block" id="processAll">确认高置信度建议</button>
</div>
```

在 `pages.css` 添加：

```css
.knowledge-page { width: 100%; max-width: 920px; }
.filter-scroll { display: flex; gap: 8px; overflow-x: auto; padding: 4px 1px 10px; scrollbar-width: none; }
.filter-chip {
  min-height: 40px; padding: 0 13px; color: var(--text-muted);
  border: 1px solid var(--line); border-radius: 999px; background: var(--surface); white-space: nowrap;
}
.filter-chip span { margin-left: 7px; color: var(--gold); }
.filter-chip.is-active { color: var(--ink); background: var(--paper); }
.status-switch { display: flex; gap: 4px; margin: 8px 0 18px; }
.status-switch button { min-height: 40px; padding: 0 12px; border-radius: 10px; color: var(--text-muted); }
.status-switch button[aria-selected="true"] { color: var(--text); background: var(--surface-raised); }
.knowledge-list { display: grid; gap: 10px; }
.search-hero { position: sticky; z-index: 10; top: 0; display: flex; gap: 10px; padding: calc(12px + var(--sat)) 0 12px; background: var(--bg); }
.search-field { display: flex; flex: 1; min-height: 46px; padding: 0 13px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface); }
.search-field input { width: 100%; border: 0; outline: 0; background: transparent; }
```

- [ ] **Step 5: 运行测试**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
pnpm test
```

Expected: PASS，所有动态分类可筛选，搜索和收件箱接口不变。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/library.html apps/web/search.html apps/web/inbox.html apps/web/assets/styles/pages.css scripts/tests/ui-refresh.test.mjs
git commit -m "feat: unify knowledge browsing and inbox surfaces"
```

---

### Task 5: 重构聚焦采集页

**Files:**

- Modify: `apps/web/capture.html`
- Modify: `apps/web/assets/styles/pages.css`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Consumes: 现有 `KT.ingest()`、`KT.ingestFile()`、文件校验和 `location.replace(detailUrl(card.id))`。
- Produces: `body[data-pet-mode="focus"]`、`.focus-page`、`.capture-panel`、`.capture-modes`、`.capture-dropzone`。
- Produces: `knowtree:input-focus` 和 `knowtree:input-blur` 浏览器事件。

- [ ] **Step 1: 写焦点模式测试**

```js
test('capture uses focus mode and preserves file and history semantics', async () => {
  const html = await readFile(path.join(web, 'capture.html'), 'utf8');
  assert.match(html, /class="page focus-page"/);
  assert.match(html, /data-pet-mode="focus"/);
  assert.equal(html.includes('assets/shell.js'), false);
  assert.match(html, /id="dropZone"/);
  assert.match(html, /location\.replace\(detailUrl\(card\.id\)\)/);
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL。

- [ ] **Step 3: 重构采集结构**

保留现有 id 和提交逻辑，将页面改为单张纸面采集面板：

```html
<body class="capture-body" data-pet-mode="focus">
  <main class="page focus-page">
    <header class="capture-head">
      <button class="icon-btn" id="close" aria-label="关闭" data-ic="x"></button>
      <div><p class="page-kicker">NEW SEED</p><h1>丢一条进树里</h1></div>
    </header>
    <section class="capture-panel" aria-label="新增知识">
      <label for="title">标题</label>
      <input class="field" id="title" type="text" maxlength="200"
        placeholder="可留空，系统会根据内容整理" autocomplete="off" />
      <div class="capture-modes" role="group" aria-label="录入方式">
        <button id="textMode" type="button" aria-pressed="true">直接写</button>
        <button id="fileMode" type="button" aria-pressed="false">导入文档</button>
      </div>
      <div id="textPane"><label for="text">正文</label>
        <textarea class="field field--body" id="text" placeholder="把想法、笔记或 Markdown 丢进来…"></textarea>
      </div>
      <div id="filePane" hidden><input id="fileInput" class="sr-only" type="file"
        accept=".md,.txt,.html,.docx,.pdf" /><div id="dropZone" class="capture-dropzone"></div></div>
      <div class="capture-status" id="status" aria-live="polite"></div>
      <button class="btn btn-primary btn-block" id="submit">种下这条知识</button>
    </section>
  </main>
</body>
```

为标题和正文加入：

```js
[titleInput, text].forEach((field) => {
  field.addEventListener('focus', () => {
    document.dispatchEvent(new CustomEvent('knowtree:input-focus'));
  });
  field.addEventListener('blur', () => {
    document.dispatchEvent(new CustomEvent('knowtree:input-blur'));
  });
});
```

成功跳转前记录庆祝：

```js
try {
  sessionStorage.setItem('knowtree.pet.celebrate.v1', 'capture');
} catch (error) {
  /* 本地存储不可用时不阻断提交 */
}
location.replace(detailUrl(card.id));
```

在 `pages.css` 添加 `.capture-body`、`.focus-page`、`.capture-head`、`.capture-panel`、`.field`、`.capture-modes`、`.capture-dropzone`。`.focus-page` 使用 `width: 100%; max-width: 760px; margin-inline: auto;`。手机输入区至少占视口高度 42%。

- [ ] **Step 4: 运行采集回归**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
pnpm test
```

Expected: PASS；Markdown、文件类型、10 MB 限制、拖放和 `history.replace` 不变。

- [ ] **Step 5: 提交**

```powershell
git add apps/web/capture.html apps/web/assets/styles/pages.css scripts/tests/ui-refresh.test.mjs
git commit -m "feat: rebuild capture in focus mode"
```

---

### Task 6: 重构正文阅读和每日回顾

**Files:**

- Modify: `apps/web/detail.html`
- Modify: `apps/web/review.html`
- Modify: `apps/web/assets/styles/pages.css`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Consumes: `renderMarkdown()`、现有详情编辑/删除/移动逻辑。
- Consumes: `KT.reviewQueue(3)`、`KT.markSeen(id, 'done' | 'skipped')`。
- Produces: `.reading-sheet`、`.reading-column`、`.review-sheet`、`.review-actions`。

- [ ] **Step 1: 写阅读和回顾测试**

```js
test('reading and review keep controls on paper surfaces', async () => {
  const detail = await readFile(path.join(web, 'detail.html'), 'utf8');
  const review = await readFile(path.join(web, 'review.html'), 'utf8');
  assert.match(detail, /class="reading-column"/);
  assert.match(detail, /id="editPane"/);
  assert.match(detail, /id="saveBtn"/);
  assert.match(detail, /id="delBtn"/);
  assert.match(review, /class="review-sheet"/);
  assert.match(review, /id="forgot"/);
  assert.match(review, /id="known"/);
  assert.match(review, /查看全文/);
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL。

- [ ] **Step 3: 调整正文骨架**

```html
<main class="page app-page reading-page">
  <div class="reading-column">
    <div class="topbar">
      <button class="icon-btn" id="back" aria-label="返回" data-ic="back"></button>
      <div class="grow"></div>
    </div>
    <section class="reading-sheet" aria-label="知识正文"><div id="main"></div></section>
    <section class="edit-pane" id="editPane" aria-label="编辑知识" hidden></section>
  </div>
  <div class="actionbar" id="actionbar" hidden></div>
</main>
```

保留 `#main`、`#editPane`、`#editTitle`、`#editSummary`、`#editContent`、`#preview`、`#saveBtn`、`#editBtn`、`#moveBtn`、`#delBtn`。不要改变 Markdown 安全清洗。

- [ ] **Step 4: 调整回顾卡和动作**

```html
<body data-tab="review">
  <main class="page app-page review-page">
    <header class="page-head">
      <div><p class="page-kicker">DAILY RECALL</p><h1>每日回顾</h1></div>
      <span class="page-head__meta" id="progress"></span>
    </header>
    <section class="review-stage" id="stage"></section>
    <div class="cta-bar review-actions" id="bar" hidden>
      <button class="btn btn-ghost" id="forgot">稍后再看</button>
      <button class="btn btn-primary" id="known">已理解</button>
    </div>
  </main>
</body>
```

卡片改为：

```js
stage.innerHTML =
  '<article class="review-sheet">' +
    '<p class="page-kicker">' + UI.esc(KT.nodeName(card.nodeId)) + '</p>' +
    '<h2>' + UI.esc(card.title) + '</h2>' +
    '<p>' + UI.esc(card.summary) + '</p>' +
    '<a href="detail.html?id=' + encodeURIComponent(card.id) + '">查看全文 →</a>' +
  '</article>';
```

状态仍使用 `forgot → markSeen(id, 'skipped')`、`known → markSeen(id, 'done')`。成功后派发：

```js
document.dispatchEvent(new CustomEvent('knowtree:request-success', {
  detail: { scope: 'review' },
}));
```

在 `pages.css` 添加暖纸阅读面：

```css
.reading-page { width: 100%; max-width: 900px; }
.reading-column { width: min(100%, 760px); margin: 0 auto; }
.reading-sheet { color: var(--ink); border-radius: var(--radius-lg) var(--radius-lg) 8px 8px; background: var(--paper); }
.reading-sheet #main { padding: 28px 24px 40px; }
.reading-sheet .markdown-body { font: 16px/1.95 var(--font-reading); }
.review-stage { width: min(100%, 720px); margin: 8vh auto 0; }
.review-sheet { padding: clamp(24px, 6vw, 44px); color: var(--ink); border-radius: var(--radius-lg); background: var(--paper); box-shadow: var(--shadow-float); }
.review-sheet h2 { margin: 10px 0 16px; font: 600 clamp(26px, 5vw, 40px)/1.35 var(--font-display); }
.review-sheet p { font: 16px/1.9 var(--font-reading); }
```

- [ ] **Step 5: 运行阅读回归**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
pnpm test
```

Expected: PASS；Markdown、XSS、编辑、移动、删除和回顾状态接口不变。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/detail.html apps/web/review.html apps/web/assets/styles/pages.css scripts/tests/ui-refresh.test.mjs
git commit -m "feat: add paper reading and review surfaces"
```

---

### Task 7: 统一“我的”和认证页面

**Files:**

- Modify: `apps/web/me.html`
- Modify: `apps/web/login.html`
- Modify: `apps/web/register.html`
- Modify: `apps/web/forgot-password.html`
- Modify: `apps/web/reset-password.html`
- Modify: `apps/web/assets/styles/pages.css`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Consumes: 现有认证脚本、`KT.loadPublicConfig()`、AI 状态和账号数据。
- Produces: 本地偏好开关 `#petEnabled`、`#petMotion`，宠物运行时读取对应存储键。

- [ ] **Step 1: 写账户和认证隔离测试**

```js
test('account exposes pet preferences and auth pages remain pet-free', async () => {
  const me = await readFile(path.join(web, 'me.html'), 'utf8');
  assert.match(me, /id="petEnabled"/);
  assert.match(me, /id="petMotion"/);
  assert.match(me, /id="aiSettings"/);
  for (const page of ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html']) {
    const html = await readFile(path.join(web, page), 'utf8');
    assert.equal(html.includes('assets/shell.js'), false, `${page} shell`);
    assert.equal(html.includes('assets/pet.js'), false, `${page} pet`);
  }
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL，宠物偏好尚不存在。

- [ ] **Step 3: 添加宠物设置**

在“我的”的 AI 设置之前加入：

```html
<section class="settings-card" aria-labelledby="petSettingsTitle">
  <div class="section-row">
    <h2 id="petSettingsTitle">小黑狐</h2><span>只在当前设备保存</span>
  </div>
  <label class="switch-row" for="petEnabled">
    <span><b>显示宠物</b><small>在安全区显示陪伴角色</small></span>
    <input id="petEnabled" type="checkbox" role="switch" checked />
  </label>
  <label class="switch-row" for="petMotion">
    <span><b>减少宠物动作</b><small>保留静态状态，不播放走动和跳跃</small></span>
    <input id="petMotion" type="checkbox" role="switch" />
  </label>
</section>
```

不要改变现有 AI 开关、账号数据或退出流程。

- [ ] **Step 4: 统一认证布局**

四个认证页给现有 `<main>` 添加 `.auth-layout`，把现有 `.auth-hero` 改为 `.auth-story` 并保留标题 id，把现有 `.auth-card` 移到标题区之后。不要重写已有表单；保留每个表单的 id、label、autocomplete、submit 按钮和脚本调用。

在 `pages.css` 添加：

```css
.auth-layout {
  display: grid;
  min-height: 100dvh;
  align-content: center;
  gap: 28px;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: calc(28px + var(--sat)) 20px calc(28px + var(--sab));
}
.auth-story h1 { margin: 18px 0 0; font: 600 clamp(38px, 8vw, 68px)/1.16 var(--font-display); }
.auth-card { padding: 24px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-float); }
.settings-card { margin: 18px 0; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.switch-row { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid var(--line); }
.switch-row small { display: block; color: var(--text-muted); }
@media (min-width: 900px) { .auth-layout { grid-template-columns: 1.1fr .9fr; align-items: center; } }
```

- [ ] **Step 5: 运行账号和认证回归**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
pnpm test
```

Expected: PASS，登录、注册、找回和重置流程不变。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/me.html apps/web/login.html apps/web/register.html apps/web/forgot-password.html apps/web/reset-password.html apps/web/assets/styles/pages.css scripts/tests/ui-refresh.test.mjs
git commit -m "feat: align account and authentication surfaces"
```

---

### Task 8: 加入宠物纯状态机和已批准动作资源

**Files:**

- Create: `apps/web/assets/pet/pet-core.mjs`
- Create: `scripts/tests/pet-core.test.mjs`
- Copy: `docs/design/character/assets/pet/*.webp` → `apps/web/assets/pet/`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Produces: `PET_STATES: readonly string[]`。
- Produces: `PET_FRAMES: Record<string, string>`。
- Produces: `resolvePetState(context): string`。
- Produces: `canShowHint(options): boolean`。

- [ ] **Step 1: 写宠物状态和资源预算测试**

创建 `scripts/tests/pet-core.test.mjs`：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PET_FRAMES, resolvePetState, canShowHint,
} from '../../apps/web/assets/pet/pet-core.mjs';

test('state priority handles hide, error, typing and action states', () => {
  assert.equal(resolvePetState({ collapsed: true, error: true }), 'hidden');
  assert.equal(resolvePetState({ error: true, typing: true }), 'error');
  assert.equal(resolvePetState({ typing: true, pendingCount: 2 }), 'listen');
  assert.equal(resolvePetState({ celebrating: true }), 'celebrate');
  assert.equal(resolvePetState({ pendingCount: 2, hintAllowed: true }), 'carry');
  assert.equal(resolvePetState({ requesting: true }), 'sniff');
  assert.equal(resolvePetState({ navigating: true }), 'run');
  assert.equal(resolvePetState({ ready: true }), 'walk');
  assert.equal(resolvePetState({}), 'idle');
});

test('hint cooldown, dismissal and typing are enforced', () => {
  const base = { now: 100_000, lastShownAt: 0, dismissedKeys: [], key: 'inbox' };
  assert.equal(canShowHint(base), true);
  assert.equal(canShowHint({ ...base, typing: true }), false);
  assert.equal(canShowHint({ ...base, dismissedKeys: ['inbox'] }), false);
  assert.equal(canShowHint({ ...base, lastShownAt: 70_000 }), false);
  assert.equal(canShowHint({ ...base, lastShownAt: 50_000 }), true);
});

test('all animated UI states have an approved frame', () => {
  assert.deepEqual(Object.keys(PET_FRAMES).sort(), [
    'carry', 'celebrate', 'error', 'idle', 'listen', 'run', 'sniff', 'walk',
  ]);
});
```

追加资源预算测试：

```js
test('pet WebP frames stay under 250 KB', async () => {
  const dir = path.join(web, 'assets/pet');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.webp'));
  assert.equal(files.length, 6);
  let total = 0;
  for (const file of files) total += (await stat(path.join(dir, file))).size;
  assert.ok(total <= 250 * 1024, `pet assets are ${total} bytes`);
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/pet-core.test.mjs
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL，模块和生产资源不存在。

- [ ] **Step 3: 复制生产动作帧**

```powershell
New-Item -ItemType Directory -Force apps/web/assets/pet | Out-Null
Copy-Item docs/design/character/assets/pet/*.webp apps/web/assets/pet/
```

必须复制六个文件，名称以 `kt-fox-01_` 开头并以 `@2x.webp` 结尾。

- [ ] **Step 4: 实现纯状态机**

创建 `apps/web/assets/pet/pet-core.mjs`：

```js
export const PET_STATES = Object.freeze([
  'hidden', 'error', 'listen', 'celebrate', 'carry',
  'sniff', 'run', 'walk', 'idle',
]);

export const PET_FRAMES = Object.freeze({
  idle: 'kt-fox-01_stand@2x.webp',
  listen: 'kt-fox-01_sit@2x.webp',
  walk: 'kt-fox-01_walk@2x.webp',
  run: 'kt-fox-01_run@2x.webp',
  sniff: 'kt-fox-01_sniff@2x.webp',
  carry: 'kt-fox-01_walk@2x.webp',
  celebrate: 'kt-fox-01_turn@2x.webp',
  error: 'kt-fox-01_sit@2x.webp',
});

export function resolvePetState(context = {}) {
  if (context.collapsed) return 'hidden';
  if (context.error) return 'error';
  if (context.typing) return 'listen';
  if (context.celebrating) return 'celebrate';
  if ((context.pendingCount || 0) > 0 && context.hintAllowed) return 'carry';
  if (context.requesting) return 'sniff';
  if (context.navigating) return 'run';
  if (context.ready) return 'walk';
  return 'idle';
}

export function canShowHint({
  now, lastShownAt = 0, dismissedKeys = [], key,
  typing = false, cooldownMs = 45_000,
}) {
  if (typing || dismissedKeys.includes(key)) return false;
  return now - lastShownAt >= cooldownMs;
}
```

- [ ] **Step 5: 运行宠物核心测试**

```powershell
node --test scripts/tests/pet-core.test.mjs
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: PASS，总资源小于 250 KB。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/assets/pet scripts/tests/pet-core.test.mjs scripts/tests/ui-refresh.test.mjs
git commit -m "feat: add approved companion assets and state core"
```

---

### Task 9: 接入宠物 DOM、事件和本地偏好

**Files:**

- Create: `apps/web/assets/pet.js`
- Create: `apps/web/assets/styles/pet.css`
- Modify: `apps/web/assets/api.js`
- Modify: `apps/web/index.html`
- Modify: `apps/web/library.html`
- Modify: `apps/web/detail.html`
- Modify: `apps/web/inbox.html`
- Modify: `apps/web/search.html`
- Modify: `apps/web/review.html`
- Modify: `apps/web/me.html`
- Modify: `apps/web/capture.html`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Consumes: `resolvePetState()`、`PET_FRAMES`、`KT.inbox()`。
- Consumes: `knowtree:data-ready`、`knowtree:request-start`、`knowtree:request-success`、`knowtree:request-error`、`knowtree:input-focus`、`knowtree:input-blur`。
- Produces: `window.KTPet.setState(state: string): void`、`window.KTPet.collapse(): void`、`window.KTPet.expand(): void`。
- Produces: 本地键 `knowtree.pet.collapsed.v1`、`knowtree.pet.motion.v1`、`knowtree.pet.celebrate.v1`。

- [ ] **Step 1: 写挂载边界与只读测试**

```js
test('pet loads on app pages and never on auth pages', async () => {
  const business = ['index.html', 'library.html', 'detail.html', 'inbox.html', 'search.html', 'review.html', 'me.html', 'capture.html'];
  const auth = ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html'];
  for (const page of business) {
    const html = await readFile(path.join(web, page), 'utf8');
    assert.match(html, /assets\/pet\.js/, `${page} pet script`);
  }
  for (const page of auth) {
    const html = await readFile(path.join(web, page), 'utf8');
    assert.equal(html.includes('assets/pet.js'), false, `${page} must stay pet-free`);
  }
});

test('pet runtime only navigates and never writes knowledge', async () => {
  const source = await readFile(path.join(web, 'assets/pet.js'), 'utf8');
  assert.match(source, /location\.href/);
  assert.equal(/KT\.(ingest|assign|delete|merge|updateEntry|markSeen)\s*\(/.test(source), false);
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL，业务页尚未加载 `pet.js`。

- [ ] **Step 3: 发布最小数据事件**

在 `api.js` 模块内添加：

```js
function emit(name, detail) {
  if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }
}
```

在这些位置派发：

```js
function applyBootstrap(data) {
  cache.categories = data.categories || [];
  cache.entries = data.entries || [];
  cache.me = data.me || null;
  cache.recalls = data.recalls || [];
  rebuildNodes();
  emit('knowtree:data-ready', { count: cache.entries.length });
  return cache;
}
```

```js
function req(path, opts) {
  opts = opts || {};
  var method = String(opts.method || 'GET').toUpperCase();
  emit('knowtree:request-start', { path: path, method: method });
  // 现有 fetch、鉴权刷新和 JSON 解析保留
}
```

在 `req()` 的非 GET 成功返回前加入：

```js
if (method !== 'GET') emit('knowtree:request-success', { path: path });
```

在 `req()` 抛出业务错误前加入：

```js
emit('knowtree:request-error', { path: path, message: msg });
```

事件 detail 不得包含 token、密钥、完整正文或用户邮箱。

- [ ] **Step 4: 实现宠物 DOM 和状态切换**

所有业务页加载：

```html
<link rel="stylesheet" href="assets/styles/pet.css" />
<script type="module" src="assets/pet.js"></script>
```

`capture.html` 使用 `<body class="capture-body" data-pet-mode="focus">`，其他业务页使用 `data-pet-mode="ambient"`。

创建 `pet.js`，核心实现：

```js
import { PET_FRAMES, resolvePetState, canShowHint } from './pet/pet-core.mjs';

const COLLAPSED = 'knowtree.pet.collapsed.v1';
const MOTION = 'knowtree.pet.motion.v1';
const CELEBRATE = 'knowtree.pet.celebrate.v1';
const HINT_SHOWN = 'knowtree.pet.hintShown.v1';

function readFlag(key, fallback = false) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}
function writeFlag(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* 不阻断页面 */ }
}
function readNumber(key, fallback = 0) {
  try {
    return Number(localStorage.getItem(key) || fallback);
  } catch {
    return fallback;
  }
}

const mount = document.querySelector('[data-pet-mount]') ||
  Object.assign(document.createElement('div'), {
    className: 'pet-mount',
    dataset: { petMount: '' },
  });
if (!mount.parentNode) document.body.appendChild(mount);
mount.classList.add('pet-mount');

mount.innerHTML =
  '<button class="pet-hit" type="button" aria-label="打开小黑狐快捷入口">' +
    '<img class="pet-frame" alt="" width="768" height="676" />' +
  '</button>' +
  '<div class="pet-bubble" role="status" aria-live="polite" hidden></div>' +
  '<button class="pet-collapse" type="button" aria-label="收起小黑狐">×</button>';

const button = mount.querySelector('.pet-hit');
const image = mount.querySelector('.pet-frame');
const bubble = mount.querySelector('.pet-bubble');
let collapsed = readFlag(COLLAPSED);
let typing = false;
let requesting = false;

image.addEventListener('error', () => {
  mount.hidden = true;
});

function pendingCount() {
  if (!window.KT || typeof window.KT.inbox !== 'function') return 0;
  const box = window.KT.inbox();
  return box.pending.length + box.dups.length;
}

function renderState(state) {
  mount.dataset.state = state;
  mount.hidden = state === 'hidden';
  image.src = '/assets/pet/' + (PET_FRAMES[state] || PET_FRAMES.idle);
  bubble.hidden = state !== 'carry';
}

function refresh(extra = {}) {
  return renderState(resolvePetState({
    collapsed,
    typing,
    requesting,
    pendingCount: pendingCount(),
    hintAllowed: canShowHint({
      now: Date.now(),
      lastShownAt: readNumber(HINT_SHOWN),
      dismissedKeys: [],
      key: 'inbox',
      typing,
    }),
    ready: true,
    ...extra,
  }));
}

function setState(requested) {
  if (collapsed) return renderState('hidden');
  if (typing && requested !== 'error') return renderState('listen');
  renderState(PET_FRAMES[requested] ? requested : 'idle');
}

button.addEventListener('click', () => {
  location.href = pendingCount() > 0 ? 'inbox.html' : 'capture.html';
});

mount.querySelector('.pet-collapse').addEventListener('click', () => {
  collapsed = true;
  writeFlag(COLLAPSED, true);
  renderState('hidden');
});

document.addEventListener('knowtree:input-focus', () => {
  typing = true;
  refresh();
});
document.addEventListener('knowtree:input-blur', () => {
  typing = false;
  refresh();
});
document.addEventListener('knowtree:data-ready', () => {
  refresh();
  setTimeout(() => refresh({ ready: false }), 4400);
  if (!collapsed && pendingCount() > 0) {
    bubble.textContent = '有几片叶子还没归位，要我带你去看看吗？';
    try { localStorage.setItem(HINT_SHOWN, String(Date.now())); } catch { /* ignore */ }
  }
});
document.addEventListener('knowtree:request-start', () => {
  requesting = true;
  refresh();
});
document.addEventListener('knowtree:request-success', (event) => {
  requesting = false;
  if (!['capture', 'review'].includes(event.detail.scope)) {
    refresh({ ready: false });
    return;
  }
  setState('celebrate');
  setTimeout(() => refresh({ ready: false }), 1000);
});
document.addEventListener('knowtree:request-error', () => {
  requesting = false;
  setState('error');
});

window.KTPet = {
  setState,
  collapse() {
    collapsed = true;
    writeFlag(COLLAPSED, true);
    renderState('hidden');
  },
  expand() {
    collapsed = false;
    writeFlag(COLLAPSED, false);
    refresh();
  },
};

if (document.body.dataset.petMode === 'focus') setState('listen');
else refresh();

try {
  if (sessionStorage.getItem(CELEBRATE)) {
    sessionStorage.removeItem(CELEBRATE);
    setTimeout(() => {
      setState('celebrate');
      setTimeout(() => refresh({ ready: false }), 1000);
    }, 240);
  }
} catch (error) {
  /* 本地存储不可用时不播放跨页庆祝 */
}
```

如果会话里存在 `knowtree.pet.celebrate.v1`，首次 `setState()` 后切换 `celebrate` 900 ms，再删除该键。`matchMedia('(prefers-reduced-motion: reduce)').matches` 或 `MOTION='1'` 时只切换静态帧，不添加循环或跳跃类。

`pet.css` 的最小实现：

```css
.pet-mount {
  position: fixed;
  z-index: 55;
  right: 18px;
  bottom: calc(82px + var(--sab));
  width: 84px;
  height: 94px;
}
.pet-hit { width: 100%; height: 100%; padding: 0; border: 0; background: transparent; }
.pet-frame {
  width: 100%; height: 100%; object-fit: contain; object-position: center bottom;
  filter: drop-shadow(0 10px 12px rgba(0, 0, 0, .28));
}
.pet-bubble {
  position: absolute; right: 66px; bottom: 58px; width: 150px;
  padding: 9px 11px; color: var(--ink); border-radius: 11px 11px 3px 11px;
  background: var(--paper); font-size: 11px;
}
.pet-collapse {
  position: absolute; top: 0; right: 0; width: 28px; height: 28px;
  border-radius: 50%; background: var(--surface-raised);
}
.pet-mount[data-state="idle"] .pet-frame { animation: pet-breathe 4.8s ease-in-out infinite; }
.pet-mount[data-state="walk"] .pet-frame { animation: pet-walk 4.4s ease-in-out infinite; }
.pet-mount[data-state="run"] .pet-frame { animation: pet-run 1.9s ease-in-out infinite; }
.pet-mount[data-state="celebrate"] .pet-frame { animation: pet-hop 1.2s ease-out 1; }
body[data-pet-mode="focus"] .pet-mount {
  right: 16px; bottom: calc(18px + var(--sab)); width: 62px; height: 68px;
}
body[data-pet-mode="focus"] .pet-bubble,
body[data-pet-mode="focus"] .pet-collapse { display: none; }
@keyframes pet-breathe { 50% { transform: translateY(-3px) rotate(.4deg); } }
@keyframes pet-walk {
  0%, 100% { transform: translateX(-10px); }
  50% { transform: translateX(10px) translateY(-3px); }
}
@keyframes pet-run {
  0% { transform: translateX(-18px) rotate(-1deg); }
  50% { transform: translateX(18px) rotate(1deg); }
  100% { transform: translateX(-18px) rotate(-1deg); }
}
@keyframes pet-hop { 42% { transform: translateY(-16px) scale(.98, 1.02); } }
@media (min-width: 1200px) {
  .pet-mount { position: absolute; right: 12px; bottom: 12px; left: 12px; width: auto; }
}
@media (prefers-reduced-motion: reduce) { .pet-frame { animation: none !important; } }
```

- [ ] **Step 5: 绑定“我的”开关**

在 `me.html` 现有脚本中读取两个键，并调用 `KTPet`：

```js
const petEnabled = document.getElementById('petEnabled');
const petMotion = document.getElementById('petMotion');

petEnabled.checked = localStorage.getItem('knowtree.pet.collapsed.v1') !== '1';
petMotion.checked = localStorage.getItem('knowtree.pet.motion.v1') === '1';

petEnabled.addEventListener('change', () => {
  if (petEnabled.checked) window.KTPet?.expand();
  else window.KTPet?.collapse();
});

petMotion.addEventListener('change', () => {
  localStorage.setItem('knowtree.pet.motion.v1', petMotion.checked ? '1' : '0');
  window.location.reload();
});
```

所有 `localStorage` 读写都必须放入 `try/catch`，保持页面在不允许存储时可用。

- [ ] **Step 6: 完成五条手动行为验证**

运行 `pnpm dev` 后检查：

1. 输入框聚焦时狐狸为坐姿，无新气泡。
2. `KT.inbox()` 有数据时最多一条叼叶提示。
3. 点击狐狸只打开 `inbox.html` 或 `capture.html`。
4. 收起后刷新仍收起。
5. 减少动作后只切换静止帧，不跑不跳。

```powershell
node --test scripts/tests/pet-core.test.mjs
node --test scripts/tests/ui-refresh.test.mjs
pnpm test
```

Expected: PASS。

- [ ] **Step 7: 提交**

```powershell
git add apps/web/assets/api.js apps/web/assets/pet.js apps/web/assets/styles/pet.css apps/web/*.html scripts/tests/ui-refresh.test.mjs
git commit -m "feat: connect the KnowTree companion experience"
```

---

### Task 10: 加入页面过渡、预取和最终样式拆分

**Files:**

- Create: `apps/web/assets/transitions.js`
- Create: `apps/web/assets/styles/transitions.css`
- Modify: `apps/web/*.html`
- Modify: `apps/web/assets/styles/components.css`
- Modify: `apps/web/assets/styles/pages.css`
- Modify: `apps/api/test/client-static.test.ts`
- Modify: `scripts/tests/ui-refresh.test.mjs`

**Interfaces:**

- Produces: `window.KTTransitions.prefetch(url: string): void`。
- Produces: `knowtree.scroll:<pathname+search>` 会话滚动键。
- Consumes: 同源 `<a href>`；不处理跨域链接或 `data-no-prefetch`。

- [ ] **Step 1: 写转场和旧样式移除测试**

```js
test('all pages load transitions and no legacy app.css reference remains', async () => {
  for (const page of await htmlPages()) {
    const html = await readFile(path.join(web, page), 'utf8');
    assert.match(html, /assets\/styles\/transitions\.css/);
    assert.match(html, /assets\/transitions\.js/);
    assert.equal(html.includes('assets/app.css'), false, `${page} legacy stylesheet`);
  }
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
```

Expected: FAIL。

- [ ] **Step 3: 加入渐进增强转场**

创建 `transitions.css`：

```css
@view-transition { navigation: auto; }
::view-transition-old(root) { animation: page-out var(--motion-base) ease both; }
::view-transition-new(root) { animation: page-in var(--motion-page) ease both; }
@keyframes page-out { to { opacity: 0; transform: translateY(4px); } }
@keyframes page-in { from { opacity: 0; transform: translateY(8px); } }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) { animation: none; }
}
```

创建 `transitions.js`：

```js
(function () {
  'use strict';
  var seen = new Set();
  var connection = navigator.connection || {};

  function canPrefetch() {
    return !connection.saveData &&
      !['slow-2g', '2g'].includes(connection.effectiveType || '');
  }

  function prefetch(url) {
    if (!canPrefetch() || seen.has(url)) return;
    var target = new URL(url, location.href);
    if (target.origin !== location.origin) return;
    seen.add(url);
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = target.href;
    link.as = 'document';
    document.head.appendChild(link);
  }

  document.addEventListener('pointerover', function (event) {
    var anchor = event.target.closest('a[href]');
    if (!anchor || anchor.dataset.noPrefetch !== undefined) return;
    setTimeout(function () { prefetch(anchor.href); }, 80);
  }, { passive: true });

  document.addEventListener('focusin', function (event) {
    var anchor = event.target.closest('a[href]');
    if (anchor && anchor.dataset.noPrefetch === undefined) prefetch(anchor.href);
  });

  window.addEventListener('pagehide', function () {
    try {
      sessionStorage.setItem(
        'knowtree.scroll:' + location.pathname + location.search,
        String(window.scrollY)
      );
    } catch (error) { /* 不阻断导航 */ }
  });

  window.addEventListener('pageshow', function () {
    try {
      var saved = sessionStorage.getItem(
        'knowtree.scroll:' + location.pathname + location.search
      );
      if (saved !== null) requestAnimationFrame(function () {
        window.scrollTo(0, Number(saved) || 0);
      });
    } catch (error) { /* 不阻断导航 */ }
  });

  window.KTTransitions = { prefetch: prefetch };
})();
```

所有页面加载：

```html
<link rel="stylesheet" href="assets/styles/transitions.css" />
<script src="assets/transitions.js"></script>
```

- [ ] **Step 4: 完成 CSS 职责拆分**

从 `components.css` 迁移以下页面选择器到 `pages.css`：

```text
.auth-*、.capture-*、.drop-zone、.file-chip、
.tree、.tree-wrap、.tnode、.review-*、
.markdown-body、.detail-*、.edit-*、.actionbar
```

`components.css` 最终只保留 `.btn`、`.card`、`.field`、`.textarea`、`.icon-btn`、`.searchbar`、`.banner`、`.seg`、`.nchip`、`.tag`、`.cta-bar`、`.toast`、`.sheet`、`.dialog`、`.rows`、`.switch`、`.stats`、`.empty` 与工具类。

更新 `client-static.test.ts`，可访问性规则从两个文件合并后检查：

```ts
const css = [
  await readFile(path.join(clientDir, 'assets/styles/components.css'), 'utf8'),
  await readFile(path.join(clientDir, 'assets/styles/pages.css'), 'utf8'),
].join('\n');
```

- [ ] **Step 5: 运行全部静态与单元测试**

```powershell
node --test scripts/tests/ui-refresh.test.mjs
node --test scripts/tests/tree-summary.test.mjs
node --test scripts/tests/pet-core.test.mjs
pnpm test
```

Expected: 新测试全部通过，原 79 项测试通过。

- [ ] **Step 6: 真实浏览器验收**

```powershell
pnpm dev
```

打开 `http://localhost:9091/` 并验证：

1. 360/390 px：底部导航、采集卡、正文和宠物不重叠，无横向滚动。
2. 768 px：80 px 图标栏，主内容宽度合理。
3. 1280/1440 px：232 px 侧栏，正文最大宽度生效。
4. 登录、注册、找回密码、首页、采集、正文、知识库、搜索、收件箱、回顾、我的均可操作。
5. Tab 键能到达导航、表单和宠物入口。
6. 减少动态效果后没有循环动画。
7. 控制台无错误，页面切换无整页白屏闪烁。

- [ ] **Step 7: 提交**

```powershell
git add apps/web apps/api/test/client-static.test.ts scripts/tests/ui-refresh.test.mjs
git commit -m "feat: add fluid transitions and finalize style layers"
```

---

### Task 11: 端到端回归、构建和 Preview 交付

**Files:**

- Verify: `apps/web/**`
- Verify: `apps/api/**`
- Verify: `docs/superpowers/specs/2026-11-04-knowtree-ui-companion-design.md`

**Interfaces:**

- Consumes: 前十个任务的最终站点。
- Produces: 测试、构建、浏览器验收和 Preview 证据；不直接提升 Production。

- [ ] **Step 1: 运行全部自动化测试**

```powershell
pnpm test
```

Expected: 0 failed，0 skipped。

- [ ] **Step 2: 运行 lint、build 和 preflight**

```powershell
pnpm lint
pnpm build
pnpm preflight
```

Expected: lint 无错误，build 成功，preflight 为 Production Ready。

- [ ] **Step 3: 完成真实核心旅程**

使用测试账号执行：

```text
登录
-> 首页直接看到采集入口
-> 采集文本并自动生成标题
-> 阅读 Markdown
-> 编辑并保存
-> 知识库搜索该条目
-> 处理一条待归类
-> 完成一次回顾
-> 收起宠物并刷新
-> 确认宠物保持收起
```

再确认认证页无宠物、无业务侧栏，注册和找回密码表单仍可用。

Expected: 全流程可用，控制台无错误，无横向滚动和遮挡。

- [ ] **Step 4: 检查差异和提交**

```powershell
git status --short
git diff --check
git log --oneline -12
```

只在有最终修复时提交：

```powershell
git add -A
git commit -m "test: verify KnowTree UI companion experience"
```

不得创建空 commit。

- [ ] **Step 5: 创建 Preview 并等待授权**

记录 Preview URL、测试结果和 360/390/768/1280/1440 px 截图。只有用户明确确认后才合并 `master` 或提升 Production。


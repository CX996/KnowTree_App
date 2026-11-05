# KnowTree Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已确认规格补齐邀请制访问、账户安全、统一错误、两级分类、回收站和宠物可靠性，并保持现有静态多页架构及登录、收录、AI、Markdown 阅读流程可用。

**Architecture:** 保持现有 Express + Supabase + 原生 HTML/CSS/JS。数据库新增服务端邀请、审计、错误事件和安全字段；Express 负责身份、会话、补偿事务和稳定错误映射；浏览器只通过同源 API 操作业务数据。

**Tech Stack:** Node.js 24、TypeScript、Express 4、Supabase Auth/Postgres/RLS、Node test runner、原生 HTML/CSS/JS、agent-browser。

---

### Task 1: Database Foundation and Security Invariants

**Files:**
- Create: `supabase/migrations/<timestamp>_foundation_security.sql`
- Modify: `supabase/config.toml`
- Test: `apps/api/test/governance.test.ts`

- [ ] **Step 1: Write failing migration invariants test**

Add assertions that the migration contains:

```ts
assert.match(sql, /create table public\.invitations/i);
assert.match(sql, /create table public\.audit_events/i);
assert.match(sql, /create table public\.error_events/i);
assert.match(sql, /account_status text not null default 'active'/i);
assert.match(sql, /session_is_valid/i);
assert.match(sql, /revoke all on table public\.invitations from anon, authenticated/i);
assert.match(sql, /categories_user_parent_name_unique/i);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir apps/api exec tsx --test test/governance.test.ts`

Expected: FAIL because the new migration objects are absent.

- [ ] **Step 3: Generate the migration through the CLI**

Run: `pnpm dlx supabase@2.122.0 migration new foundation_security`

Expected: a new timestamped `supabase/migrations/*_foundation_security.sql`.

- [ ] **Step 4: Add schema, constraints, RLS and session validation**

The migration must implement:

```sql
alter table public.profiles
  add column account_status text not null default 'active'
    check (account_status in ('active', 'deletion_pending')),
  add column deletion_requested_at timestamptz,
  add column deletion_scheduled_for timestamptz;

create table public.invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  email_normalized text not null,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  auth_user_id uuid references auth.users(id),
  expires_at timestamptz not null,
  status text not null default 'active'
    check (status in ('active','claimed','used','revoked','needs_attention')),
  claim_id uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users(id),
  revoked_at timestamptz,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now()
);
```

Add service-only `audit_events` and `error_events` tables, a unique index over normalized category name scoped by user and parent, a same-user category parent constraint, column-level protection for profile security fields, and `public.session_is_valid(uuid, uuid)` restricted to `service_role`.

Set Supabase Auth:

```toml
enable_signup = false
jwt_expiry = 900
```

Keep `auth.email.enable_signup = false` and `enable_confirmations = false`.

- [ ] **Step 5: Verify migration syntax and security checks**

Run: `pnpm --dir apps/api test`
Run: `pnpm lint`

Expected: all tests pass; TypeScript reports no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/config.toml apps/api/test/governance.test.ts
git commit -m "feat: add foundation security schema"
```

### Task 2: Stable Error Envelope and Sensitive Error Filtering

**Files:**
- Create: `apps/api/src/lib/errors.ts`
- Create: `apps/api/test/errors.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing error tests**

```ts
test('safe errors preserve code, status and fields', () => {
  const error = new AppError('VALIDATION_FAILED', 400, '请输入有效邮箱', {
    retryable: false,
    fields: { email: '请输入有效邮箱' },
  });
  assert.deepEqual(toErrorEnvelope(error, 'KT-TEST'), {
    error: {
      code: 'VALIDATION_FAILED',
      message: '请输入有效邮箱',
      requestId: 'KT-TEST',
      retryable: false,
      fields: { email: '请输入有效邮箱' },
    },
  });
});

test('unknown errors never expose their message', () => {
  const envelope = toErrorEnvelope(new Error('relation public.secret does not exist'), 'KT-TEST');
  assert.equal(JSON.stringify(envelope).includes('public.secret'), false);
  assert.equal(envelope.error.code, 'SERVER_ERROR');
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir apps/api exec tsx --test test/errors.test.ts`

Expected: FAIL because `errors.ts` does not exist.

- [ ] **Step 3: Implement stable errors**

Export:

```ts
export type ErrorCode =
  | 'VALIDATION_FAILED' | 'AUTH_REQUIRED' | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'CONFLICT'
  | 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'REAUTH_FAILED'
  | 'ACCOUNT_DELETION_PENDING' | 'RATE_LIMITED'
  | 'NETWORK_UNAVAILABLE' | 'AI_UNAVAILABLE' | 'SERVER_ERROR';

export class AppError extends Error { /* code, status, retryable, fields */ }
export function requestId(): string { /* KT-YYYY-MMDD-XXXXXXXX */ }
export function toErrorEnvelope(error: unknown, id: string): ErrorEnvelope;
```

Replace direct `res.json({ error: message })` sites with `sendError`. Map Supabase Auth/SQL errors to safe categories. Auth proxy error bodies must be parsed and remapped before reaching the browser.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --dir apps/api exec tsx --test test/errors.test.ts`
Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/errors.ts apps/api/src/routes/index.ts apps/api/src/app.ts apps/api/test/errors.test.ts
git commit -m "feat: add stable API error envelopes"
```

### Task 3: Session-Aware Authentication and Account Service

**Files:**
- Create: `apps/api/src/lib/jwt.ts`
- Create: `apps/api/src/services/account.ts`
- Create: `apps/api/test/account.test.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/services/auth-proxy.ts`
- Modify: `apps/api/src/types/index.ts`

- [ ] **Step 1: Write failing tests for JWT claims and account input**

```ts
test('reads iat, exp and session id from a Supabase JWT payload', () => {
  const token = jwtWithPayload({ iat: 100, exp: 200, session_id: 'session-1' });
  assert.deepEqual(readJwtTiming(token), { iat: 100, exp: 200, sessionId: 'session-1' });
});

test('rejects a deletion cancellation with the wrong normalized email', () => {
  assert.equal(normalizeAccountEmail(' User@Example.com '), 'user@example.com');
  assert.equal(accountEmailMatches('user@example.com', 'other@example.com'), false);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir apps/api exec tsx --test test/account.test.ts`

Expected: FAIL because helpers are missing.

- [ ] **Step 3: Implement session and account primitives**

`requireAuth` must:

1. Call `auth.getUser(token)` to verify the JWT and obtain fresh `app_metadata`.
2. Read `session_id` from the verified JWT payload.
3. Call `session_is_valid(session_id, user.id)` through the admin client.
4. Attach `role`, `createdAt`, `emailConfirmedAt`, `iat`, `exp`, `sessionId` and `accountStatus`.
5. Reject revoked sessions with `AUTH_EXPIRED`.

Implement account methods with exact exports:

```ts
export async function getAccountView(user: AuthUser): Promise<AccountView>;
export async function changePassword(user: AuthUser, currentPassword: string, newPassword: string): Promise<void>;
export async function logoutCurrent(user: AuthUser): Promise<void>;
export async function logoutAll(user: AuthUser, currentPassword: string): Promise<void>;
export async function requestDeletion(user: AuthUser, input: DeletionRequest): Promise<DeletionState>;
export async function cancelDeletion(user: AuthUser, currentPassword: string): Promise<DeletionState>;
```

Use `current_password` for password changes. Use server-side password sign-in only for reauthentication, never expose the temporary session, and revoke it immediately.

- [ ] **Step 4: Wire account routes**

Add:

```text
GET    /api/v1/me
PATCH  /api/v1/me
POST   /api/v1/me/password
POST   /api/v1/me/logout
POST   /api/v1/me/logout-all
GET    /api/v1/me/deletion
POST   /api/v1/me/deletion
DELETE /api/v1/me/deletion
```

Keep `PATCH /me` backward compatible for existing AI and display preferences. Block business routes while `account_status = deletion_pending`, allowing only account recovery, logout and export.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --dir apps/api exec tsx --test test/account.test.ts test/governance.test.ts`
Run: `pnpm lint`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/jwt.ts apps/api/src/services/account.ts apps/api/src/middleware/auth.ts apps/api/src/services/auth-proxy.ts apps/api/src/types/index.ts apps/api/src/routes/index.ts apps/api/test/account.test.ts
git commit -m "feat: add session-aware account security"
```

### Task 4: Invitation-Only Registration and Owner Management

**Files:**
- Create: `apps/api/src/services/invitations.ts`
- Create: `apps/api/test/invitations.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/middleware/auth.ts`

- [ ] **Step 1: Write failing invitation tests**

```ts
test('invitation tokens are random, URL safe and stored only as hashes', () => {
  const first = createInviteCredential();
  const second = createInviteCredential();
  assert.notEqual(first.token, second.token);
  assert.match(first.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(first.tokenHash.length, 64);
  assert.notEqual(first.tokenHash, first.token);
});

test('claim compensation distinguishes known failure from uncertain state', () => {
  assert.equal(compensationStatus({ authUserCreated: false, cleanupSucceeded: true }), 'active');
  assert.equal(compensationStatus({ authUserCreated: true, cleanupSucceeded: false }), 'needs_attention');
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir apps/api exec tsx --test test/invitations.test.ts`

Expected: FAIL because the invitation service is missing.

- [ ] **Step 3: Implement invitations**

Export stable interfaces:

```ts
export function createInviteCredential(): { token: string; tokenHash: string };
export function normalizeInviteEmail(email: string): string;
export function buildInviteUrl(origin: string, token: string): string;
export async function createInvitation(owner: AuthUser, email: string): Promise<CreatedInvitation>;
export async function validateInvitation(token: string): Promise<ValidatedInvitation>;
export async function registerWithInvitation(input: InviteRegistration): Promise<AuthSession>;
export async function listInvitations(owner: AuthUser): Promise<InvitationSummary[]>;
export async function revokeInvitation(owner: AuthUser, id: string): Promise<void>;
```

Registration uses conditional database claim, Admin `createUser`, idempotent profile/default-category initialization, and compensating Auth deletion. Never expose token hashes or raw Auth errors.

- [ ] **Step 4: Wire Owner and invite routes**

Add the routes from the spec, reject the old public register endpoint with `INVITE_REQUIRED`, and make every Owner route verify fresh `app_metadata.role`.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --dir apps/api exec tsx --test test/invitations.test.ts test/auth-proxy.test.ts`
Run: `pnpm test`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/invitations.ts apps/api/src/app.ts apps/api/src/routes/index.ts apps/api/src/middleware/auth.ts apps/api/test/invitations.test.ts
git commit -m "feat: enforce invitation-only registration"
```

### Task 5: Category Hardening, Trash and Background Cleanup

**Files:**
- Create: `apps/api/src/services/trash.ts`
- Create: `apps/api/test/trash-categories.test.ts`
- Modify: `apps/api/src/services/categories.ts`
- Modify: `apps/api/src/services/entries.ts`
- Modify: `apps/api/src/services/jobs.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing behavior tests**

```ts
test('category deletion is blocked while knowledge exists', () => {
  assert.deepEqual(validateCategoryDelete({ entryCount: 1, childCount: 0 }), {
    ok: false,
    code: 'CONFLICT',
  });
});

test('deleted entries never pass the active visibility predicate', () => {
  assert.equal(isActiveEntry({ deleted_at: null }), true);
  assert.equal(isActiveEntry({ deleted_at: '2026-11-05T00:00:00Z' }), false);
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --dir apps/api exec tsx --test test/trash-categories.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement category invariants**

Reject cross-user parents, depth beyond two, cycles and sibling-name conflicts. Delete only empty categories by setting `deleted_at`; never detach knowledge automatically. AI-created categories must be top-level and deduplicated.

- [ ] **Step 4: Implement trash**

Add:

```ts
export async function listTrash(userId: string, query?: string): Promise<TrashEntry[]>;
export async function restoreEntry(userId: string, id: string): Promise<RestoredEntry>;
export async function permanentlyDeleteEntry(userId: string, id: string): Promise<void>;
export async function purgeExpiredTrash(): Promise<number>;
```

Restore checks content conflicts and missing categories. Every normal entry/search/export/tree/recall/link query excludes `deleted_at`.

- [ ] **Step 5: Extend background jobs**

Support system jobs with `user_id = NULL` for account deletion and expired trash. Keep payloads minimal and clear them after success.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm --dir apps/api exec tsx --test test/trash-categories.test.ts`
Run: `pnpm test`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/trash.ts apps/api/src/services/categories.ts apps/api/src/services/entries.ts apps/api/src/services/jobs.ts apps/api/src/routes/index.ts apps/api/test/trash-categories.test.ts
git commit -m "feat: add safe categories and trash recovery"
```

### Task 6: Browser Error and Account Clients

**Files:**
- Create: `apps/web/assets/error-view.mjs`
- Create: `apps/web/assets/account-client.mjs`
- Create: `scripts/tests/error-view.test.mjs`
- Modify: `apps/web/assets/api.js`
- Modify: `apps/web/assets/ui.js`

- [ ] **Step 1: Write failing browser helper tests**

```js
test('safe API errors expose request ids but never ambiguous messages', () => {
  const error = normalizeApiError({
    error: {
      code: 'CONFLICT',
      message: '内容与已有知识重复',
      requestId: 'KT-2026-1105-ABC',
      retryable: false,
    },
  });
  assert.equal(error.code, 'CONFLICT');
  assert.equal(error.requestId, 'KT-2026-1105-ABC');
});

test('field errors are retained for inline rendering', () => {
  const html = renderFieldError({ email: '请输入有效邮箱' }, 'email');
  assert.match(html, /请输入有效邮箱/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/tests/error-view.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement browser clients**

`normalizeApiError` must parse the stable envelope, preserve `fields`, generate a network fallback message, and expose `copyErrorId`. `account-client.mjs` must wrap account, invitation and trash endpoints with `apiRequest`.

Update `KT.errorHTML()` and all visible catch blocks to display safe Chinese messages and request IDs instead of `e.message`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test scripts/tests/error-view.test.mjs`
Run: `pnpm test`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/assets/error-view.mjs apps/web/assets/account-client.mjs apps/web/assets/api.js apps/web/assets/ui.js scripts/tests/error-view.test.mjs
git commit -m "feat: add safe browser error handling"
```

### Task 7: Account Center UI

**Files:**
- Create: `apps/web/recover-account.html`
- Create: `scripts/tests/account-ui.test.mjs`
- Modify: `apps/web/me.html`
- Modify: `apps/web/assets/styles/pages.css`
- Modify: `apps/web/assets/styles/components.css`
- Modify: `apps/web/assets/shell.js`

- [ ] **Step 1: Write failing UI structure tests**

```js
test('account center exposes identity, password, sessions and deletion separately', async () => {
  const html = await readFile('apps/web/me.html', 'utf8');
  for (const id of [
    'accountIdentity', 'accountEmail', 'accountRole',
    'changePassword', 'logoutCurrent', 'logoutAll',
    'deletionRequest', 'deleteAccount',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /id="logout"[^>]*>注销账号/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/tests/account-ui.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Build the account center**

Use a restrained editorial layout matching the existing forest/paper palette:

- identity card with letter avatar and complete email;
- dedicated account/security groups;
- current session issued/expiry times;
- password and session dialogs with inline field errors;
- separate destructive account deletion card;
- pet size, motion and position controls;
- Owner-only links loaded after fresh `/me`.

No close button is added to the pet. Forms retain values after failures and move focus to the first invalid field.

- [ ] **Step 4: Build recovery page**

`recover-account.html` shows deletion date, export, cancel with current password, and returns to normal account when cancelled. It does not load the pet.

- [ ] **Step 5: Verify GREEN**

Run: `node --test scripts/tests/account-ui.test.mjs`
Run: `pnpm test`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/me.html apps/web/recover-account.html apps/web/assets/styles/pages.css apps/web/assets/styles/components.css apps/web/assets/shell.js scripts/tests/account-ui.test.mjs
git commit -m "feat: rebuild account center"
```

### Task 8: Invitation, Owner, Category and Trash Pages

**Files:**
- Create: `apps/web/categories.html`
- Create: `apps/web/trash.html`
- Create: `apps/web/admin-invites.html`
- Create: `scripts/tests/foundation-pages.test.mjs`
- Modify: `apps/web/register.html`
- Modify: `apps/web/login.html`
- Modify: `apps/web/assets/auth-client.js`
- Modify: `apps/web/assets/account-client.mjs`

- [ ] **Step 1: Write failing page contract tests**

```js
test('public signup pages require an invitation token', async () => {
  const html = await readFile('apps/web/register.html', 'utf8');
  assert.match(html, /location\.hash/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /inviteForm/);
  assert.doesNotMatch(html, /signUpWithPassword/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/tests/foundation-pages.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement invitation registration**

Read `#invite`, validate it, remove it from the address bar, show the bound email read-only, and send nickname/password to `/auth/invite/register`. No-token page explains the invitation model and links to login.

- [ ] **Step 4: Implement management pages**

`categories.html` supports top-level and child categories, drag-free parent selection, rename, move and safe delete.

`trash.html` supports search, restore, permanent delete and immediate undo.

`admin-invites.html` supports create/copy/revoke, status filtering and shows the invite link once. Non-Owner users receive a safe permission page.

- [ ] **Step 5: Verify GREEN**

Run: `node --test scripts/tests/foundation-pages.test.mjs`
Run: `pnpm test`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/register.html apps/web/login.html apps/web/categories.html apps/web/trash.html apps/web/admin-invites.html apps/web/assets/auth-client.js apps/web/assets/account-client.mjs scripts/tests/foundation-pages.test.mjs
git commit -m "feat: add invitation and knowledge management pages"
```

### Task 9: Reliable Three-Size Pet

**Files:**
- Modify: `apps/web/assets/pet/pet-core.mjs`
- Modify: `apps/web/assets/pet.js`
- Modify: `apps/web/assets/styles/pet.css`
- Modify: `apps/web/assets/me-state.mjs`
- Modify: `scripts/tests/pet-core.test.mjs`
- Modify: `scripts/tests/pet-browser.test.mjs`

- [ ] **Step 1: Write failing pet tests**

```js
test('size changes preserve the pet in the safe viewport', () => {
  const positioned = positionPetForSize({
    left: 390, top: 690, oldWidth: 84, oldHeight: 94,
    newWidth: 132, newHeight: 144, viewportWidth: 430, viewportHeight: 760,
  });
  assert.ok(positioned.left + 132 <= 422);
  assert.ok(positioned.top + 144 <= 752);
});

test('image load failure resolves to a visible placeholder state', () => {
  assert.equal(resolveAssetFailure(), 'placeholder');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test scripts/tests/pet-core.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement pet controls**

Add three persisted sizes (`small`, `medium`, `large`) with medium as default. Recalculate bounds after size, resize, orientation, `visualViewport` and menu changes. Handle `pointercancel`, lost capture and page visibility. Image failure must show a CSS fox silhouette, not hide the mount.

- [ ] **Step 4: Add reset controls**

Pet menu and account center expose “回到默认位置”. No collapse/close control is introduced.

- [ ] **Step 5: Verify GREEN**

Run: `node --test scripts/tests/pet-core.test.mjs scripts/tests/pet-browser.test.mjs`
Run: `pnpm test`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/assets/pet/pet-core.mjs apps/web/assets/pet.js apps/web/assets/styles/pet.css apps/web/assets/me-state.mjs scripts/tests/pet-core.test.mjs scripts/tests/pet-browser.test.mjs
git commit -m "feat: make companion persistent and resizable"
```

### Task 10: Documentation, Full Verification and Preview

**Files:**
- Modify: `README.md`
- Modify: `docs/api/后端接口契约.md`
- Modify: `docs/ops/environment.md`
- Modify: `docs/ops/deployment.md`
- Modify: `scripts/tests/ui-refresh.test.mjs`
- Modify: `apps/api/test/governance.test.ts`

- [ ] **Step 1: Update operational documentation**

Document:

- disabled public signup and Owner bootstrap;
- 15-minute JWT expiry and session validation;
- invite-only registration and 7-day expiry;
- 7-day deletion and 30-day trash cron behavior;
- required Preview verification and separate Production authorization.

- [ ] **Step 2: Run full verification**

Run: `pnpm test`
Run: `pnpm lint`
Run: `pnpm build`

Expected: all tests pass, lint is clean, build succeeds.

- [ ] **Step 3: Browser verification**

Start: `pnpm dev`

Then use agent-browser to verify:

- desktop and mobile layouts;
- login and no-invite registration page;
- account center dialogs and mobile focus behavior;
- categories and trash pages;
- pet small/medium/large, drag, reset and image-failure placeholder;
- no console errors and no raw technical error text.

- [ ] **Step 4: Commit**

```bash
git add README.md docs scripts/tests/ui-refresh.test.mjs apps/api/test/governance.test.ts
git commit -m "docs: document foundation deployment and safety"
```

- [ ] **Step 5: Final repository verification**

Run:

```bash
git status --short
git log --oneline --decorate -8
pnpm test
pnpm lint
pnpm build
```

Expected: clean working tree, all verification commands exit 0.

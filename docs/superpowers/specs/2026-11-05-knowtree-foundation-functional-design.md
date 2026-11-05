# 知树基础能力与可信体验设计

日期：2026-11-05
状态：书面规格待审阅；批准后才进入实施计划
关系：补充并修订 `2026-11-04-knowtree-ui-companion-design.md` 中账户、错误、回收站和宠物部分

## 1. 目标

本次整改不是继续增加装饰，而是补齐一个可长期使用的知识产品必须具备的基础能力：

1. 明确用户身份、角色和访问方式。
2. 补齐账户查看、资料编辑、密码、会话和退出登录。
3. 把永久注销设计成可恢复的高风险流程。
4. 禁止服务端原始错误直接透传给用户。
5. 补齐分类管理、回收站和误删恢复。
6. 让宠物始终可见、可拖动、大小可控，并且不会永久丢失。
7. 为邀请制小范围测试建立可审计、可撤销的 Owner 管理能力。

## 2. 产品边界

- 知树当前采用邀请制，不开放任意注册。
- 邀请制必须在 Supabase Auth 层关闭自助注册，而不只是隐藏前端注册入口。
- 普通受邀用户只能访问自己的数据。
- Owner 只额外拥有邀请管理和脱敏错误诊断能力，不能查看用户知识正文。
- 不加入公开社交、支付、订阅、团队协作、复杂头像上传或多 Owner 管理。
- 不引入第二套前端框架。
- 不以牺牲账户安全或数据可恢复性换取表面流畅。
- 当前阶段不发送邀请邮件，邀请链接由 Owner 手动复制发送。
- 忘记密码仍依赖 Supabase 邮件；未配置自有 SMTP 前，它是受限能力，不作为主要登录保障。

## 3. 用户与角色

角色由服务端 Supabase `app_metadata.role` 决定：

| 角色 | 权限 |
|---|---|
| `owner` | 普通用户全部权限；创建/撤销邀请；查看邀请使用状态；查看脱敏错误事件 |
| `user` | 管理自己的资料、知识、分类、回收站和会话 |
| `anonymous` | 登录、找回密码、使用有效邀请链接注册 |

- 没有 `app_metadata.role = "owner"` 的已登录用户一律按 `user` 处理。
- `app_metadata` 只能由服务端设置；`user_metadata` 是用户可编辑数据，绝不能用于授权。
- Owner API 每次要从 Auth 服务返回的最新用户信息检查角色，不能只信任旧 JWT 中的角色声明。
- 角色被降级后必须撤销该用户会话。
- 首个 Owner 没有邀请来源，由部署者先在 Supabase Dashboard 创建账号，再由受控服务端设置 `app_metadata.role = "owner"`。应用不提供自助提升 Owner。
- 前端隐藏入口不能代替服务端鉴权。所有 Owner API 必须验证角色。
- Owner 角色不获得跨用户读取知识、分类、回收站或导出的能力。

## 4. 邀请制注册

### 4.1 邀请规则

- Owner 创建邀请时必须填写被邀请邮箱。
- 每个邮箱同一时间最多一条有效邀请。
- 邀请默认 7 天过期。
- 邀请只能成功使用一次。
- 邀请可撤销。
- 邀请令牌至少包含 256 位密码学随机量，采用 URL-safe 编码，数据库只保存 SHA-256 哈希。
- 邀请令牌明文只在创建成功时显示一次。
- 注册邮箱必须与邀请绑定邮箱一致。
- 验证失败、Auth 创建失败或可补偿的初始化失败不能永久消耗邀请。
- 使用成功后立即失效，并通过数据库条件更新保证并发请求只有一个能占用邀请。
- 当前阶段以邀请码作为邀请访问凭证；邮箱显示“待验证”，不依赖邮件确认。
- Supabase Auth 的公开自助注册必须关闭；邀请注册由受控服务端使用 Admin API 创建用户。
- 邀请状态只允许 `active`、`claimed`、`used`、`revoked`、`needs_attention`；过期是由 `expires_at` 推导出的状态。
- 不记录原始 IP。注册校验使用持久化频率限制和每令牌尝试次数；阈值由服务端配置，默认同一令牌连续失败 10 次后锁定。

### 4.2 邀请链接

邀请链接采用：

```text
register.html#invite=<opaque-token>
```

打开后由服务端验证令牌：

- 有效：显示邀请注册表单，邮箱只读。
- 无效、过期、撤销或已使用：显示统一邀请失败页，不透露邮箱是否已经存在。
- 不带令牌访问 `register.html`：显示“知树目前采用邀请制”，不显示密码表单。
- 令牌放在 URL fragment 中，不会被正常 HTTP 请求或 Referer 发送给服务器；页面读取后立即用 `history.replaceState()` 从地址栏移除。
- 邀请页面设置 `Referrer-Policy: no-referrer`、`Cache-Control: no-store`，验证接口不缓存响应。

### 4.3 注册流程

```text
邀请链接（浏览器 fragment）
  -> 服务端验证令牌并返回绑定邮箱
  -> 用户设置昵称和密码
  -> 数据库原子占用邀请（active -> claimed，10 分钟租约）
  -> 服务端 Admin API 创建未验证邮件的 Supabase Auth 用户
  -> 幂等创建 profile 和默认一级分类
  -> 数据库事务标记邀请 used
  -> 用户登录并进入欢迎页
```

Supabase Auth 与业务数据库不能组成一个真正的跨系统事务，因此流程采用“独占占用 + 可验证补偿”，不宣称跨系统原子性：

1. 只有状态为 `active`、未过期且租约未占用时，条件更新才能把邀请改为 `claimed`；并发请求中只有一个成功。
2. Auth 用户创建前失败：释放 claim，邀请恢复 `active`。
3. Auth 用户创建成功后立即把返回的 `auth_user_id` 写回邀请；如果这一步失败，邀请直接进入 `needs_attention`，不能再自动注册。
4. Auth 用户已创建、后续初始化失败：撤销新用户会话并删除 Auth 用户；补偿成功后释放 claim。
5. 如果补偿删除失败：邀请进入 `needs_attention`，不得自动再次使用；Owner 可撤销并重新邀请，技术错误进入脱敏错误事件。
6. 被 `claimed` 或 `used` 的邀请不能再次注册；重复提交成功结果只能进入登录页，不能创建第二个账号。
7. profile 和默认分类的初始化必须幂等，默认分类只创建一次。

邮箱按去首尾空格和小写进行规范化。Auth 用户已存在时不占用邀请，并对注册者返回统一的安全提示，避免泄露账号存在性。注册接口必须具备频率限制和最大尝试次数，防止批量猜码。

## 5. “我的”账户中心

主导航不增加设置 Tab。“我的”重构为账户中心，按以下顺序分组。

### 5.1 身份卡

`GET /api/v1/me` 返回并在账户中心显示：

- 自动生成的字母头像；
- 昵称；
- 完整邮箱；
- 角色；
- 加入时间；
- 邮箱验证状态。

当前邀请阶段不发送验证邮件，因此正常受邀账号显示“待验证（邀请制阶段）”；不能写成“已验证”。

允许修改：

- 昵称，长度 1–30 个字符；
- 不提供自定义头像上传；
- 邮箱不允许在前端直接修改。

### 5.2 账户与安全

提供：

- 修改密码；
- 当前会话签发时间；
- 当前会话到期时间；
- 退出当前设备；
- 退出所有设备；
- 邮箱验证状态说明。

修改密码必须输入：

- 当前密码；
- 新密码；
- 确认新密码。

- 新密码至少 8 个字符，并满足 Supabase 的字母加数字要求；新密码与当前密码不能相同。
- 服务端使用 Supabase 当前的 `current_password` 校验能力，不能只凭已有 access token 修改密码。
- 修改密码成功后撤销所有刷新会话、清除本机凭证并强制重新登录。

退出所有设备必须重新输入当前密码。服务端通过一次不暴露给浏览器的临时密码登录完成重新认证，临时会话只能用于本次安全操作且不得写日志。

当前会话时间来自 access token 的 `iat` 和 `exp`，按浏览器本地时区显示。界面不展示 token 或完整 `session_id`。

当前阶段不保存 IP、浏览器指纹和设备画像。“会话管理”只提供当前会话信息和全局退出，不提供逐设备列表。

### 5.3 数据与隐私

提供：

- 导出全部知识为 JSON；
- 导出全部知识为 Markdown；
- 30 天回收站；
- 隐私与 AI 使用说明；
- 永久注销账号入口。

危险操作与普通设置视觉上明确分开。

### 5.4 AI 与偏好

保留：

- AI 配置状态；
- 自动标题、摘要、分类和语义检索开关；
- 回溯提醒；
- 宠物大小；
- 减少宠物动作；
- 宠物回到默认位置。

### 5.5 Owner 专属

仅 Owner 显示：

- 邀请管理；
- 最近错误诊断；
- Owner 状态说明。

普通用户不加载、不请求 Owner 页面和 API。

## 6. 退出登录与注销账号

这是三个不同动作：

| 动作 | 数据影响 | 会话影响 |
|---|---|---|
| 退出当前设备 | 知识不变 | 清除本机凭证；服务端尝试撤销当前会话 |
| 退出所有设备 | 知识不变 | 重新验证后撤销全部刷新会话并拒绝旧 access token |
| 永久注销账号 | 进入 7 天冷静期，到期删除账号和全部数据 | 立即撤销全部会话并阻止业务访问 |

会话保证基于以下组合，不能只依赖删除用户或清除 `localStorage`：

- Supabase access token 是短期 JWT，删除 Auth 用户或退出会话都不会追溯性改写已签发 token 的 `exp`。
- 项目 access token 有效期设为不超过 15 分钟，不能高于 Supabase 推荐的 1 小时。
- 所有受保护 API 除验证用户身份外，还校验 JWT 的 `session_id` 仍在对应的 `auth.sessions` 中。
- 全局退出、修改密码和注销后，旧 access token 因会话记录不存在而被 API 拒绝，而不是只在浏览器里“看起来退出”。
- `deletion_pending` 账号除恢复、取消注销和导出外，所有业务 API 返回 `ACCOUNT_DELETION_PENDING`。

### 6.1 退出当前设备

- 用户点击后立即清理本地 access token、refresh token、bootstrap 缓存和敏感临时数据。
- 服务端尝试撤销当前 refresh session；即使撤销请求失败，本地也必须退出。
- 跳转登录页，并显示“已退出当前设备”。

### 6.2 退出所有设备

- 要求当前密码确认。
- 服务端调用全局退出，使全部刷新会话失效，并确认当前 `session_id` 已失效。
- 清除当前设备凭证和缓存。
- 跳转登录页。
- 不删除知识、分类、召回历史和偏好。

### 6.3 永久注销账号

必须要求：

1. 当前密码；
2. 手动输入完整邮箱；
3. 勾选“我知道到期后会永久删除”；
4. 明确展示计划删除日期。

申请成功后：

- 撤销所有设备会话并立即阻止业务访问；
- 账号状态改为 `deletion_pending`；
- 计划删除时间为 7 天后；
- 数据和 Auth 用户暂不删除；
- Owner 注销时额外提示“邀请管理权限将消失”；
- 记录审计事件。

在冷静期内重新登录：

- 只进入 `recover-account.html`；
- 可以重新输入当前密码取消注销；
- 可以导出知识；
- 不能继续采集、编辑或访问业务数据；
- 取消注销后恢复普通访问。

到期后由后台任务：

- 再次确认状态仍为 `deletion_pending`，且 `deletion_scheduled_for <= now()`；
- 删除该用户的 error events 和 audit events；
- 删除该用户创建、使用或绑定邮箱命中的邀请记录；Owner 注销时一并清理其创建的邀请；
- 删除 Auth 用户并撤销其全部会话，数据库 `ON DELETE CASCADE` 清理 profile、知识、分类、任务和关联记录；
- 成功后写入一条不含邮箱、正文或用户可识别资料的完成审计事件；
- 任何一步失败都保持任务可重试，不把部分成功误报为完成；
- 本地设备偏好不属于云端账号数据，可在用户重新登录时清理。

注销清理任务使用 `jobs.user_id = NULL` 的系统任务，并把目标用户 ID 放在受控 payload 中，避免删除 Auth 用户时任务行被外键级联删除。任务成功后清空 payload。

## 7. 统一错误体系

### 7.1 服务端错误结构

统一返回：

```json
{
  "error": {
    "code": "STABLE_ERROR_CODE",
    "message": "可以安全展示给用户的中文摘要",
    "requestId": "KT-2026-1105-A8F3",
    "retryable": false,
    "fields": {
      "email": "请输入有效邮箱"
    }
  }
}
```

`fields` 可选，只允许字段名和已经确定安全的中文提示。响应头同时返回 `X-Request-Id`。

禁止返回：

- 堆栈；
- SQL 错误；
- 数据库字段名；
- 环境变量；
- Access token、refresh token、密钥；
- 第三方原始响应；
- 完整正文或个人信息。

### 7.2 标准错误类别

| 类别 | 示例 | 用户动作 |
|---|---|---|
| `VALIDATION_FAILED` | 字段缺失、格式错误 | 修正字段 |
| `AUTH_REQUIRED` / `AUTH_EXPIRED` | 未登录、会话过期 | 重新登录 |
| `PERMISSION_DENIED` | 非 Owner、访问他人资源 | 返回 |
| `NOT_FOUND` | 条目或邀请不存在 | 返回列表 |
| `CONFLICT` | 重复内容、邀请已使用 | 查看冲突 |
| `INVITE_INVALID` / `INVITE_EXPIRED` | 邀请无效或过期 | 联系 Owner 重新邀请 |
| `REAUTH_FAILED` | 当前密码不正确 | 重新输入 |
| `ACCOUNT_DELETION_PENDING` | 账号处于注销冷静期 | 进入恢复页 |
| `RATE_LIMITED` | 请求过于频繁 | 稍后再试 |
| `NETWORK_UNAVAILABLE` | 断网、连接失败 | 检查网络后重试 |
| `AI_UNAVAILABLE` | AI 未配置或超时 | 使用规则降级 |
| `SERVER_ERROR` | 未预期服务错误 | 重试并提供错误编号 |

### 7.3 前端展示

- 表单错误显示在字段附近；
- 页面级错误使用完整错误卡，不只用 Toast；
- 保存失败不清空用户输入；
- 网络恢复后只提示，不自动重放写请求；
- 用户可复制错误编号，但看不到技术细节；
- 只有 Owner 的诊断页能查看脱敏请求信息。
- Axios/Express/Supabase 原始错误、Auth 代理原始响应、上传解析器错误和 cron 错误都必须先映射为稳定错误码；不能把 `error.message` 直接回传。
- `401` 自动刷新只重试一次；刷新失败后返回登录页，不循环刷新或批量重放。

### 7.4 服务端日志

- 每个请求生成 `requestId`；
- 允许记录脱敏路由模板、状态码、错误码、用户 ID、耗时和安全错误摘要；
- 不记录密码、令牌、知识正文和完整第三方响应；
- `path` 去掉查询串，并把资源 ID 替换为路由模板；邀请 token 不得进入日志；
- `error_events` 默认保留 30 天，可手动清理；
- Owner 诊断页只能看到脱敏数据，并可按请求编号、错误码和时间筛选。

## 8. 分类管理

- 分类最多两级：主分类和子分类。
- 知识树只展示主分类或高权重分类。
- 知识库提供完整分类入口和管理分类入口。
- 支持新建、重命名、调整父分类、删除空分类。
- 分类下有知识或子分类时不能直接删除。
- 分类名称在同一父级下保持唯一。
- 移动分类时禁止形成循环。
- 父分类必须属于同一用户；数据库不能只依赖前端校验。
- 主分类的唯一键等价于“同一用户、空父级、规范化名称”，子分类的唯一键等价于“同一用户、同一父级、规范化名称”。
- AI 自动创建分类时只能创建一级分类，必须先去重并遵守两级上限。
- 删除空分类使用 `deleted_at` 软删除；不再沿用当前“删除分类时把其下知识全部解绑”的行为。

## 9. 回收站

- 删除知识进入回收站，保留 30 天。
- 删除后显示“撤销”，无需离开当前页面。
- 回收站支持搜索、恢复和永久删除。
- 恢复时原分类仍存在则回到原分类，否则进入待归类。
- 回收站内容不进入普通搜索、知识树和回顾。
- 永久删除必须二次确认。
- 到期内容由后台任务清理。
- 分类仍使用“空分类才能删除”的规则，不进入知识回收站。
- 所有普通查询、详情、导出、语义检索、关键词检索、知识树、互链目标和每日回顾都必须排除 `deleted_at IS NOT NULL` 的知识。
- 恢复前重新检查内容哈希；若与当前有效知识冲突，保留回收站原记录并返回 `CONFLICT`，不能覆盖已有知识。
- 永久删除会级联清理该知识的版本、互链和回顾记录。
- 删除满 30 个完整 24 小时后允许后台任务永久清理；每日任务执行一次，最长保留不超过 31 天。

## 10. 宠物

### 10.1 尺寸

提供三档：

- 小；
- 中：默认；
- 大。

默认尺寸大于当前实现。手机中号约 118 px 高，桌面中号约 144 px 高。小号和大号按比例缩放并保持图片宽高比，具体像素在浏览器验收中固定。尺寸按设备保存。

### 10.2 拖动

- 鼠标和触屏都可拖动。
- 移动超过 8 px 才判定为拖动，轻点仍打开快捷菜单。
- 拖动期间限制在可视安全区域。
- 松手后吸附到最近左右侧边。
- 靠近底部时避开导航和主要输入区域。
- 菜单和提示气泡也必须在可视区域内，不能因宠物在边缘而跑出屏幕。
- 横竖屏切换、窗口缩放和移动端 `visualViewport` 变化后重新校正。
- 旧坐标不安全时自动恢复默认位置。
- 处理 `pointercancel`、失去 pointer capture 和页面隐藏，不能因手势中断消失。
- 小、中、大三档互相切换后重新限制位置，不能把宠物顶出屏幕。

### 10.3 恢复

- 宠物快捷菜单提供“回到默认位置”；
- 账户中心提供位置重置与大小设置；
- 资源加载失败显示可见占位状态，不能把整个宠物容器设为 `hidden`；
- 在所有主应用页面永久常驻，不提供关闭按钮；
- 登录、邀请注册、找回密码和注销恢复页面不加载宠物，避免干扰高风险表单；
- 键盘方向键可以移动，Shift 加速；
- 提供 `prefers-reduced-motion` 支持。

## 11. 数据模型

### 11.1 invitations

```text
id uuid primary key
email_normalized text not null
token_hash text not null unique
created_by uuid not null references auth.users(id)
auth_user_id uuid references auth.users(id)
expires_at timestamptz not null
status text not null default 'active'
claim_id uuid
claimed_at timestamptz
claim_expires_at timestamptz
used_at timestamptz
used_by uuid references auth.users(id)
revoked_at timestamptz
attempt_count integer not null default 0
last_attempt_at timestamptz
created_at timestamptz not null
```

约束：

- `status` 只允许 `active`、`claimed`、`used`、`revoked`、`needs_attention`。
- 邮箱去首尾空格并转小写后保存。
- 同一邮箱只能有一条同时满足 `used_at IS NULL AND revoked_at IS NULL` 的邀请；创建新邀请时先显式撤销已过期旧邀请，因为只含 `now()` 条件的部分唯一索引不可靠。
- `claimed` 租约默认 10 分钟；只有服务端能确认尚未创建 Auth 用户时，过期租约才可恢复 `active`。如果存在 `auth_user_id`、无法确认是否创建用户或存在其他不确定状态，则转为 `needs_attention`，不得自动重试注册。
- token_hash 不返回给前端列表；
- 邀请表和注册占用函数只允许服务端 service role 使用；对 `anon`、`authenticated` 撤销全部权限并开启 RLS 作为纵深防御。
- Owner 通过服务端 API 管理邀请，不直接查询表或获得 token hash。
- `used_by` 在账号永久删除时先匿名化或清理邀请记录，避免保留已删除用户的邮箱。

### 11.2 profiles

新增：

```text
account_status text not null default 'active'
deletion_requested_at timestamptz
deletion_scheduled_for timestamptz
```

`account_status` 允许：

- `active`
- `deletion_pending`

客户端不能直接修改这些字段。现有 `profiles` 的整表 `UPDATE` 授权必须移除，改为列级授权或仅服务端写入，防止用户通过 Supabase Data API 绕过 Express 修改 `account_status`。

### 11.3 audit_events

```text
id uuid primary key
actor_user_id uuid references auth.users(id) on delete cascade
action text not null
target_type text not null
target_id uuid
metadata jsonb not null default '{}'
created_at timestamptz not null
```

记录：

- 邀请创建/撤销/使用；
- 修改密码；
- 退出所有设备；
- 注销申请/取消。

`metadata` 不保存密码、令牌、完整邮箱或知识正文。表对普通客户端完全不可见，只由服务端写入；Owner 只能读取脱敏视图。

### 11.4 error_events

```text
request_id text primary key
user_id uuid references auth.users(id) on delete cascade
method text not null
path text not null
status integer not null
code text not null
safe_message text not null
retryable boolean not null
created_at timestamptz not null
```

只允许 Owner 通过服务端接口读取，普通客户端不可访问表。表对 `anon`、`authenticated` 撤销全部权限并开启 RLS；路径已经脱敏，不保存 IP、请求正文、token 或第三方完整响应。

### 11.5 现有结构复用

- `entries.deleted_at`：回收站。
- `categories.deleted_at`：分类软删除。
- `jobs`：账号到期删除和回收站到期清理。跨账号删除的系统任务使用 `user_id = NULL`，避免 Auth 用户删除后任务被级联移除。
- `profiles.display_name`：昵称。
- Auth 用户邮箱和验证状态：身份信息。
- `auth.sessions`：只用于服务端校验 JWT 的 `session_id` 是否仍然有效，不向客户端提供逐设备列表。
- `entries`、`entry_versions`、`links`、`daily_recalls`：都通过 `auth.users(id) ON DELETE CASCADE` 支持账号永久删除。

数据库还需要补充以下不变量：

- `categories.parent_id` 与 `user_id` 的组合引用必须指向同一用户的分类。
- `profiles` 的受保护安全列不能被 `authenticated` 直接更新。
- 邀请、审计和错误事件不从浏览器直连 Supabase Data API。

## 12. API 边界

### 12.1 Account

- `GET /api/v1/me`：返回当前用户身份、验证状态、角色、加入时间、profile、会话签发时间和到期时间。
- `PATCH /api/v1/me`：保留现有入口，但只允许昵称、AI 和显示偏好；不得修改角色、邮箱、账号状态或注销日期。
- `POST /api/v1/me/password`：`{ currentPassword, newPassword }`；成功后撤销全部会话并要求重新登录。
- `POST /api/v1/me/logout`：退出当前设备；即使服务端撤销失败也完成本地退出。
- `POST /api/v1/me/logout-all`：`{ currentPassword }`；重新认证成功后撤销全部会话。
- `GET /api/v1/me/deletion`：读取冷静期状态和计划删除时间。
- `POST /api/v1/me/deletion`：`{ currentPassword, confirmEmail, acknowledged }`；申请注销。
- `DELETE /api/v1/me/deletion`：当前密码确认后取消注销。
- `GET /api/v1/export`：冷静期内仍允许导出，但不得包含其他用户或已永久删除数据。

### 12.2 Invite

- `POST /api/v1/owner/invites`：创建邀请，只在本次响应返回一次邀请链接。
- `GET /api/v1/owner/invites`：列出状态、邮箱、创建时间、过期时间和使用时间，不返回 token hash。
- `DELETE /api/v1/owner/invites/:id`：撤销尚未使用的邀请。
- `POST /api/v1/auth/invite/validate`：只验证 token，不在 URL 或响应缓存中泄露邮箱存在性之外的账号信息。
- `POST /api/v1/auth/invite/register`：邀请 token、昵称、密码、确认密码。
- 现有公开 `POST /api/v1/auth/register` 不再创建任意账号；改为返回稳定的“需要邀请”错误，Supabase 原生 `/auth/v1/signup` 因项目设置关闭而拒绝。

### 12.3 Categories

沿用现有分类 API，增加：

- 父级合法性校验；
- 两级深度限制；
- 空分类删除检查；
- 名称冲突返回 `CONFLICT`。

### 12.4 Trash

- `GET /api/v1/trash`
- `POST /api/v1/trash/:id/restore`
- `DELETE /api/v1/trash/:id`

### 12.5 Owner Diagnostics

- `GET /api/v1/owner/error-events?code=&since=&limit=`：仅 Owner 可读，返回脱敏记录。

### 12.6 Cron

- 现有每日 cron 负责执行账号删除、回收站到期清理和 claim 租约恢复。
- Cron 响应和日志同样使用稳定错误码，不返回 Supabase 或 SQL 原始错误。

## 13. 安全与隐私

- Owner 角色只存在 `app_metadata`。
- 服务端每次执行 Owner 操作时读取 Auth 服务返回的最新用户数据，不能只解码旧 JWT。
- 邀请令牌只保存哈希。
- 所有用户表继续启用 RLS，并使用 `user_id = auth.uid()` 所有权谓词。
- 更新策略同时使用 `USING` 和 `WITH CHECK`。
- `invitations`、`audit_events`、`error_events` 属于服务端表：开启 RLS，同时撤销 `anon` 和 `authenticated` 的全部权限，不能仅靠“没有页面入口”保护。
- `profiles` 移除整表 update 授权，安全字段必须只允许 service role 修改。
- `service_role` secret 只存在于服务端环境变量，不进入浏览器、公开配置、日志或错误响应。
- Supabase Auth 关闭自助注册；邀请注册只通过服务端 Admin API 创建用户。
- 当前阶段保持邮件确认关闭，邀请 token 只作为访问凭证；账户中心明确显示邮箱“待验证”，不冒充邮件验证。
- access token 有效期不超过 15 分钟；所有受保护 API 校验当前 `session_id` 仍在 `auth.sessions` 中。
- 高风险接口要求重新认证。
- 错误和审计事件不得保存正文、密码、令牌和完整第三方响应。
- 邀请注册接口限制尝试次数。
- 邀请链接使用 fragment，并设置不缓存、无 Referrer 和一次读取后清除地址栏 token。
- 退出登录和注销必须清理浏览器业务缓存。
- 任何服务端接口不能仅依赖前端隐藏按钮。
- 所有普通查询都必须显式排除软删除知识；不能只依赖前端过滤。
- 分类父级、两级深度和跨用户引用必须由数据库约束和 API 双重校验。
- 注销时保留最短时间的技术任务状态，但不保留已删除用户的邮箱、token、正文或可恢复身份资料。

## 14. 页面与组件

- `me.html`：账户中心。
- `categories.html`：两级分类管理。
- `trash.html`：回收站。
- `admin-invites.html`：Owner 邀请管理。
- `recover-account.html`：注销冷静期恢复。
- `register.html`：邀请验证与邀请注册。
- 公共组件：账户分组、危险操作卡、错误卡、错误编号、会话信息、邀请状态、宠物设置。
- 登录、邀请注册、找回密码和注销恢复页面不加载宠物；所有已登录主页面加载同一套宠物组件。
- “我的”页面是账户信息的唯一主入口；分类、回收站和 Owner 邀请使用独立页面，避免把所有设置继续堆进一个长页面。

## 15. 无障碍与移动端

- 所有触控目标至少 44 × 44 px。
- 错误使用 `role="alert"` 或 `aria-live`。
- 字段错误通过 `aria-describedby` 与对应输入关联，提交后焦点移到第一个错误字段。
- 危险确认提供清楚标题、影响范围、确认说明和取消按钮。
- 错误编号可键盘复制。
- 邀请管理支持键盘操作。
- 对话框和宠物菜单需要正确的焦点进入、焦点陷阱、Esc 关闭和关闭后焦点恢复。
- 拖动宠物提供方向键替代。
- 支持减少动态效果。
- 手机虚拟键盘出现时，固定定位的宠物、Toast 和底部操作条必须使用 `visualViewport` 与安全区重新定位。

## 16. 测试与验收

### 16.1 自动化

- 邀请哈希、过期、撤销、一次性使用、并发占用、claim 租约和失败补偿。
- Auth 用户创建成功但 profile 初始化失败时可补偿删除；补偿失败进入 `needs_attention`。
- 非 Owner 访问邀请管理返回 403。
- 普通用户不能读取邀请、审计或错误事件；已关闭的公开注册不能创建账号。
- 退出当前、退出全部、修改密码后的旧 `session_id` 被 API 拒绝。
- 注销申请、冷静期限制、取消和到期删除。
- 注销完成后 Auth 用户、业务数据、错误事件和关联邀请中的用户标识全部清理。
- 错误 envelope、requestId、字段错误、retryable 和敏感字段过滤；Auth 代理与 cron 异常也不透传原文。
- 两级分类约束、同父级名称冲突、跨用户父级拒绝、空分类删除和移动循环拒绝。
- 回收站 30 天过滤、恢复、冲突恢复和永久删除；普通搜索、导出、树和回顾均排除回收站。
- 宠物尺寸、位置吸附、越界恢复、资源失败占位和 pointercancel。
- RLS 跨用户访问测试。
- 用户无法通过 Supabase Data API 直接修改 profile 安全字段或读取服务端表。

### 16.2 浏览器

- 手机和桌面完成邀请注册、登录、退出、修改密码和注销恢复。
- 手机和桌面验证直接访问无邀请的注册页、无效邀请和重复使用邀请都被拒绝。
- 普通用户看不到 Owner 入口。
- 错误页面不出现技术细节。
- 删除后可立即撤销；回收站可恢复。
- 宠物在小/中/大三档、横竖屏和拖动后都保持可见。
- 键盘可完成所有账户操作。
- 使用 `visualViewport` 模拟移动端键盘弹出，确认宠物和固定操作区不遮挡表单。

### 16.3 发布

1. 先备份并应用数据库迁移、RLS、列级授权和约束。
2. 在 Supabase Dashboard 关闭自助注册、保持当前阶段邮件确认关闭、将 JWT 有效期设为 15 分钟，并创建首个 Owner。
3. 部署 Preview。
4. 使用 Owner 和一个测试邀请账号完成端到端验证。
5. 检查 Vercel、Supabase Auth 和数据库日志无 token、密码、正文或第三方原始响应。
6. 通过后才提升 Production；该提升需要单独的发布授权。

## 17. 验收标准

- 未持有效邀请码的人不能通过应用或 Supabase 原生注册接口创建账号。
- Owner 能创建、复制和撤销绑定邮箱的邀请。
- 邀请只能使用一次，7 天后失效，注册邮箱与绑定邮箱一致。
- “退出当前设备”“退出所有设备”“永久注销”在界面和行为上完全不同。
- 用户能查看邮箱、昵称、角色、加入时间、验证状态和会话信息。
- 退出全部和修改密码后旧会话被拒绝；注销申请后业务访问立即被阻止，但拥有 7 天恢复窗口。
- 用户永远看不到堆栈、SQL、内部英文异常或服务端字段名。
- 删除知识可在 30 天内恢复。
- 分类可安全维护，删除有知识或子分类的分类会被阻止。
- 宠物永久可见、默认尺寸足够、可拖动、可重置、不会因局部坐标失效消失。
- 所有新接口通过所有者权限测试与 RLS 测试。
- 邀请注册失败不会留下无法登录的半成品账号；无法补偿时不会静默丢弃失败状态。

## 18. 事实依据与审阅边界

规格中的 Supabase 约束已按 2026-11-05 的官方文档核对：

- [User sessions](https://supabase.com/docs/guides/auth/sessions.md)：短期 access token、`session_id`、刷新会话撤销和严格会话校验。
- [Managing user data](https://supabase.com/docs/guides/auth/managing-user-data.md)：删除 Auth 用户会级联删除 Auth 会话，但不会追溯性使已签发 access token 在所有 API 立即失效。
- [Password-based Auth](https://supabase.com/docs/guides/auth/passwords.md)：`current_password` 校验、密码修改和邮件限速。
- [Users](https://supabase.com/docs/guides/auth/users.md)：未验证邮箱的默认登录限制与 Admin 创建用户能力。

当前仓库事实：

- `#logout` 目前调用立即删除账号的 `DELETE /me/account`，没有真正的退出登录。
- 分类删除当前会先解绑知识再软删除分类，与本文“空分类才能删除”冲突。
- `h()`、Auth 代理和顶层错误处理当前会直接返回 `error.message`，与统一错误体系冲突。
- 宠物图片加载失败当前会隐藏整个容器，与“永久常驻”冲突。

本文件是书面规格，不是实施计划。用户批准后，下一步才编写逐阶段实施计划；在此之前不开始功能代码、不应用线上数据库迁移、不部署 Production。

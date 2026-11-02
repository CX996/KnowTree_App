# 03-Code · 联调工具

生产源码现在直接位于仓库根目录：

- `client/`：生产静态前端
- `server/`：生产 Express API
- `supabase/`：数据库 migration
- `server.ts`：Vercel 入口

本目录只保留离线联调常用的 mock 后端：

```bash
node 03-Code/mock/server.js
```

Mock 服务监听 `9091`，仅用于无 Supabase 环境下的接口联调，不作为生产部署目标。

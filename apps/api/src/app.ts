import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import router from './routes/index.js';
import { runDueJobs } from './services/jobs.js';
import { forwardSupabaseAuth } from './services/auth-proxy.js';
import { getSupabasePublicConfig } from './storage/database/supabase-client.js';

const defaultStaticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

interface AppOptions {
  staticDir?: string | false;
}

export function configureApp(app: express.Express, options: AppOptions = {}) {
  app.disable('x-powered-by');

  if (process.env.ALLOWED_ORIGIN) {
    const allowedOrigins = process.env.ALLOWED_ORIGIN
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    app.use(cors({ origin: allowedOrigins }));
  }
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/config', (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
      res.json(getSupabasePublicConfig());
    } catch (error) {
      console.error('[api] public config unavailable:', error instanceof Error ? error.message : String(error));
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ error: '服务配置暂时未加载，请刷新页面重试' });
    }
  });

  const authRoute = (
    handler: (req: Request) => Promise<Awaited<ReturnType<typeof forwardSupabaseAuth>>>,
  ) => async (req: Request, res: Response) => {
    try {
      const result = await handler(req);
      res.setHeader('Cache-Control', 'no-store');
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (error) {
      console.error('[api] auth proxy failed:', error instanceof Error ? error.message : String(error));
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ error: '登录服务暂时不可用，请稍后重试' });
    }
  };

  app.post('/api/v1/auth/login', authRoute(async (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return { status: 400, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: '请输入邮箱和密码' }) };
    }
    return forwardSupabaseAuth({
      path: 'token?grant_type=password',
      body: { email, password },
    });
  }));

  app.post('/api/v1/auth/register', authRoute(async (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const redirectTo = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo : '';
    if (!email || !password) {
      return { status: 400, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: '请输入邮箱和密码' }) };
    }
    const query = redirectTo ? `?${new URLSearchParams({ redirect_to: redirectTo }).toString()}` : '';
    return forwardSupabaseAuth({
      path: `signup${query}`,
      body: {
        email,
        password,
        data: {},
        gotrue_meta_security: { captcha_token: null },
      },
    });
  }));

  app.post('/api/v1/auth/recover', authRoute(async (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const redirectTo = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo : '';
    if (!email) {
      return { status: 400, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: '请输入注册邮箱' }) };
    }
    const query = redirectTo ? `?${new URLSearchParams({ redirect_to: redirectTo }).toString()}` : '';
    return forwardSupabaseAuth({
      path: `recover${query}`,
      body: { email },
    });
  }));

  app.post('/api/v1/auth/refresh', authRoute(async (req) => {
    const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
    if (!refreshToken) {
      return { status: 400, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: '登录状态已失效' }) };
    }
    return forwardSupabaseAuth({
      path: 'token?grant_type=refresh_token',
      body: { refresh_token: refreshToken },
    });
  }));

  app.put('/api/v1/auth/password', authRoute(async (req) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const raw = req.headers['x-session'];
    const accessToken = Array.isArray(raw) ? raw[0] : raw;
    if (!password || !accessToken) {
      return { status: 400, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: '重置链接无效或已过期' }) };
    }
    return forwardSupabaseAuth({
      path: 'user',
      method: 'PUT',
      body: { password },
      accessToken,
    });
  }));

  app.get('/api/v1/cron/jobs', async (req, res) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      res.status(503).json({ error: 'CRON_SECRET is not set' });
      return;
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      res.json(await runDueJobs(20));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.use('/api/v1', router);
  const staticDir = options.staticDir === undefined ? defaultStaticDir : options.staticDir;
  if (staticDir) {
    app.use(express.static(staticDir, {
      index: 'index.html',
      maxAge: process.env.VERCEL ? '1h' : 0,
    }));
  }
  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api] unhandled error:', error);
    res.status(500).json({ error: message });
  });

  return app;
}

export function createApp(options: AppOptions = {}) {
  return configureApp(express(), options);
}

const app = createApp();
export default app;

import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import router from './routes/index.js';
import { runDueJobs } from './services/jobs.js';
import { forwardSupabaseAuth } from './services/auth-proxy.js';
import { getSupabasePublicConfig } from './storage/database/supabase-client.js';
import {
  AppError,
  mapAuthFailure,
  requestId,
  toErrorEnvelope,
} from './lib/errors.js';

const defaultStaticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

interface AppOptions {
  staticDir?: string | false;
}

export function configureApp(app: express.Express, options: AppOptions = {}) {
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    const id = requestId();
    res.locals.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

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
      sendApiError(
        res,
        new AppError('SERVER_ERROR', 503, '服务配置暂时未加载，请刷新页面重试', { retryable: true }),
      );
    }
  });

  const authRoute = (
    handler: (req: Request) => Promise<Awaited<ReturnType<typeof forwardSupabaseAuth>>>,
  ) => async (req: Request, res: Response) => {
    try {
      const result = await handler(req);
      res.setHeader('Cache-Control', 'no-store');
      if (result.status >= 400) {
        const mapped = mapAuthFailure(result.status);
        sendApiError(
          res,
          new AppError(mapped.code, mapped.status, mapped.message, { retryable: mapped.retryable }),
        );
        return;
      }
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (error) {
      console.error('[api] auth proxy failed:', error instanceof Error ? error.message : String(error));
      res.setHeader('Cache-Control', 'no-store');
      sendApiError(
        res,
        error instanceof AppError
          ? error
          : new AppError('NETWORK_UNAVAILABLE', 503, '登录服务暂时不可用，请稍后重试', {
            retryable: true,
            cause: error,
          }),
      );
    }
  };

  app.post('/api/v1/auth/login', authRoute(async (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      throw new AppError('VALIDATION_FAILED', 400, '请输入邮箱和密码', {
        fields: {
          ...(!email ? { email: '请输入邮箱' } : {}),
          ...(!password ? { password: '请输入密码' } : {}),
        },
      });
    }
    return forwardSupabaseAuth({
      path: 'token?grant_type=password',
      body: { email, password },
    });
  }));

  app.post('/api/v1/auth/register', authRoute(async (req) => {
    void req;
    throw new AppError('INVITE_REQUIRED', 403, '知树目前采用邀请制，请使用有效邀请链接注册');
  }));

  app.post('/api/v1/auth/recover', authRoute(async (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const redirectTo = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo : '';
    if (!email) {
      throw new AppError('VALIDATION_FAILED', 400, '请输入注册邮箱', {
        fields: { email: '请输入注册邮箱' },
      });
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
      throw new AppError('AUTH_EXPIRED', 401, '登录状态已失效，请重新登录');
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
      throw new AppError('AUTH_EXPIRED', 401, '重置链接无效或已过期，请重新申请');
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
      sendApiError(res, new AppError('SERVER_ERROR', 503, '定时任务暂时不可用', { retryable: true }));
      return;
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      sendApiError(res, new AppError('AUTH_REQUIRED', 401, '无权执行定时任务'));
      return;
    }
    try {
      res.json(await runDueJobs(20));
    } catch (error) {
      console.error('[api] cron failed:', error instanceof Error ? error.message : String(error));
      sendApiError(
        res,
        new AppError('SERVER_ERROR', 500, '定时任务执行失败，请稍后重试', {
          retryable: true,
          cause: error,
        }),
      );
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
    sendApiError(res, new AppError('NOT_FOUND', 404, '请求的内容不存在'));
  });
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api] unhandled error ${String(res.locals.requestId || '')} ${req.method} ${req.originalUrl}:`, message);
    sendApiError(res, error);
  });

  return app;
}

function sendApiError(res: Response, error: unknown): void {
  const id = typeof res.locals.requestId === 'string' ? res.locals.requestId : requestId();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  res.setHeader('Cache-Control', 'no-store');
  const envelope = toErrorEnvelope(error, id);
  const status = error instanceof AppError ? error.status : 500;
  res.status(status).json(envelope);
}

export function createApp(options: AppOptions = {}) {
  return configureApp(express(), options);
}

const app = createApp();
export default app;

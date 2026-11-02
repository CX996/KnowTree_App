import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import router from './routes/index.js';
import { runDueJobs } from './services/jobs.js';
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
      res.json(getSupabasePublicConfig());
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

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

import express from 'express';
import path from 'node:path';
import { configureApp } from './apps/api/src/app.js';

const app = express();
configureApp(app, { staticDir: path.join(process.cwd(), 'apps/web') });

export default app;

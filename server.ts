import express from 'express';
import path from 'node:path';
import { configureApp } from './server/src/app.js';

const app = express();
configureApp(app, { staticDir: path.join(process.cwd(), 'client') });

export default app;

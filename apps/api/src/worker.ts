import { runDueJobs } from './services/jobs.js';

const limit = Math.max(1, Number(process.env.WORKER_BATCH_SIZE || 20));
const result = await runDueJobs(limit);
console.log(`[jobs] claimed=${result.claimed} processed=${result.processed}`);

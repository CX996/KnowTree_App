import express from "express";
import cors from "cors";
import router from './routes';
import { runDueJobs } from './services/jobs';

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (_req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// 业务路由（统一 /api/v1 前缀，内部已挂鉴权中间件）
app.use('/api/v1', router);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});

// 后台任务队列轮询：每隔 30s 消费一次到期任务
const JOB_INTERVAL_MS = 30_000;
let consuming = false;
async function tick() {
  if (consuming) return;
  consuming = true;
  try {
    const result = await runDueJobs(5);
    if (result.claimed > 0) {
      console.log(`[jobs] 消费任务 ${result.claimed} 个，成功 ${result.processed}`);
    }
  } catch (e) {
    console.error('[jobs] 任务轮询失败:', e instanceof Error ? e.message : String(e));
  } finally {
    consuming = false;
  }
}
setInterval(tick, JOB_INTERVAL_MS);
// 启动即消费一次
setTimeout(tick, 2000);
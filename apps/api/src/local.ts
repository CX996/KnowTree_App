import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnvironment } from './lib/local-env.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadLocalEnvironment(root);

const { default: app } = await import('./app.js');

const port = Number(process.env.PORT || 9091);
app.listen(port, () => {
  console.log(`KnowTree API listening at http://localhost:${port}/api/v1`);
});

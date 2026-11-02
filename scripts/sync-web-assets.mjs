import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'apps/web/assets/vendor');

await mkdir(vendorDir, { recursive: true });
await Promise.all([
  copyFile(
    path.join(root, 'node_modules/marked/lib/marked.esm.js'),
    path.join(vendorDir, 'marked.esm.js'),
  ),
  copyFile(
    path.join(root, 'node_modules/dompurify/dist/purify.es.mjs'),
    path.join(vendorDir, 'purify.es.mjs'),
  ),
]);

console.log('Web vendor assets synced.');

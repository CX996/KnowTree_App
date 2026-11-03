import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePublicConfig } from './public-config.mjs';

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

const generatedPublicConfig = await writePublicConfig(root);

console.log(
  generatedPublicConfig
    ? 'Web vendor assets and public config synced.'
    : 'Web vendor assets synced; public config uses the API fallback.',
);

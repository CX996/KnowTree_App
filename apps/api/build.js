import * as esbuild from 'esbuild';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');
const dependencies = pkg.dependencies || {};
const externalList = Object.keys(dependencies);
try {
  await esbuild.build({
    entryPoints: ['src/app.ts', 'src/local.ts', 'src/worker.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir: 'dist',
    external: externalList,
  });
  console.log('⚡ Build complete!');
} catch (e) {
  console.error(e);
  process.exit(1);
}

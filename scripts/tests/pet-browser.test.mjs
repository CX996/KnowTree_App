import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root)) throw new Error('invalid path');
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      response.writeHead(200, { 'Content-Type': contentType(file) });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('pet runtime passes a real DOM behavior contract in headless Edge', async (t) => {
  const browser = findBrowser();
  if (!browser) {
    t.skip('Microsoft Edge is not installed');
    return;
  }

  const server = await startServer();
  const profile = await mkdtemp(path.join(os.tmpdir(), 'knowtree-pet-'));
  try {
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/scripts/tests/fixtures/pet-runtime.html`;
    const { stdout } = await execFileAsync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=1600',
      '--dump-dom',
      url,
    ], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
    assert.match(stdout, /data-test-result="pass"/, stdout);
    assert.match(stdout, /<pre id="browserResult">PASS<\/pre>/, stdout);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});

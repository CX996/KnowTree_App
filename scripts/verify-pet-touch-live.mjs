import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const edgePath = process.env.EDGE_PATH
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const fixtureDir = process.env.BROWSER_FIXTURE_DIR?.trim()
  || path.join(os.tmpdir(), 'knowtree-browser-fixture');
const initPath = path.join(fixtureDir, 'init.js');
const pageUrl = process.env.PET_VERIFY_URL?.trim()
  || 'https://knowtree-app.vercel.app/me.html';
const profileDir = path.join(os.tmpdir(), `knowtree-cdp-pet-${process.pid}`);

assert.ok(existsSync(edgePath), 'Microsoft Edge executable is missing');
assert.ok(existsSync(initPath), 'Browser fixture init script is missing');

const initSource = await readFile(initPath, 'utf8');
const port = await freePort();
const browser = spawn(edgePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-extensions',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let ws;
try {
  const target = await waitForPageTarget(port);
  ws = await connectCdp(target.webSocketDebuggerUrl);

  await ws.send('Page.enable');
  await ws.send('Runtime.enable');
  await ws.send('Network.enable');
  await ws.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await ws.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 5,
  });
  await ws.send('Page.addScriptToEvaluateOnNewDocument', { source: initSource });
  await ws.send('Page.navigate', { url: pageUrl });
  await poll(async () => {
    const result = await evaluate(`({
      ready: document.querySelector('#accountDisplayName')?.textContent === '视觉验收',
      pet: Boolean(document.querySelector('.pet-hit')),
      hidden: document.querySelector('.pet-mount')?.hidden === true
    })`);
    return result.ready && result.pet && !result.hidden;
  }, 15000, 'production account/pet did not render');

  const before = await petState();
  assert.equal(before.hidden, false, 'pet must be visible before drag');

  const startX = before.rect.left + before.rect.width / 2;
  const startY = before.rect.top + before.rect.height / 2;
  await touch('touchStart', [{ x: startX, y: startY }]);
  await touch('touchMove', [{ x: startX - 45, y: startY - 25 }]);
  await touch('touchMove', [{ x: startX - 95, y: startY - 55 }]);
  await touch('touchEnd', []);
  await delay(350);

  const afterDrag = await petState();
  assert.equal(afterDrag.hidden, false, 'pet disappeared after touch drag');
  assert.ok(
    Math.abs(afterDrag.rect.left - before.rect.left) >= 20
      || Math.abs(afterDrag.rect.top - before.rect.top) >= 20,
    `pet did not move with real touch input: before=${JSON.stringify(before.rect)} after=${JSON.stringify(afterDrag.rect)}`,
  );
  assert.ok(
    afterDrag.rect.left >= 0 && afterDrag.rect.right <= 390,
    `pet left the mobile viewport horizontally: ${JSON.stringify(afterDrag)}`,
  );
  assert.ok(
    afterDrag.rect.top >= 0 && afterDrag.rect.bottom <= 844,
    `pet left the mobile viewport vertically: ${JSON.stringify({ before, afterDrag })}`,
  );

  const tapX = afterDrag.rect.left + afterDrag.rect.width / 2;
  const tapY = afterDrag.rect.top + afterDrag.rect.height / 2;
  await touch('touchStart', [{ x: tapX, y: tapY }]);
  await touch('touchEnd', []);
  await delay(350);

  const afterTap = await evaluate(`({
    menuHidden: document.querySelector('.pet-menu')?.hidden,
    expanded: document.querySelector('.pet-hit')?.getAttribute('aria-expanded'),
    mountHidden: document.querySelector('.pet-mount')?.hidden,
    display: getComputedStyle(document.querySelector('.pet-mount')).display,
    visibility: getComputedStyle(document.querySelector('.pet-mount')).visibility
  })`);
  assert.equal(afterTap.mountHidden, false, 'pet disappeared after tap');
  assert.equal(afterTap.menuHidden, false, 'tap did not open the pet menu');
  assert.equal(afterTap.expanded, 'true', 'tap did not update aria-expanded');
  assert.notEqual(afterTap.display, 'none', 'pet display became none after tap');
  assert.notEqual(afterTap.visibility, 'hidden', 'pet visibility became hidden after tap');

  await ws.send('Network.setBlockedURLs', { urls: ['*kt-fox-01*.webp*'] });
  await ws.send('Page.reload', { ignoreCache: true });
  await poll(async () => {
    const result = await evaluate(`({
      ready: document.querySelector('#accountDisplayName')?.textContent === '视觉验收',
      pet: Boolean(document.querySelector('.pet-hit'))
    })`);
    return result.ready && result.pet;
  }, 15000, 'production account/pet did not render after reload');
  await delay(500);

  const assetFailure = await evaluate(`({
    mountHidden: document.querySelector('.pet-mount')?.hidden,
    asset: document.querySelector('.pet-mount')?.dataset.asset,
    imageHidden: document.querySelector('.pet-frame')?.hidden,
    display: getComputedStyle(document.querySelector('.pet-mount')).display
  })`);
  assert.equal(assetFailure.mountHidden, false, 'pet disappeared when images failed');
  assert.equal(assetFailure.asset, 'placeholder', 'image failure placeholder was not applied');
  assert.equal(assetFailure.imageHidden, true, 'failed frame was not hidden');
  assert.notEqual(assetFailure.display, 'none', 'failed pet mount is display:none');

  console.log(JSON.stringify({
    passed: true,
    checks: ['real-touch-drag', 'touch-tap-menu', 'viewport-bounds', 'asset-failure-placeholder'],
    before,
    afterDrag,
    afterTap,
    assetFailure,
  }, null, 2));
} finally {
  try {
    await ws?.send('Browser.close');
  } catch {
    // Browser may already have exited.
  }
  ws?.close();
  browser.kill();
  await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
}

async function petState() {
  return evaluate(`(() => {
    const mount = document.querySelector('.pet-mount');
    const button = document.querySelector('.pet-hit');
    const rect = button.getBoundingClientRect();
    return {
      hidden: mount.hidden,
      asset: mount.dataset.asset || '',
      styleLeft: mount.style.left,
      styleTop: mount.style.top,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      menuHidden: document.querySelector('.pet-menu').hidden,
      expanded: button.getAttribute('aria-expanded')
    };
  })()`);
}

async function touch(type, points) {
  await ws.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((point, index) => ({
      x: point.x,
      y: point.y,
      radiusX: 2,
      radiusY: 2,
      force: 1,
      id: index,
    })),
  });
  await delay(40);
}

async function evaluate(expression) {
  const result = await ws.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  }
  return result.result?.value;
}

async function poll(check, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(150);
  }
  throw new Error(message);
}

async function waitForPageTarget(debugPort) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const pages = await response.json();
      const page = pages.find((item) => item.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Browser is still starting.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for Edge CDP target');
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const portValue = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(portValue));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleBackgroundTask } from '../src/lib/background.js';

test('background task is handed to the serverless scheduler exactly once', async () => {
  let scheduled: Promise<unknown> | null = null;
  let ran = false;

  const promise = scheduleBackgroundTask(async () => {
    ran = true;
    return 'ok';
  }, (work) => {
    scheduled = work;
  });

  assert.ok(scheduled);
  assert.equal(await promise, 'ok');
  assert.equal(await scheduled, 'ok');
  assert.equal(ran, true);
});

test('background task failures do not become unhandled promise rejections', async () => {
  const previousError = console.error;
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => logged.push(args);

  try {
    const promise = scheduleBackgroundTask(
      async () => { throw new Error('worker failed'); },
      () => undefined,
    );
    assert.equal(await promise, undefined);
    assert.equal(logged.length, 1);
  } finally {
    console.error = previousError;
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountEmailMatches,
  deletionSchedule,
  normalizeAccountEmail,
} from '../src/services/account.js';
import { readJwtTiming } from '../src/lib/jwt.js';

function tokenWithPayload(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

test('reads iat, exp and session id from a verified Supabase access token', () => {
  const token = tokenWithPayload({
    sub: 'user-1',
    iat: 100,
    exp: 200,
    session_id: 'session-1',
  });

  assert.deepEqual(readJwtTiming(token), {
    iat: 100,
    exp: 200,
    sessionId: 'session-1',
  });
});

test('rejects malformed access token timing without exposing parser errors', () => {
  assert.throws(() => readJwtTiming('not-a-jwt'), {
    name: 'Error',
    message: 'Invalid access token',
  });
});

test('normalizes confirmation email exactly before matching', () => {
  assert.equal(normalizeAccountEmail(' User@Example.com '), 'user@example.com');
  assert.equal(accountEmailMatches(' user@example.com ', 'USER@example.com'), true);
  assert.equal(accountEmailMatches('user@example.com', 'other@example.com'), false);
});

test('deletion is scheduled for seven complete days', () => {
  const requested = new Date('2026-11-05T08:00:00.000Z');
  const schedule = deletionSchedule(requested);

  assert.equal(schedule.requestedAt, '2026-11-05T08:00:00.000Z');
  assert.equal(schedule.scheduledFor, '2026-11-12T08:00:00.000Z');
});

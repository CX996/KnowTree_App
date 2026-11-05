import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AppError,
  mapAuthFailure,
  requestId,
  toErrorEnvelope,
} from '../src/lib/errors.js';

test('safe errors preserve code, status, retryability and field messages', () => {
  const error = new AppError('VALIDATION_FAILED', 400, '请检查输入内容', {
    retryable: false,
    fields: { email: '请输入有效邮箱' },
  });

  assert.deepEqual(toErrorEnvelope(error, 'KT-TEST'), {
    error: {
      code: 'VALIDATION_FAILED',
      message: '请检查输入内容',
      requestId: 'KT-TEST',
      retryable: false,
      fields: { email: '请输入有效邮箱' },
    },
  });
});

test('unknown errors never expose their technical message', () => {
  const envelope = toErrorEnvelope(
    new Error('relation public.secret_table does not exist'),
    'KT-TEST',
  );

  assert.equal(JSON.stringify(envelope).includes('public.secret_table'), false);
  assert.equal(envelope.error.code, 'SERVER_ERROR');
  assert.equal(envelope.error.message, '服务暂时出现异常，请稍后重试');
});

test('auth failures are mapped to safe Chinese messages', () => {
  assert.deepEqual(mapAuthFailure(401), {
    code: 'AUTH_INVALID_CREDENTIALS',
    status: 401,
    message: '邮箱或密码不正确',
    retryable: false,
  });
  assert.deepEqual(mapAuthFailure(429), {
    code: 'RATE_LIMITED',
    status: 429,
    message: '尝试次数过多，请稍后再试',
    retryable: true,
  });
});

test('request ids are unique, stable-shaped and safe to copy', () => {
  const first = requestId();
  const second = requestId();

  assert.match(first, /^KT-\d{8}-[A-F0-9]{8}$/);
  assert.notEqual(first, second);
});

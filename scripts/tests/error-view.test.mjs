import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeHtml,
  normalizeApiError,
  renderErrorCard,
  renderFieldError,
} from '../../apps/web/assets/error-view.mjs';

test('safe API errors expose request ids and field messages', () => {
  const error = normalizeApiError({
    error: {
      code: 'VALIDATION_FAILED',
      message: '请检查输入内容',
      requestId: 'KT-2026-1105-ABC',
      retryable: false,
      fields: { email: '请输入有效邮箱' },
    },
  });

  assert.equal(error.code, 'VALIDATION_FAILED');
  assert.equal(error.requestId, 'KT-2026-1105-ABC');
  assert.equal(error.fields.email, '请输入有效邮箱');
});

test('unknown response bodies never become visible raw errors', () => {
  const error = normalizeApiError({ message: 'relation public.secret_table does not exist' });

  assert.equal(error.code, 'UNKNOWN_ERROR');
  assert.equal(error.message, '操作失败，请稍后重试');
  assert.equal(JSON.stringify(error).includes('public.secret_table'), false);
});

test('field errors are escaped before inline rendering', () => {
  const html = renderFieldError({ email: '<script>bad()</script>' }, 'email');

  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.equal(html.includes('<script>'), false);
});

test('error cards show a copyable request id without technical detail', () => {
  const error = normalizeApiError({
    error: {
      code: 'SERVER_ERROR',
      message: '服务暂时出现异常，请稍后重试',
      requestId: 'KT-2026-1105-DEF',
      retryable: true,
    },
  });
  const html = renderErrorCard(error);

  assert.match(html, /data-copy-error="KT-2026-1105-DEF"/);
  assert.match(html, /服务暂时出现异常/);
  assert.equal(html.includes('stack'), false);
});

test('html escaping covers attribute-sensitive characters', () => {
  assert.equal(
    escapeHtml('"<&'),
    '&quot;&lt;&amp;',
  );
});

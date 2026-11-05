export class ApiDisplayError extends Error {
  constructor({ code, message, requestId, retryable, fields }) {
    super(message);
    this.name = 'ApiDisplayError';
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.fields = fields;
  }
}

export function normalizeApiError(value) {
  const envelope = value?.body?.error || value?.error || value;
  if (
    envelope
    && typeof envelope.code === 'string'
    && typeof envelope.message === 'string'
    && typeof envelope.requestId === 'string'
  ) {
    return new ApiDisplayError({
      code: envelope.code,
      message: envelope.message,
      requestId: envelope.requestId,
      retryable: envelope.retryable === true,
      fields: envelope.fields && typeof envelope.fields === 'object'
        ? envelope.fields
        : undefined,
    });
  }

  if (value?.code && value?.message && value?.requestId) {
    return new ApiDisplayError({
      code: String(value.code),
      message: String(value.message),
      requestId: String(value.requestId),
      retryable: value.retryable === true,
      fields: value.fields && typeof value.fields === 'object' ? value.fields : undefined,
    });
  }

  return new ApiDisplayError({
    code: 'UNKNOWN_ERROR',
    message: value?.name === 'AbortError'
      ? '请求超时，请检查网络后重试'
      : '操作失败，请稍后重试',
    requestId: '',
    retryable: true,
    fields: undefined,
  });
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderFieldError(fields, name) {
  const message = fields?.[name];
  if (!message) return '';
  return `<div class="field-error" id="${escapeHtml(name)}-error" role="alert">${escapeHtml(message)}</div>`;
}

export function renderErrorCard(value, options = {}) {
  const error = normalizeApiError(value);
  const title = options.title || '操作没有完成';
  const retry = options.retryLabel
    ? `<button class="btn btn-ghost mt12" type="button" data-retry-action>${escapeHtml(options.retryLabel)}</button>`
    : '';
  return (
    '<section class="error-card" role="alert">' +
      `<div class="error-card__title">${escapeHtml(title)}</div>` +
      `<div class="error-card__message">${escapeHtml(error.message)}</div>` +
      (error.requestId
        ? `<button class="error-card__id" type="button" data-copy-error="${escapeHtml(error.requestId)}">` +
          `错误编号 ${escapeHtml(error.requestId)}</button>`
        : '') +
      retry +
    '</section>'
  );
}

export async function copyErrorId(requestId) {
  if (!requestId) return false;
  try {
    await navigator.clipboard.writeText(requestId);
    return true;
  } catch {
    return false;
  }
}

export function bindErrorCopy(root = document) {
  root.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-copy-error]');
    if (!button) return;
    const copied = await copyErrorId(button.getAttribute('data-copy-error'));
    button.textContent = copied ? '错误编号已复制' : '复制失败，请手动记录';
  });
}

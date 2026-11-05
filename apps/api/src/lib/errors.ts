import { randomBytes } from 'node:crypto';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_UNCONFIRMED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVITE_REQUIRED'
  | 'INVITE_INVALID'
  | 'INVITE_EXPIRED'
  | 'REAUTH_FAILED'
  | 'ACCOUNT_DELETION_PENDING'
  | 'RATE_LIMITED'
  | 'NETWORK_UNAVAILABLE'
  | 'AI_UNAVAILABLE'
  | 'FILE_UPLOAD_FAILED'
  | 'SERVER_ERROR';

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    retryable: boolean;
    fields?: Record<string, string>;
  };
}

export interface AppErrorOptions {
  retryable?: boolean;
  fields?: Record<string, string>;
  cause?: unknown;
}

export interface MappedAuthFailure {
  code: ErrorCode;
  status: number;
  message: string;
  retryable: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly fields?: Record<string, string>;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? false;
    this.fields = options.fields;
  }
}

export function toErrorEnvelope(error: unknown, id: string): ErrorEnvelope {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        requestId: id,
        retryable: error.retryable,
        ...(error.fields && Object.keys(error.fields).length > 0
          ? { fields: error.fields }
          : {}),
      },
    };
  }

  return {
    error: {
      code: 'SERVER_ERROR',
      message: '服务暂时出现异常，请稍后重试',
      requestId: id,
      retryable: true,
    },
  };
}

export function mapAuthFailure(status: number): MappedAuthFailure {
  if (status === 400 || status === 422) {
    return {
      code: 'VALIDATION_FAILED',
      status,
      message: '请检查邮箱和密码后重试',
      retryable: false,
    };
  }
  if (status === 401) {
    return {
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
      message: '邮箱或密码不正确',
      retryable: false,
    };
  }
  if (status === 403) {
    return {
      code: 'PERMISSION_DENIED',
      status: 403,
      message: '当前账号无权执行此操作',
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      status: 404,
      message: '请求的内容不存在',
      retryable: false,
    };
  }
  if (status === 409) {
    return {
      code: 'CONFLICT',
      status: 409,
      message: '当前状态已发生变化，请刷新后重试',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      status: 429,
      message: '尝试次数过多，请稍后再试',
      retryable: true,
    };
  }
  return {
    code: 'SERVER_ERROR',
    status: status >= 500 ? status : 503,
    message: '登录服务暂时不可用，请稍后重试',
    retryable: true,
  };
}

export function requestId(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `KT-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

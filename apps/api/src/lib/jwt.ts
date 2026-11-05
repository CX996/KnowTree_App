export interface JwtTiming {
  iat: number;
  exp: number;
  sessionId: string;
}

export function readJwtTiming(token: string): JwtTiming {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('invalid');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (
      !Number.isFinite(payload.iat)
      || !Number.isFinite(payload.exp)
      || typeof payload.session_id !== 'string'
      || !payload.session_id
    ) {
      throw new Error('invalid');
    }
    return {
      iat: Number(payload.iat),
      exp: Number(payload.exp),
      sessionId: payload.session_id,
    };
  } catch {
    throw new Error('Invalid access token');
  }
}

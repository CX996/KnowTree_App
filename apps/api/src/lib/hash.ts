import crypto from 'crypto';

export function sha256(input: string, encoding: 'hex' | 'base64' = 'hex'): string {
  return crypto.createHash('sha256').update(input).digest(encoding);
}

export function contentHash(content: string): string {
  // 去重哈希基于归一化后的正文，避免排版差异造成重复收录
  return sha256(content);
}

export function urlHash(canonicalUrl: string): string {
  return sha256(canonicalUrl);
}
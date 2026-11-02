// 文本处理工具：URL 规范化 / HTML 转纯文本 / 正文归一化 / 截断

import type { ContentSource } from '../types/index.js';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'spm', 'fbclid', 'gclid', 'ref', 'referrer',
]);

export function canonicalizeUrl(rawUrl: string): { canonical: string; domain: string } {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { canonical: rawUrl.trim(), domain: '' };
  }
  u.hash = '';
  for (const key of Array.from(u.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      u.searchParams.delete(key);
    }
  }
  u.searchParams.sort();
  const canonical = u.toString();
  const domain = (u.hostname || '').replace(/^www\./, '');
  return { canonical, domain };
}

export function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname || '').replace(/^www\./, '');
  } catch {
    return '';
  }
}

const BLOCK_TAGS = /<\/(p|div|h1|h2|h3|h4|h5|h6|li|br|tr|section|article|blockquote)>/gi;
const ALL_TAGS = /<[^>]+>/g;
const SCRIPTS = /<(script|style|noscript)[\s\S]*?<\/\1>/gi;

export function htmlToText(html: string): string {
  let text = html.replace(SCRIPTS, ' ');
  text = text.replace(BLOCK_TAGS, '\n');
  text = text.replace(ALL_TAGS, ' ');
  text = text.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  text = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return text.trim();
}

// 归一化正文用于哈希去重：去空白、统一换行、去首尾
export function normalizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

export function truncateText(text: string, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

export function normalizeMarkdown(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function markdownToPlainText(content: string): string {
  return normalizeMarkdown(content)
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(?:[-+*]|\d+\.)\s+/gm, '')
    .replace(/[*_~`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveTitle(input: {
  title?: string | null;
  fileName?: string | null;
  content: string;
}): { title: string; source: ContentSource } {
  const explicit = input.title?.trim();
  if (explicit) return { title: explicit.slice(0, 200), source: 'manual' };

  const extractedSource: ContentSource = input.fileName ? 'imported' : 'fallback';
  const heading = normalizeMarkdown(input.content).match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return { title: heading.slice(0, 200), source: extractedSource };

  const fileTitle = input.fileName
    ?.split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .trim();
  if (fileTitle) return { title: fileTitle.slice(0, 200), source: 'imported' };

  const sentence = markdownToPlainText(input.content)
    .split(/[。！？.!?]/)[0]
    ?.trim()
    .replace(/[。！？.!?]+$/, '');
  return {
    title: sentence ? sentence.slice(0, 60) : '未命名知识',
    source: 'fallback',
  };
}

export function deriveSummary(content: string): string {
  const paragraph = normalizeMarkdown(content)
    .split(/\n{2,}/)
    .filter((part) => !/^#{1,6}\s+/.test(part.trim()))
    .map((part) => markdownToPlainText(part))
    .find((part) => part.length > 0);
  return paragraph ? truncateText(paragraph, 120) : '';
}

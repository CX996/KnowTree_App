import path from 'node:path';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { extractText, getDocumentProxy } from 'unpdf';
import { normalizeMarkdown } from '../lib/text.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CONTENT_CHARS = 500_000;
const MAX_PDF_PAGES = 200;
const PDF_TIMEOUT_MS = 20_000;

export type DocumentCode =
  | 'FILE_TOO_LARGE'
  | 'FILE_TYPE_UNSUPPORTED'
  | 'FILE_CORRUPT'
  | 'DOCUMENT_EMPTY'
  | 'PDF_TEXT_LAYER_MISSING';

export interface ParsedDocument {
  markdown: string;
  sourceName: string;
  sourceMime: string;
  titleFromFile: string;
}

export class DocumentImportError extends Error {
  readonly code: DocumentCode;

  constructor(code: DocumentCode, message: string) {
    super(message);
    this.name = 'DocumentImportError';
    this.code = code;
  }
}

type DocumentFormat = 'md' | 'txt' | 'html' | 'docx' | 'pdf';

const FORMAT_BY_EXTENSION: Record<string, DocumentFormat> = {
  '.md': 'md',
  '.txt': 'txt',
  '.html': 'html',
  '.htm': 'html',
  '.docx': 'docx',
  '.pdf': 'pdf',
};

const CANONICAL_MIME: Record<DocumentFormat, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  html: 'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const ALLOWED_MIMES: Record<DocumentFormat, Set<string>> = {
  md: new Set(['text/markdown', 'text/plain', 'application/octet-stream', '']),
  txt: new Set(['text/plain', 'application/octet-stream', '']),
  html: new Set(['text/html', 'application/xhtml+xml', 'text/plain', 'application/octet-stream', '']),
  docx: new Set([CANONICAL_MIME.docx, 'application/octet-stream', '']),
  pdf: new Set(['application/pdf', 'application/octet-stream', '']),
};

function sanitizeSourceName(fileName: string): string {
  const base = path.basename(fileName.replace(/\\/g, '/')).trim();
  return base.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 200) || 'document';
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function hasZipMagic(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function hasPdfMagic(bytes: Uint8Array): boolean {
  return decodeUtf8(bytes.slice(0, 5)) === '%PDF-';
}

function assertContent(markdown: string): string {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) {
    throw new DocumentImportError('DOCUMENT_EMPTY', '文档中没有可导入的文字');
  }
  if (normalized.length > MAX_CONTENT_CHARS) {
    throw new DocumentImportError('FILE_TOO_LARGE', '解析后的正文超过 500,000 字符');
  }
  return normalized;
}

function createTurndownService(): TurndownService {
  return new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  if (!hasPdfMagic(bytes)) {
    throw new DocumentImportError('FILE_CORRUPT', 'PDF 文件头无效');
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new DocumentImportError('FILE_TOO_LARGE', 'PDF 页数超过 200 页');
    }

    const text = await Promise.race([
      extractText(pdf, { mergePages: true }).then((result) => result.text),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PDF_TIMEOUT')), PDF_TIMEOUT_MS);
      }),
    ]);

    const normalized = normalizeMarkdown(text);
    if (normalized.replace(/\s+/g, '').length < 20) {
      throw new DocumentImportError(
        'PDF_TEXT_LAYER_MISSING',
        '这个 PDF 没有可提取的文字层，当前暂不支持扫描件 OCR',
      );
    }
    return normalized;
  } catch (error) {
    if (error instanceof DocumentImportError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[document-import] PDF parse failed:', error);
    if (message === 'PDF_TIMEOUT') {
      throw new DocumentImportError('FILE_CORRUPT', 'PDF 解析超时，请换一个文件重试');
    }
    throw new DocumentImportError('FILE_CORRUPT', 'PDF 无法解析，文件可能已损坏');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function parseDocument(input: {
  fileName: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<ParsedDocument> {
  if (input.bytes.byteLength > MAX_FILE_BYTES) {
    throw new DocumentImportError('FILE_TOO_LARGE', '文件超过 10 MB 限制');
  }

  const sourceName = sanitizeSourceName(input.fileName);
  const extension = path.extname(sourceName).toLowerCase();
  const format = FORMAT_BY_EXTENSION[extension];
  if (!format) {
    throw new DocumentImportError(
      'FILE_TYPE_UNSUPPORTED',
      '仅支持 Markdown、TXT、HTML、DOCX 和文本型 PDF',
    );
  }

  const mime = input.mime.trim().toLowerCase();
  if (!ALLOWED_MIMES[format].has(mime)) {
    throw new DocumentImportError('FILE_TYPE_UNSUPPORTED', '文件类型与扩展名不匹配');
  }

  let markdown: string;
  if (format === 'pdf') {
    markdown = await extractPdf(input.bytes);
  } else if (format === 'docx') {
    if (!hasZipMagic(input.bytes)) {
      throw new DocumentImportError('FILE_CORRUPT', 'DOCX 文件头无效');
    }
    try {
      const result = await mammoth.convertToHtml({ buffer: Buffer.from(input.bytes) });
      markdown = createTurndownService().turndown(result.value);
    } catch {
      throw new DocumentImportError('FILE_CORRUPT', 'DOCX 无法解析，文件可能已损坏');
    }
  } else {
    const text = decodeUtf8(input.bytes);
    markdown = format === 'html' ? createTurndownService().turndown(text) : text;
  }

  return {
    markdown: assertContent(markdown),
    sourceName,
    sourceMime: CANONICAL_MIME[format],
    titleFromFile: sourceName.replace(/\.[^.]+$/, ''),
  };
}

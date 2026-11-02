import assert from 'node:assert/strict';
import test from 'node:test';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { DocumentImportError, parseDocument } from '../src/services/document-import.js';

test('parses markdown as markdown', async () => {
  const result = await parseDocument({
    fileName: 'notes.md',
    mime: 'text/markdown',
    bytes: Buffer.from('# 标题\n\n正文'),
  });

  assert.match(result.markdown, /^# 标题/);
  assert.equal(result.titleFromFile, 'notes');
});

test('converts html to markdown', async () => {
  const result = await parseDocument({
    fileName: 'page.html',
    mime: 'text/html',
    bytes: Buffer.from('<h1>标题</h1><p>正文</p>'),
  });

  assert.match(result.markdown, /# 标题/);
  assert.match(result.markdown, /正文/);
});

test('extracts docx text', async () => {
  const doc = new Document({
    sections: [{ children: [new Paragraph({ children: [new TextRun('DOCX 正文')] })] }],
  });
  const bytes = await Packer.toBuffer(doc);
  const result = await parseDocument({
    fileName: 'report.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes,
  });

  assert.match(result.markdown, /DOCX 正文/);
});

test('extracts text-layer pdf', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('PDF body text for KnowTree import', { x: 40, y: 700, font, size: 12 });

  const result = await parseDocument({
    fileName: 'report.pdf',
    mime: 'application/pdf',
    bytes: await pdf.save(),
  });

  assert.match(result.markdown, /PDF body text for KnowTree import/);
});

test('reports scanned pdf without text layer', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();

  await assert.rejects(
    parseDocument({ fileName: 'scan.pdf', mime: 'application/pdf', bytes: await pdf.save() }),
    (error: unknown) =>
      error instanceof DocumentImportError && error.code === 'PDF_TEXT_LAYER_MISSING',
  );
});

test('rejects mismatched pdf magic bytes', async () => {
  await assert.rejects(
    parseDocument({
      fileName: 'fake.pdf',
      mime: 'application/pdf',
      bytes: Buffer.from('not a pdf'),
    }),
    (error: unknown) => error instanceof DocumentImportError && error.code === 'FILE_CORRUPT',
  );
});

test('rejects unsupported and oversized files', async () => {
  await assert.rejects(
    parseDocument({ fileName: 'image.png', mime: 'image/png', bytes: Buffer.from('png') }),
    (error: unknown) =>
      error instanceof DocumentImportError && error.code === 'FILE_TYPE_UNSUPPORTED',
  );

  await assert.rejects(
    parseDocument({
      fileName: 'large.txt',
      mime: 'text/plain',
      bytes: new Uint8Array(10 * 1024 * 1024 + 1),
    }),
    (error: unknown) => error instanceof DocumentImportError && error.code === 'FILE_TOO_LARGE',
  );
});

test('uses only the base filename for display', async () => {
  const result = await parseDocument({
    fileName: '..\\private\\notes.md',
    mime: 'text/markdown',
    bytes: Buffer.from('正文'),
  });

  assert.equal(result.titleFromFile, 'notes');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveSummary,
  deriveTitle,
  markdownToPlainText,
  normalizeMarkdown,
} from '../src/lib/text.js';

test('normalizeMarkdown preserves structure and limits blank lines', () => {
  assert.equal(normalizeMarkdown('\uFEFF# 标题\r\n\r\n\r\n正文  '), '# 标题\n\n正文');
});

test('markdownToPlainText ignores formatting differences', () => {
  assert.equal(
    markdownToPlainText('# 标题\n\n**重点** [链接](https://example.com)'),
    '标题 重点 链接',
  );
});

test('deriveTitle uses heading before filename and first sentence', () => {
  assert.deepEqual(
    deriveTitle({ fileName: 'notes.md', content: '# 强化学习\n\nPPO 训练记录。' }),
    { title: '强化学习', source: 'imported' },
  );
});

test('deriveTitle uses filename when content has no heading', () => {
  assert.deepEqual(
    deriveTitle({ fileName: '会议纪要.md', content: '今天讨论了下周计划。' }),
    { title: '会议纪要', source: 'imported' },
  );
});

test('deriveTitle uses first sentence as fallback', () => {
  assert.deepEqual(
    deriveTitle({ content: '这是第一句。后面还有内容。' }),
    { title: '这是第一句', source: 'fallback' },
  );
});

test('deriveTitle keeps an explicit title and marks it manual', () => {
  assert.deepEqual(
    deriveTitle({ title: '我的标题', fileName: 'notes.md', content: '# 其他标题' }),
    { title: '我的标题', source: 'manual' },
  );
});

test('deriveSummary skips headings and truncates paragraphs', () => {
  assert.equal(deriveSummary('# 标题\n\n这是摘要正文。'), '这是摘要正文。');
});

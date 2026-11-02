import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEditedEntryPatch, prepareIngestContent } from '../src/services/entries.js';
import type { Entry } from '../src/types/index.js';

const current = {
  id: 'entry-1',
  user_id: 'user-1',
  title: '旧标题',
  summary: '旧摘要',
  content: '旧正文',
  content_hash: 'old-hash',
  title_source: 'ai',
  summary_source: 'ai',
} as Entry;

test('manual entry edits mark fields and recompute content hash', () => {
  const patch = buildEditedEntryPatch({
    current,
    patch: {
      title: '新版标题',
      summary: '新版摘要',
      content: '## 新版正文\n\n内容',
    },
    hash: (content) => `hash:${content}`,
  });

  assert.equal(patch.title, '新版标题');
  assert.equal(patch.title_source, 'manual');
  assert.equal(patch.summary, '新版摘要');
  assert.equal(patch.summary_source, 'manual');
  assert.equal(patch.content, '## 新版正文\n\n内容');
  assert.equal(patch.content_hash, 'hash:## 新版正文\n\n内容');
});

test('manual edits do not rewrite untouched fields', () => {
  const patch = buildEditedEntryPatch({
    current,
    patch: { title: '仅改标题' },
    hash: () => 'unused',
  });

  assert.deepEqual(patch, {
    title: '仅改标题',
    title_source: 'manual',
    updated_at: patch.updated_at,
  });
  assert.equal(typeof patch.updated_at, 'string');
});

test('clearing a summary keeps manual ownership', () => {
  const patch = buildEditedEntryPatch({
    current,
    patch: { summary: null },
    hash: () => 'unused',
  });

  assert.equal(patch.summary, null);
  assert.equal(patch.summary_source, 'manual');
});

test('ingest preserves markdown and derives file metadata', () => {
  const prepared = prepareIngestContent({
    title: '',
    content: '# 导入标题\n\n正文内容。',
    sourceName: 'notes.md',
    sourceMime: 'text/markdown',
    captureType: 'file',
  });

  assert.equal(prepared.title, '导入标题');
  assert.equal(prepared.titleSource, 'imported');
  assert.equal(prepared.summary, '正文内容。');
  assert.equal(prepared.summarySource, 'fallback');
  assert.equal(prepared.content, '# 导入标题\n\n正文内容。');
  assert.match(prepared.contentHash, /^[a-f0-9]{64}$/);
});

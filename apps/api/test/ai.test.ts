import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyContent, embedText, enrichContent, isAiConfigured } from '../src/services/ai.js';

test('AI classification degrades deterministically when no provider is configured', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    assert.equal(isAiConfigured(), false);
    const result = await classifyContent({
      title: 'PPO 训练笔记',
      content: '记录强化学习中的重要性采样、优势函数和训练稳定性。',
      categories: [
        { id: '1', name: '技术' },
        { id: '2', name: '阅读' },
      ],
    });

    assert.equal(result.name, '技术');
    assert.ok(result.summary?.includes('强化学习'));
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.equal(await embedText('语义搜索'), null);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('AI classification respects an explicitly matched category name', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const result = await classifyContent({
      title: '周末读书',
      content: '一本关于城市历史的书。',
      categories: [
        { id: '1', name: '技术' },
        { id: '2', name: '阅读' },
      ],
    });

    assert.equal(result.name, '阅读');
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('AI enrichment falls back without a provider', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_CHAT_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_CHAT_MODEL;

  try {
    const result = await enrichContent({
      title: '',
      content: '# PPO 训练\n\n记录强化学习的稳定性。',
      categories: [{ id: '1', name: '技术' }],
      allowTitle: true,
      allowSummary: true,
      allowClassification: true,
    });

    assert.equal(result.mode, 'fallback');
    assert.equal(result.title, 'PPO 训练');
    assert.equal(result.category, '技术');
    assert.match(result.summary ?? '', /强化学习/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_CHAT_MODEL;
    else process.env.OPENAI_CHAT_MODEL = previousModel;
  }
});

test('AI enrichment parses one structured response', async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_CHAT_MODEL;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_CHAT_MODEL = 'test-model';
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_CHAT_MODEL;
    else process.env.OPENAI_CHAT_MODEL = previousModel;
  });

  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          title: 'PPO 稳定性笔记',
          summary: '记录 PPO 训练中的稳定性问题。',
          category: '技术',
          confidence: 0.91,
          keywords: ['PPO', '强化学习'],
        }),
      },
    }],
  }), { status: 200 }));

  const result = await enrichContent({
    title: '未命名知识',
    content: 'PPO 训练记录',
    categories: [{ id: '1', name: '技术' }],
    allowTitle: true,
    allowSummary: true,
    allowClassification: true,
  });

  assert.equal(result.mode, 'ai');
  assert.equal(result.title, 'PPO 稳定性笔记');
  assert.deepEqual(result.keywords, ['PPO', '强化学习']);
});

test('AI enrichment honors disabled capabilities', async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_CHAT_MODEL;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_CHAT_MODEL = 'test-model';
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_CHAT_MODEL;
    else process.env.OPENAI_CHAT_MODEL = previousModel;
  });

  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          title: '不应采用',
          summary: '不应采用',
          category: '技术',
          confidence: 0.9,
          keywords: ['ignored'],
        }),
      },
    }],
  }), { status: 200 }));

  const result = await enrichContent({
    title: '手动标题',
    content: 'PPO 训练记录',
    categories: [{ id: '1', name: '技术' }],
    allowTitle: false,
    allowSummary: false,
    allowClassification: false,
  });

  assert.equal(result.title, '手动标题');
  assert.equal(result.summary, null);
  assert.equal(result.category, null);
  assert.deepEqual(result.keywords, ['ignored']);
});

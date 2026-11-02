import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyContent, embedText, isAiConfigured } from '../src/services/ai.js';

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
    assert.ok(result.summary?.includes('PPO'));
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

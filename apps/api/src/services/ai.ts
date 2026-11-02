import { truncateText } from '../lib/text.js';

export const EMBEDDING_DIM = 1024;

export interface CategorySuggestion {
  name: string;
  confidence: number;
  summary: string | null;
}

export interface ClassifyInput {
  title: string;
  content: string;
  categories: Array<{ id: string; name: string; description?: string | null }>;
}

interface ClassifyLLMResult {
  category: string | null;
  confidence: number;
  summary: string | null;
  keywords?: string[];
}

const FALLBACK_HINTS: Record<string, RegExp> = {
  技术: /技术|代码|程序|工程|算法|模型|训练|强化学习|ppo|api|数据库|架构|软件|编程/i,
  阅读: /阅读|读书|书籍|文章|作者|摘录|书评|一本|书/i,
  工作: /工作|项目|会议|需求|客户|汇报|方案|协作|管理/i,
  生活: /生活|旅行|健康|家庭|运动|饮食|日常|兴趣/i,
};

export function isAiConfigured(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim()
    && process.env.OPENAI_CHAT_MODEL?.trim(),
  );
}

function aiBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

function safeParseJson<T>(raw: string): T | null {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(normalized) as T;
  } catch {
    return null;
  }
}

function makeFallbackSummary(input: ClassifyInput): string | null {
  const content = input.content.replace(/\s+/g, ' ').trim();
  const summary = input.title && content
    ? `${input.title}：${content}`
    : input.title || content;
  return summary ? truncateText(summary, 120) : null;
}

function fallbackSuggestion(input: ClassifyInput): CategorySuggestion {
  const text = `${input.title}\n${input.content}`.slice(0, 4000);
  const named = input.categories.find((category) => text.includes(category.name));
  if (named) {
    return { name: named.name, confidence: 0.86, summary: makeFallbackSummary(input) };
  }

  for (const category of input.categories) {
    if (FALLBACK_HINTS[category.name]?.test(text)) {
      return { name: category.name, confidence: 0.8, summary: makeFallbackSummary(input) };
    }
  }

  return { name: '', confidence: 0.2, summary: makeFallbackSummary(input) };
}

async function postOpenAi(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const response = await fetch(`${aiBaseUrl()}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`AI 服务请求失败 (${response.status}): ${raw.slice(0, 300)}`);
  }
  const parsed = safeParseJson<Record<string, unknown>>(raw);
  if (!parsed) throw new Error('AI 服务返回了无法解析的 JSON');
  return parsed;
}

/** 调用 OpenAI 兼容接口归类；未配置 AI 时使用确定性的规则降级。 */
export async function classifyContent(input: ClassifyInput): Promise<CategorySuggestion> {
  if (!isAiConfigured()) return fallbackSuggestion(input);

  const categoryLines = input.categories.length > 0
    ? input.categories.map((category) => `- ${category.name}${category.description ? `：${category.description}` : ''}`).join('\n')
    : '（尚无分类，请根据内容主题新建一个分类）';
  const system = `你是一名个人知识管理助手。请阅读用户的收录内容，判断它最适合归入哪个知识分类，并给出置信度（0~1）。
已有分类如下：
${categoryLines}

规则：
- 若内容主题与某个已有分类匹配，请选择该分类名；若都不匹配，可给出一个简短的新分类名。
- confidence 表示你的把握：>=0.75 为非常肯定；0.50~0.75 为较可能；<0.50 为不确定。
- 同时给出 20~40 字以内的摘要。
- 只输出如下 JSON，不要输出其他内容：
{"category": "分类名或null", "confidence": 0.0, "summary": "摘要", "keywords": ["关键词"]}`;
  const user = `标题：${input.title || '（无标题）'}\n\n正文：\n${input.content.slice(0, 3000)}`;
  const response = await postOpenAi('chat/completions', {
    model: process.env.OPENAI_CHAT_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const choices = response.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const rawContent = choices?.[0]?.message?.content;
  if (typeof rawContent !== 'string') throw new Error('AI 归类响应缺少 message.content');
  const parsed = safeParseJson<ClassifyLLMResult>(rawContent);
  if (!parsed || typeof parsed.confidence !== 'number') {
    throw new Error(`AI 归类返回无法解析：${rawContent.slice(0, 200)}`);
  }
  return {
    name: parsed.category && parsed.category !== 'null' ? parsed.category : '',
    confidence: Math.min(Math.max(parsed.confidence, 0), 1),
    summary: parsed.summary || null,
  };
}

/** 生成文本向量；未配置 embedding 时返回 null，调用方降级为关键词能力。 */
export async function embedText(text: string): Promise<number[] | null> {
  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim();
  if (!model || !process.env.OPENAI_API_KEY?.trim()) return null;
  const response = await postOpenAi('embeddings', {
    model,
    input: text.slice(0, 8000),
    dimensions: EMBEDDING_DIM,
  });
  const data = response.data as Array<{ embedding?: unknown }> | undefined;
  const embedding = data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== 'number')) {
    throw new Error('AI embedding 返回格式无效');
  }
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`AI embedding 维度应为 ${EMBEDDING_DIM}，实际为 ${embedding.length}`);
  }
  return embedding as number[];
}

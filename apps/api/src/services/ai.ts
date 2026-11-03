import { deriveSummary, deriveTitle, truncateText } from '../lib/text.js';

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

export interface EnrichmentInput extends ClassifyInput {
  allowTitle: boolean;
  allowSummary: boolean;
  allowClassification: boolean;
}

export interface EnrichmentResult {
  title: string | null;
  summary: string | null;
  category: string | null;
  confidence: number;
  keywords: string[];
  mode: 'ai' | 'fallback';
  error: { code: AiServiceCode; message: string } | null;
}

export type AiServiceCode = 'AI_TIMEOUT' | 'AI_INVALID_RESPONSE' | 'AI_REQUEST_FAILED';

export class AiServiceError extends Error {
  readonly code: AiServiceCode;

  constructor(code: AiServiceCode, message: string) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
  }
}

interface EnrichmentLLMResult {
  title?: string | null;
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

function providerChatOptions(): Record<string, unknown> {
  try {
    if (new URL(aiBaseUrl()).hostname === 'api.deepseek.com') {
      return {
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
      };
    }
  } catch {
    // Invalid base URLs fail in postOpenAi with the provider's request error.
  }
  return {};
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
  let response: Response;
  try {
    response = await fetch(`${aiBaseUrl()}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AiServiceError(
      /timeout|aborted/i.test(message) ? 'AI_TIMEOUT' : 'AI_REQUEST_FAILED',
      `AI 服务请求失败: ${message}`,
    );
  }
  const raw = await response.text();
  if (!response.ok) {
    throw new AiServiceError(
      'AI_REQUEST_FAILED',
      `AI 服务请求失败 (${response.status}): ${raw.slice(0, 300)}`,
    );
  }
  const parsed = safeParseJson<Record<string, unknown>>(raw);
  if (!parsed) {
    throw new AiServiceError('AI_INVALID_RESPONSE', 'AI 服务返回了无法解析的 JSON');
  }
  return parsed;
}

function fallbackEnrichment(input: EnrichmentInput): EnrichmentResult {
  const suggestion = fallbackSuggestion(input);
  const titleInput = input.title === '未命名知识' ? '' : input.title;
  const derivedTitle = deriveTitle({ title: titleInput, content: input.content }).title;
  const summary = deriveSummary(input.content);
  return {
    title: input.allowTitle ? derivedTitle : input.title || null,
    summary: input.allowSummary ? summary || null : null,
    category: input.allowClassification && suggestion.name ? suggestion.name : null,
    confidence: input.allowClassification ? suggestion.confidence : 0,
    keywords: [],
    mode: 'fallback',
    error: null,
  };
}

/** 调用一次 OpenAI 兼容接口生成标题、摘要、分类和关键词。 */
export async function enrichContent(input: EnrichmentInput): Promise<EnrichmentResult> {
  if (!isAiConfigured()) return fallbackEnrichment(input);

  try {
    const categoryLines = input.categories.length > 0
      ? input.categories.map((category) => `- ${category.name}${category.description ? `：${category.description}` : ''}`).join('\n')
      : '（尚无分类，请根据内容主题新建一个分类）';
    const system = `你是一名个人知识管理助手。请阅读用户的收录内容，并输出结构化整理结果。
已有分类如下：
${categoryLines}

规则：
- 标题应简洁、具体，不超过 40 字；${input.allowTitle ? '请生成标题。' : '不要生成新标题，title 返回 null。'}
- ${input.allowSummary ? '摘要应为 20~80 字。' : '不要生成摘要，summary 返回 null。'}
- ${input.allowClassification ? '选择最匹配的分类；都不匹配时可给出简短的新分类名。' : '不要分类，category 返回 null。'}
- confidence 表示分类把握，范围 0~1。
- keywords 返回 2~6 个短关键词。
- 只输出如下 JSON，不要输出其他内容：
{"title": "标题或null", "category": "分类名或null", "confidence": 0.0, "summary": "摘要或null", "keywords": ["关键词"]}`;
    const user = `标题：${input.title || '（无标题）'}\n\n正文：\n${input.content.slice(0, 6000)}`;
    const response = await postOpenAi('chat/completions', {
      model: process.env.OPENAI_CHAT_MODEL,
      temperature: 0.2,
      ...providerChatOptions(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const choices = response.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const rawContent = choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string') {
      throw new AiServiceError('AI_INVALID_RESPONSE', 'AI 整理响应缺少 message.content');
    }
    const parsed = safeParseJson<EnrichmentLLMResult>(rawContent);
    if (!parsed || typeof parsed.confidence !== 'number') {
      throw new AiServiceError(
        'AI_INVALID_RESPONSE',
        `AI 整理返回无法解析：${rawContent.slice(0, 200)}`,
      );
    }

    return {
      title: input.allowTitle && typeof parsed.title === 'string'
        ? parsed.title.trim().slice(0, 200) || null
        : input.title || null,
      summary: input.allowSummary && typeof parsed.summary === 'string'
        ? parsed.summary.trim().slice(0, 300) || null
        : null,
      category: input.allowClassification
        && typeof parsed.category === 'string'
        && parsed.category !== 'null'
        ? parsed.category.trim()
        : null,
      confidence: input.allowClassification ? Math.min(Math.max(parsed.confidence, 0), 1) : 0,
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((keyword): keyword is string => typeof keyword === 'string').slice(0, 6)
        : [],
      mode: 'ai',
      error: null,
    };
  } catch (error) {
    const aiError = error instanceof AiServiceError
      ? error
      : new AiServiceError('AI_REQUEST_FAILED', error instanceof Error ? error.message : String(error));
    return {
      ...fallbackEnrichment(input),
      error: { code: aiError.code, message: aiError.message },
    };
  }
}

/** 兼容旧调用方：只返回分类与摘要。 */
export async function classifyContent(input: ClassifyInput): Promise<CategorySuggestion> {
  const result = await enrichContent({
    ...input,
    allowTitle: false,
    allowSummary: true,
    allowClassification: true,
  });
  return {
    name: result.category ?? '',
    confidence: result.confidence,
    summary: result.summary,
  };
}

export async function testAiConnection(): Promise<{
  ok: boolean;
  latencyMs: number | null;
  message: string;
}> {
  if (!isAiConfigured()) {
    return { ok: false, latencyMs: null, message: 'AI 尚未配置，当前使用规则降级' };
  }
  const started = Date.now();
  const result = await enrichContent({
    title: '连接测试',
    content: '这是一次连接测试，请返回结构化整理结果。',
    categories: [],
    allowTitle: true,
    allowSummary: true,
    allowClassification: false,
  });
  return {
    ok: !result.error,
    latencyMs: Date.now() - started,
    message: result.error?.message ?? 'AI 连接正常',
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

import { LLMClient, Config, HeaderUtils, EmbeddingClient, APIError } from 'coze-coding-dev-sdk';
import { loadEnv } from '../storage/database/supabase-client';

// 确保环境变量（COZE 相关 token、Supabase 凭证）已从 workload identity 载入 process.env
loadEnv();

export const EMBEDDING_DIM = 1024;
export const DEFAULT_LLM_MODEL = 'doubao-seed-2-0-pro-260215';
export const DEFAULT_EMBED_MODEL = 'doubao-embedding-vision-251215';

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

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 调用 LLM 对一条知识进行分类，返回结构化建议（分数 0-1） */
export async function classifyContent(input: ClassifyInput, forwardHeaders?: Record<string, string>): Promise<CategorySuggestion> {
  const config = new Config({ timeout: 60000 });
  const customHeaders = forwardHeaders ? HeaderUtils.extractForwardHeaders(forwardHeaders as any) : undefined;
  const client = new LLMClient(config, customHeaders);

  const categoryLines =
    input.categories.length > 0
      ? input.categories.map((c) => `- ${c.name}${c.description ? `：${c.description}` : ''}`).join('\n')
      : '（尚无分类，请根据内容主题新建一个分类）';

  const system = `你是一名个人知识管理助手。请阅读用户的收录内容，判断它最适合归入哪个知识分类，并给出置信度（0~1）。
已有分类如下：
${categoryLines}

规则：
- 若内容主题与某个已有分类匹配，请选择该分类名；若都不匹配，可给出一个简短的新分类名。
- confidence 表示你的把握：>=0.75 为非常肯定；0.50~0.75 为较可能；<0.50 为不确定。
- 同时给出 20~40 字以内的摘要。
- 只输出如下 JSON，不要输出其他内容：
{"category": "分类名或null", "confidence": 0.0~1.0, "summary": "摘要", "keywords": ["关键词"]}`;

  const user = `标题：${input.title || '（无标题）'}\n\n正文：\n${input.content.slice(0, 3000)}`;

  // 结构化归类需要完整结果，使用非流式 invoke
  const response = await client.invoke(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { model: DEFAULT_LLM_MODEL, temperature: 0.2, thinking: 'disabled' },
  );

  const parsed = safeParseJson<ClassifyLLMResult>(response.content);
  if (!parsed || typeof parsed.confidence !== 'number') {
    throw new Error(`AI 归类返回无法解析：${response.content.slice(0, 200)}`);
  }
  const confidence = Math.min(Math.max(parsed.confidence, 0), 1);
  return {
    name: parsed.category && parsed.category !== 'null' ? parsed.category : '',
    confidence,
    summary: parsed.summary || null,
  };
}

/** 生成文本向量（向量入库与检索共用） */
export async function embedText(text: string, forwardHeaders?: Record<string, string>): Promise<number[]> {
  const config = new Config({ timeout: 60000 });
  const customHeaders = forwardHeaders ? HeaderUtils.extractForwardHeaders(forwardHeaders as any) : undefined;
  const client = new EmbeddingClient(config, customHeaders);
  try {
    const embedding = await client.embedText(text.slice(0, 8000), { dimensions: EMBEDDING_DIM });
    return embedding as number[];
  } catch (e) {
    if (e instanceof APIError) {
      throw new Error(`向量化失败: ${e.message}`);
    }
    throw e;
  }
}

export { APIError };
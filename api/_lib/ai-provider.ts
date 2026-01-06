/**
 * Shared AI provider module with automatic fallback support.
 * Tries providers in order until one succeeds.
 */

export interface AIConfig {
  openaiKey?: string;
  geminiKey?: string;
  deepseekKey?: string;
  preferredProvider?: string;
  geminiModel?: string;
  deepseekModel?: string;
}

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
  provider: string;
}

type ProviderFn = (config: AIConfig, request: AIRequest) => Promise<AIResponse>;

async function callOpenAI(config: AIConfig, request: AIRequest): Promise<AIResponse> {
  if (!config.openaiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  console.log('[ai-provider] Trying OpenAI...');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.log('[ai-provider] OpenAI failed:', resp.status, errText);
    throw new Error(`OpenAI error ${resp.status}: ${errText}`);
  }
  const data: any = await resp.json();
  const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
  const tokensUsed = data?.usage?.total_tokens ?? 0;
  console.log('[ai-provider] OpenAI success, tokens:', tokensUsed);
  return { content, tokensUsed, provider: 'openai' };
}

async function callGemini(config: AIConfig, request: AIRequest): Promise<AIResponse> {
  if (!config.geminiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  const model = config.geminiModel || 'gemini-1.5-flash-latest';
  console.log('[ai-provider] Trying Gemini, model:', model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${request.systemPrompt}\n\n${request.userPrompt}` }] }],
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens,
      },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.log('[ai-provider] Gemini failed:', resp.status, errText);
    throw new Error(`Gemini error ${resp.status}: ${errText}`);
  }
  const data: any = await resp.json();
  const parts: string[] = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p?.text || '')
    .filter((t: string) => t);
  const content = parts.join('\n\n').trim();
  const tokensUsed = data?.usageMetadata?.totalTokenCount ?? 0;
  console.log('[ai-provider] Gemini success, tokens:', tokensUsed);
  return { content, tokensUsed, provider: 'gemini' };
}

async function callDeepSeek(config: AIConfig, request: AIRequest): Promise<AIResponse> {
  if (!config.deepseekKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }
  const model = config.deepseekModel || 'deepseek-chat';
  console.log('[ai-provider] Trying DeepSeek, model:', model);
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.deepseekKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.log('[ai-provider] DeepSeek failed:', resp.status, errText);
    throw new Error(`DeepSeek error ${resp.status}: ${errText}`);
  }
  const data: any = await resp.json();
  const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
  const tokensUsed = data?.usage?.total_tokens ?? 0;
  console.log('[ai-provider] DeepSeek success, tokens:', tokensUsed);
  return { content, tokensUsed, provider: 'deepseek' };
}

const PROVIDERS: Record<string, ProviderFn> = {
  openai: callOpenAI,
  gemini: callGemini,
  deepseek: callDeepSeek,
};

/**
 * Calls AI with automatic fallback.
 * Order: preferred provider first, then others with configured keys.
 */
export async function callAI(config: AIConfig, request: AIRequest): Promise<AIResponse> {
  const preferred = (config.preferredProvider || 'deepseek').toLowerCase();
  // Order by cost: deepseek (cheapest) → gemini (free tier) → openai (most expensive)
  const costOrder = ['gemini', 'deepseek', 'openai'];
  const availableProviders: string[] = costOrder.filter((p) => {
    if (p === 'gemini') return !!config.geminiKey;
    if (p === 'deepseek') return !!config.deepseekKey;
    if (p === 'openai') return !!config.openaiKey;
    return false;
  });
  if (availableProviders.length === 0) {
    throw new Error('No AI provider configured. Set at least one API key.');
  }
  // Put preferred first, then others in cost order
  const orderedProviders = [
    preferred,
    ...availableProviders.filter((p) => p !== preferred),
  ].filter((p) => availableProviders.includes(p));
  console.log('[ai-provider] Available providers:', availableProviders);
  console.log('[ai-provider] Will try in order:', orderedProviders);
  const errors: string[] = [];
  for (const providerName of orderedProviders) {
    const providerFn = PROVIDERS[providerName];
    if (!providerFn) continue;
    try {
      return await providerFn(config, request);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.log(`[ai-provider] ${providerName} failed:`, msg);
      errors.push(`${providerName}: ${msg}`);
    }
  }
  throw new Error(`All AI providers failed:\n${errors.join('\n')}`);
}

/**
 * Creates AIConfig from environment variables.
 */
export function configFromEnv(): AIConfig {
  return {
    geminiKey: process.env.GEMINI_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
    deepseekKey: process.env.DEEPSEEK_API_KEY,
    preferredProvider: process.env.AI_PROVIDER || 'openai',
    geminiModel: process.env.GEMINI_MODEL,
    deepseekModel: process.env.DEEPSEEK_MODEL,
  };
}

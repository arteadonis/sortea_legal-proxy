import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callAI, configFromEnv } from './_lib/ai-provider';

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

interface CaptionRequest {
  type: 'announceWinner' | 'announceGiveaway';
  tone: 'excited' | 'professional' | 'fun';
  language: string;
  postCaption?: string;
  postUsername?: string;
  totalComments?: number;
  winners?: string[];
  alternates?: string[];
  prizeName?: string;
  rules?: string[];
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const config = configFromEnv();
  console.log('[generate-caption] Preferred provider:', config.preferredProvider);
  console.log('[generate-caption] OpenAI key configured:', !!config.openaiKey);
  console.log('[generate-caption] Gemini key configured:', !!config.geminiKey);
  console.log('[generate-caption] DeepSeek key configured:', !!config.deepseekKey);

  try {
    const body: CaptionRequest = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('[generate-caption] Request body:', JSON.stringify(body));
    const { type, tone, language, postUsername, winners = [], alternates = [], prizeName, rules = [] } = body;

    if (!type || !tone || !language) {
      res.status(400).json({ error: 'Missing required fields: type, tone, language' });
      return;
    }

    const toneDescriptions: Record<string, string> = {
      excited: 'entusiasta, con emojis celebratorios y tono muy alegre',
      professional: 'profesional, formal y conciso',
      fun: 'muy divertido, casual y amigable con emojis creativos',
    };

    const languageNames: Record<string, string> = {
      es: 'español',
      en: 'English',
      pt: 'português',
    };

    let prompt: string;
    if (type === 'announceWinner') {
      const winnersList = winners.map((w, i) => `${i + 1}. @${w}`).join('\n');
      const alternatesList = alternates.length > 0 
        ? `\nSuplentes:\n${alternates.map((a, i) => `${i + 1}. @${a}`).join('\n')}`
        : '';
      
      prompt = `
Genera un caption de Instagram para anunciar el/los ganador(es) de un sorteo.

Datos:
- Ganadores:\n${winnersList}${alternatesList}
- Organizador: ${postUsername ? `@${postUsername}` : 'no especificado'}
- Premio: ${prizeName || 'no especificado'}

Requisitos:
- Idioma: ${languageNames[language] || language}
- Tono: ${toneDescriptions[tone] || tone}
- Incluir felicitaciones al/los ganador(es)
- Mencionar que deben contactar por DM para reclamar el premio
- Agradecer a todos los participantes
- Usar emojis apropiados al tono
- Máximo 280 caracteres para que sea fácil de leer
- No usar hashtags

Devuelve SOLO el caption, sin explicaciones.
`;
    } else {
      const rulesText = rules.length > 0
        ? `\nReglas para participar:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : '';
      
      prompt = `
Genera un caption de Instagram para anunciar un nuevo sorteo.

Datos:
- Organizador: ${postUsername ? `@${postUsername}` : 'no especificado'}
- Premio: ${prizeName || 'no especificado'}${rulesText}

Requisitos:
- Idioma: ${languageNames[language] || language}
- Tono: ${toneDescriptions[tone] || tone}
- Generar entusiasmo para participar${rules.length > 0 ? '\n- Incluir las reglas de participación de forma clara y atractiva' : '\n- Mencionar que revisen las bases en la publicación'}
- Usar emojis apropiados al tono
- Máximo 400 caracteres${rules.length > 0 ? ' (puede ser más largo si hay varias reglas)' : ''}
- No usar hashtags

Devuelve SOLO el caption, sin explicaciones.
`;
    }

    console.log('[generate-caption] Prompt built, length:', prompt.length);

    const result = await callAI(config, {
      systemPrompt: 'Eres un experto en marketing de redes sociales que crea captions atractivos y concisos.',
      userPrompt: prompt,
      temperature: 0.7,
      maxTokens: 200,
    });

    console.log('[generate-caption] Success! Provider used:', result.provider, 'Caption length:', result.content.length);
    res.status(200).json({ caption: result.content, tokensUsed: result.tokensUsed, provider: result.provider });
  } catch (e: any) {
    console.error('[generate-caption] Unhandled error:', e);
    res.status(500).json({ error: 'Unhandled error', details: e?.message ?? String(e) });
  }
}

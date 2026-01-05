import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  const openaiKey: string | undefined = process.env.OPENAI_API_KEY;
  const geminiKey: string | undefined = process.env.GEMINI_API_KEY;
  const deepseekKey: string | undefined = process.env.DEEPSEEK_API_KEY;

  console.log('[generate-caption] Provider:', provider);
  console.log('[generate-caption] OpenAI key configured:', !!openaiKey);
  console.log('[generate-caption] Gemini key configured:', !!geminiKey);
  console.log('[generate-caption] DeepSeek key configured:', !!deepseekKey);

  // Check if the required API key is configured
  if (provider === 'openai' && !openaiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured in Vercel environment' });
    return;
  }
  if (provider === 'gemini' && !geminiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel environment' });
    return;
  }
  if (provider === 'deepseek' && !deepseekKey) {
    res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured in Vercel environment' });
    return;
  }

  try {
    const body: CaptionRequest = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('[generate-caption] Request body:', JSON.stringify(body));
    const { type, tone, language, postUsername, winners = [], alternates = [], prizeName } = body;

    if (!type || !tone || !language) {
      res.status(400).json({ error: 'Missing required fields: type, tone, language' });
      return;
    }

    const toneDescriptions: Record<string, string> = {
      excited: 'entusiasta, con emojis celebratorios y tono alegre',
      professional: 'profesional, formal y conciso',
      fun: 'divertido, casual y amigable con emojis creativos',
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
      prompt = `
Genera un caption de Instagram para anunciar un nuevo sorteo.

Datos:
- Organizador: ${postUsername ? `@${postUsername}` : 'no especificado'}
- Premio: ${prizeName || 'no especificado'}

Requisitos:
- Idioma: ${languageNames[language] || language}
- Tono: ${toneDescriptions[tone] || tone}
- Generar entusiasmo para participar
- Mencionar que revisen las bases en la publicación
- Usar emojis apropiados al tono
- Máximo 280 caracteres
- No usar hashtags

Devuelve SOLO el caption, sin explicaciones.
`;
    }

    console.log('[generate-caption] Prompt built, length:', prompt.length);
    console.log('[generate-caption] Using provider:', provider);

    let caption: string = '';
    let tokensUsed: number = 0;

    if (provider === 'openai') {
      if (!openaiKey) {
        res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
        return;
      }
      console.log('[generate-caption] Calling OpenAI API...');
      const completionResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Eres un experto en marketing de redes sociales que crea captions atractivos y concisos.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 200,
        }),
      });
      console.log('[generate-caption] OpenAI response status:', completionResp.status);
      if (!completionResp.ok) {
        const errText = await completionResp.text();
        console.log('[generate-caption] OpenAI error:', errText);
        res.status(502).json({ error: 'OpenAI error', details: errText });
        return;
      }
      const data: any = await completionResp.json();
      caption = data?.choices?.[0]?.message?.content?.trim() ?? '';
      tokensUsed = data?.usage?.total_tokens ?? 0;
      console.log('[generate-caption] OpenAI success, tokens:', tokensUsed);
    } else if (provider === 'gemini') {
      if (!geminiKey) {
        res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
        return;
      }
      const model = (process.env.AI_PROVIDER || 'openai').toLowerCase();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      console.log('[generate-caption] Calling Gemini API, model:', model);
      console.log('[generate-caption] Prompt length:', prompt.length);
      const gemResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
        }),
      });
      console.log('[generate-caption] Gemini response status:', gemResp.status);
      if (!gemResp.ok) {
        const errText = await gemResp.text();
        console.log('[generate-caption] Gemini error:', errText);
        res.status(502).json({ error: 'Gemini error', details: errText });
        return;
      }
      const data: any = await gemResp.json();
      const parts: string[] = (data?.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p?.text || '')
        .filter((t: string) => t);
      caption = parts.join('\n\n').trim();
      tokensUsed = data?.usageMetadata?.totalTokenCount ?? 0;
      console.log('[generate-caption] Gemini success, tokens:', tokensUsed);
    } else if (provider === 'deepseek') {
      if (!deepseekKey) {
        res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured' });
        return;
      }
      const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      const dsResp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deepseekKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Eres un experto en marketing de redes sociales que crea captions atractivos y concisos.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 200,
        }),
      });
      if (!dsResp.ok) {
        const errText = await dsResp.text();
        res.status(502).json({ error: 'DeepSeek error', details: errText });
        return;
      }
      const data: any = await dsResp.json();
      caption = data?.choices?.[0]?.message?.content?.trim() ?? '';
      tokensUsed = data?.usage?.total_tokens ?? 0;
    } else {
      res.status(400).json({ error: 'Unsupported AI_PROVIDER', provider });
      return;
    }

    console.log('[generate-caption] Success! Caption length:', caption.length);
    res.status(200).json({ caption, tokensUsed });
  } catch (e: any) {
    console.error('[generate-caption] Unhandled error:', e);
    res.status(500).json({ error: 'Unhandled error', details: e?.message ?? String(e) });
  }
}

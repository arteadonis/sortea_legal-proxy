import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callAI, configFromEnv } from './_lib/ai-provider';

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

interface AiRulesResponse {
  winnersCount?: number | null;
  mentionsRequired?: number | null;
  mustComment?: boolean;
  mustLike?: boolean;
  mustFollow?: boolean;
  hashtags?: string[];
  deadline?: string | null;
}

function extractFirstJson(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
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

  try {
    const body: any = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const caption: string = String(body?.caption || '').trim();
    if (!caption) {
      res.status(400).json({ error: 'Missing caption' });
      return;
    }

    console.log('[extract-rules] Processing caption, length:', caption.length);

    const systemPrompt = 'Eres un asistente que extrae requisitos de participación de un sorteo en Instagram. Devuelve SOLO JSON válido.';
    const userPrompt = `
Extrae, a partir del siguiente caption, los requisitos del sorteo. Responde SOLO un JSON con este esquema y sin texto adicional:
{
  "winnersCount": number|null,         // cantidad de ganadores si se menciona
  "mentionsRequired": number|null,     // cantidad de amigos a etiquetar
  "mustComment": boolean,              // si se pide comentar
  "mustLike": boolean,                 // si se pide dar like
  "mustFollow": boolean,               // si se pide seguir la cuenta
  "hashtags": string[],                // hasta 10 hashtags detectados
  "deadline": string|null              // fecha límite en ISO-8601 si se menciona, si no null
}

Caption:
"""
${caption}
"""`;

    const config = configFromEnv();
    const aiResponse = await callAI(config, {
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    });

    console.log('[extract-rules] AI response from provider:', aiResponse.provider);

    let jsonText = aiResponse.content.trim();
    const embedded = extractFirstJson(jsonText);
    if (embedded) jsonText = embedded;

    let parsed: AiRulesResponse | null = null;
    try {
      parsed = JSON.parse(jsonText) as AiRulesResponse;
    } catch (_) {
      console.log('[extract-rules] Failed to parse JSON:', jsonText);
      res.status(502).json({ error: 'AI returned non-JSON content', content: aiResponse.content });
      return;
    }

    const out: AiRulesResponse = {
      winnersCount: parsed?.winnersCount ?? null,
      mentionsRequired: parsed?.mentionsRequired ?? null,
      mustComment: Boolean(parsed?.mustComment),
      mustLike: Boolean(parsed?.mustLike),
      mustFollow: Boolean(parsed?.mustFollow),
      hashtags: Array.isArray(parsed?.hashtags) ? (parsed?.hashtags as string[]).slice(0, 10) : [],
      deadline: typeof parsed?.deadline === 'string' && parsed?.deadline ? parsed?.deadline as string : null,
    };

    console.log('[extract-rules] Success! Extracted rules:', JSON.stringify(out));
    res.status(200).json(out);
  } catch (e: any) {
    console.error('[extract-rules] Error:', e?.message ?? String(e));
    res.status(500).json({ error: 'AI processing failed', details: e?.message ?? String(e) });
  }
}

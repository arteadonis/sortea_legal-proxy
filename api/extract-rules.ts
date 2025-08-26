// Local declaration to avoid IDE type errors without @types/node
declare const process: any;
import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  const openaiKey: string | undefined = process.env.OPENAI_API_KEY;
  const geminiKey: string | undefined = process.env.GEMINI_API_KEY;
  const deepseekKey: string | undefined = process.env.DEEPSEEK_API_KEY;

  try {
    const body: any = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const caption: string = String(body?.caption || '').trim();
    if (!caption) {
      res.status(400).json({ error: 'Missing caption' });
      return;
    }

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

    let contentText = '';

    if (provider === 'openai') {
      if (!openaiKey) {
        res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
        return;
      }
      const completionResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      });
      if (!completionResp.ok) {
        const errText = await completionResp.text();
        res.status(502).json({ error: 'OpenAI error', details: errText });
        return;
      }
      const data: any = await completionResp.json();
      contentText = data?.choices?.[0]?.message?.content ?? '';
    } else if (provider === 'gemini') {
      if (!geminiKey) {
        res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
        return;
      }
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const gemResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
          ],
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!gemResp.ok) {
        const errText = await gemResp.text();
        res.status(502).json({ error: 'Gemini error', details: errText });
        return;
      }
      const data: any = await gemResp.json();
      const parts: string[] = (data?.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p?.text || '')
        .filter((t: string) => t);
      contentText = parts.join('\n');
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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        }),
      });
      if (!dsResp.ok) {
        const errText = await dsResp.text();
        res.status(502).json({ error: 'DeepSeek error', details: errText });
        return;
      }
      const data: any = await dsResp.json();
      contentText = data?.choices?.[0]?.message?.content ?? '';
    } else {
      res.status(400).json({ error: 'Unsupported AI_PROVIDER', provider });
      return;
    }

    let jsonText = contentText.trim();
    const embedded = extractFirstJson(jsonText);
    if (embedded) jsonText = embedded;

    let parsed: AiRulesResponse | null = null;
    try {
      parsed = JSON.parse(jsonText) as AiRulesResponse;
    } catch (_) {
      res.status(502).json({ error: 'AI returned non-JSON content', content: contentText });
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

    res.status(200).json(out);
  } catch (e: any) {
    res.status(500).json({ error: 'Unhandled error', details: e?.message ?? String(e) });
  }
}

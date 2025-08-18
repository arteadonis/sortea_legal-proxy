import type { VercelRequest, VercelResponse } from '@vercel/node';

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
    const form: Record<string, string> = (body?.form ?? {}) as Record<string, string>;
    const title: string = form.title ?? '';
    const prize: string = form.prize ?? '';
    const requirements: string = form.requirements ?? '';
    const startDate: string = form.startDate ?? '';
    const endDate: string = form.endDate ?? '';
    const jurisdiction: string = form.jurisdiction ?? '';

    if (!title || !prize || !requirements || !startDate || !endDate || !jurisdiction) {
      res.status(400).json({ error: 'Missing required fields in form' });
      return;
    }

    const prompt: string = `
Genera un borrador de "Bases y Condiciones" en español para un sorteo en Instagram.
Incluye secciones típicas (Organizador, Vigencia, Participación, Premios, Selección, Notificación, Entrega, Responsabilidad, Protección de datos, Jurisdicción).
Usa tono claro, estructurado en markdown.

Datos:
- Título del sorteo: ${title}
- Premio: ${prize}
- Requisitos de participación: ${requirements}
- Vigencia: desde ${startDate} hasta ${endDate}
- Jurisdicción principal: ${jurisdiction}

Agregar un breve disclaimer final: "Este borrador es orientativo y debe ser revisado por un profesional legal antes de su publicación."
Devuelve solo markdown del cuerpo, sin explicaciones adicionales.
`;

    let md: string = '';

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
            { role: 'system', content: 'Eres un asistente legal que redacta borradores claros y concisos en español.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
        }),
      });
      if (!completionResp.ok) {
        const errText = await completionResp.text();
        res.status(502).json({ error: 'OpenAI error', details: errText });
        return;
      }
      const data: any = await completionResp.json();
      md = data?.choices?.[0]?.message?.content ?? '# Términos y Condiciones\n\n(No se recibió contenido)';
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
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: { temperature: 0.5 },
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
      md = parts.join('\n\n') || '# Términos y Condiciones\n\n(No se recibió contenido)';
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
            { role: 'system', content: 'Eres un asistente legal que redacta borradores claros y concisos en español.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
        }),
      });
      if (!dsResp.ok) {
        const errText = await dsResp.text();
        res.status(502).json({ error: 'DeepSeek error', details: errText });
        return;
      }
      const data: any = await dsResp.json();
      md = data?.choices?.[0]?.message?.content ?? '# Términos y Condiciones\n\n(No se recibió contenido)';
    } else {
      res.status(400).json({ error: 'Unsupported AI_PROVIDER', provider });
      return;
    }

    res.status(200).json({ title, body: md });
  } catch (e: any) {
    res.status(500).json({ error: 'Unhandled error', details: e?.message ?? String(e) });
  }
}

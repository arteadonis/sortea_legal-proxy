import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callAI, configFromEnv } from './_lib/ai-provider';

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

  const config = configFromEnv();
  console.log('[generate] Preferred provider:', config.preferredProvider);
  console.log('[generate] OpenAI key configured:', !!config.openaiKey);
  console.log('[generate] Gemini key configured:', !!config.geminiKey);
  console.log('[generate] DeepSeek key configured:', !!config.deepseekKey);

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
- Título: ${title}
- Premio: ${prize}
- Requisitos de participación: ${requirements}
- Vigencia: desde ${startDate} hasta ${endDate}
- Jurisdicción principal: ${jurisdiction}

Agregar un breve disclaimer final: "Este borrador es orientativo y debe ser revisado por un profesional legal antes de su publicación."
Devuelve solo markdown del cuerpo, sin explicaciones adicionales.
`;

    const result = await callAI(config, {
      systemPrompt: 'Eres un asistente legal que redacta borradores claros y concisos en español.',
      userPrompt: prompt,
      temperature: 0.5,
    });

    console.log('[generate] Success! Provider used:', result.provider);
    res.status(200).json({ title, body: result.content, provider: result.provider });
  } catch (e: any) {
    res.status(500).json({ error: 'Unhandled error', details: e?.message ?? String(e) });
  }
}

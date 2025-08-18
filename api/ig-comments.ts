import type { VercelRequest, VercelResponse } from '@vercel/node';

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

interface IgItem {
  id?: string;
  ownerUsername?: string;
  text?: string;
  timestamp?: string | number;
  createdAt?: string;
  takenAt?: string | number;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const postUrl = String(req.query.url || '').trim();
  if (!postUrl) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  const token = process.env.APIFY_TOKEN;
  const actor = (process.env.APIFY_ACTOR || '').trim();
  const taskId = (process.env.APIFY_TASK_ID || '').trim();
  if (!token) {
    res.status(500).json({ error: 'APIFY_TOKEN is not configured' });
    return;
  }
  if (!actor && !taskId) {
    res.status(500).json({ error: 'APIFY_ACTOR or APIFY_TASK_ID is required' });
    return;
  }

  try {
    // Run Instagram Post Comments Scraper and wait for completion
    const runUrl = taskId
      ? `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}/runs?token=${token}&waitForFinish=50`
      : `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs?token=${token}&waitForFinish=50`;
    const runResp = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: [postUrl],
        postUrls: [postUrl],
        resultsLimit: 300,
        proxy: { useApifyProxy: true },
      }),
    });
    if (!runResp.ok) {
      const errText = await runResp.text();
      console.error('Apify run error:', errText);
      res.status(502).json({ error: 'Apify run error', details: errText });
      return;
    }
    const runData: any = await runResp.json();
    const datasetId: string | undefined = runData?.data?.defaultDatasetId;
    if (!datasetId) {
      res.status(502).json({ error: 'No dataset id from Apify run' });
      return;
    }

    const itemsResp = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&format=json`);
    if (!itemsResp.ok) {
      const errText = await itemsResp.text();
      console.error('Apify items error:', errText);
      res.status(502).json({ error: 'Apify items error', details: errText });
      return;
    }
    const items: IgItem[] = (await itemsResp.json()) as IgItem[];

    const normalized = items.map((it) => {
      const username = it.ownerUsername || '';
      const text = it.text || '';
      const id = String(it.id || `${username}-${Math.random().toString(36).slice(2)}`);
      const tsRaw = (it.timestamp ?? it.takenAt ?? it.createdAt ?? new Date().toISOString());
      const ts = typeof tsRaw === 'number' ? new Date(tsRaw * 1000).toISOString() : String(tsRaw);
      return { id, username, text, timestamp: ts };
    });

    const first: any = (items && items.length > 0) ? items[0] : undefined;
    const caption = first?.postCaption || first?.caption || null;

    res.status(200).json({ comments: normalized, post: { caption } });
  } catch (e: any) {
    res.status(500).json({ error: 'Unhandled error', details: e?.message ?? String(e) });
  }
}

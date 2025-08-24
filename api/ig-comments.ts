// Local declaration to avoid IDE type errors without @types/node
declare const process: any;
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

  // Mock mode for development: skip Apify calls and return fake data
  const mockParam = String(req.query.mock || '').trim();
  const mockEnv = String(process.env.MOCK_IG || '').trim().toLowerCase();
  const useMock = mockParam === '1' || mockParam.toLowerCase() === 'true' || mockEnv === '1' || mockEnv === 'true';
  if (useMock) {
    const now = new Date().toISOString();
    const comments = Array.from({ length: 20 }).map((_, i) => {
      const username = `mock_user_${i + 1}`;
      return {
        id: `${i + 1}`,
        username,
        text: i % 3 === 0
          ? 'I want to win! @friend1 @friend2 #giveaway'
          : i % 3 === 1
            ? 'Participando! Gracias por el sorteo'
            : 'Me encanta este premio!!!',
        timestamp: now,
        avatarUrl: `https://unavatar.io/instagram/${username}?size=256`,
      };
    });
    const caption = 'SORTEO! 🎁 Para participar: 1) Seguir nuestra cuenta 2) Dar like 3) Comentar mencionando 2 amigos. Sorteo válido hasta el 30/09. #giveaway';
    const imageUrl = 'https://placehold.co/600x600?text=Instagram+Post';
    res.status(200).json({ comments, post: { caption, imageUrl } });
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
    const items: any[] = (await itemsResp.json()) as any[];
    const first: any = (items && items.length > 0) ? items[0] : undefined;
    const caption = first?.postCaption || first?.caption || null;
    const imageUrl = first?.imageUrl || first?.displayUrl || first?.display_url || first?.thumbnailUrl || first?.thumbnail_url || null;
    const postOwnerUsername: string | null = first?.ownerUsername || null;
    const postOwnerAvatar: string | null = first?.ownerProfilePicUrl
      || first?.owner?.profile_pic_url
      || (Array.isArray(first?.latestComments)
          ? (first.latestComments.find((c: any) => c?.ownerUsername === postOwnerUsername)?.ownerProfilePicUrl
            || first.latestComments.find((c: any) => c?.owner?.username === postOwnerUsername)?.owner?.profile_pic_url)
          : null)
      || null;

    const outComments: Array<{ id: string; username: string; text: string; timestamp: string; avatarUrl: string | null; }> = [];
    const pushComment = (node: any): void => {
      const id = String(node?.id || '');
      const username = String(node?.ownerUsername || node?.owner?.username || '');
      const text = String(node?.text || '');
      const tsRaw: any = node?.timestamp || node?.takenAt || node?.createdAt || new Date().toISOString();
      const timestamp = typeof tsRaw === 'number' ? new Date(tsRaw * 1000).toISOString() : String(tsRaw);
      const avatarUrl: string | null = node?.ownerProfilePicUrl || node?.owner?.profile_pic_url || null;
      if (!id || !username) return;
      outComments.push({ id, username, text, timestamp, avatarUrl });
    };

    if (Array.isArray(first?.latestComments)) {
      for (const c of first.latestComments as any[]) {
        pushComment(c);
        if (Array.isArray(c?.replies)) {
          for (const r of c.replies as any[]) pushComment(r);
        }
      }
    }

    res.status(200).json({ comments: outComments, post: { caption, imageUrl, ownerUsername: postOwnerUsername, ownerAvatarUrl: postOwnerAvatar } });
  } catch (e: any) {
    res.status(500).json({ error: 'Unhandled error', details: e?.message ?? String(e) });
  }
}

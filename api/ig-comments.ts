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
/**
 * Return the first non-empty string from candidates.
 */
function pickFirstString(...candidates: Array<unknown>): string | null {
  for (const c of candidates) {
    if (typeof c === 'string') {
      const s: string = c.trim();
      if (s) return s;
    }
  }
  return null;
}

/**
 * Normalize timestamps to ISO string.
 */
function normalizeTimestamp(ts: unknown): string {
  if (typeof ts === 'number') return new Date(ts * 1000).toISOString();
  const s: string = typeof ts === 'string' && ts ? ts : new Date().toISOString();
  return s;
}

/**
 * Return null for avatar - let the client handle fallback to initial letter.
 * Instagram CDN URLs are preferred when available from Apify data.
 */
function buildFallbackAvatarUrl(username: string | null | undefined): string | null {
  // No fallback URL - client will show initial letter instead
  return null;
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
    const mock = {
      comments: [
        { id: '1', username: 'alice', text: 'Love this! @bob @carol', timestamp: '2025-01-01T00:00:00Z', avatarUrl: null },
        { id: '2', username: 'bob', text: 'Count me in @carol @dave', timestamp: '2025-01-02T00:00:00Z', avatarUrl: null },
        { id: '3', username: 'carol', text: 'Good luck everyone! @alice @bob', timestamp: '2025-01-03T00:00:00Z', avatarUrl: null },
        { id: '4', username: 'dave', text: "I'm in! @eve @frank", timestamp: '2025-01-04T00:00:00Z', avatarUrl: null },
        { id: '5', username: 'eve', text: 'No mentions', timestamp: '2025-01-05T00:00:00Z', avatarUrl: null },
        { id: '6', username: 'frank', text: '@alice @bob', timestamp: '2025-01-06T00:00:00Z', avatarUrl: null },
        { id: '7', username: 'grace', text: '@alice @bob @carol', timestamp: '2025-01-07T00:00:00Z', avatarUrl: null },
        { id: '8', username: 'harry', text: '@alice @bob', timestamp: '2025-01-08T00:00:00Z', avatarUrl: null },
        { id: '9', username: 'ian', text: '@frank @grace @harry', timestamp: '2025-01-09T00:00:00Z', avatarUrl: null },
        { id: '10', username: 'jane', text: '@harry @ian', timestamp: '2025-01-10T00:00:00Z', avatarUrl: null },
        { id: '11', username: 'kate', text: '@liam @mike', timestamp: '2025-01-11T00:00:00Z', avatarUrl: null },
        { id: '12', username: 'liam', text: '@kate @mike', timestamp: '2025-01-12T00:00:00Z', avatarUrl: null },
        { id: '13', username: 'mike', text: 'just passing by', timestamp: '2025-01-13T00:00:00Z', avatarUrl: null },
        { id: '14', username: 'nina', text: '@oliver @paula', timestamp: '2025-01-14T00:00:00Z', avatarUrl: null },
        { id: '15', username: 'oliver', text: '@nina @paula', timestamp: '2025-01-15T00:00:00Z', avatarUrl: null },
        { id: '16', username: 'paula', text: '@quentin @ruth', timestamp: '2025-01-16T00:00:00Z', avatarUrl: null },
        { id: '17', username: 'quentin', text: '@ruth @sam', timestamp: '2025-01-17T00:00:00Z', avatarUrl: null },
        { id: '18', username: 'ruth', text: '@sam @tina', timestamp: '2025-01-18T00:00:00Z', avatarUrl: null },
        { id: '19', username: 'sam', text: '@tina @alice', timestamp: '2025-01-19T00:00:00Z', avatarUrl: null },
        { id: '20', username: 'tina', text: '@alice @bob', timestamp: '2025-01-20T00:00:00Z', avatarUrl: null },
      ],
      post: {
        caption: '¿Antojos de un dulcito?, @treat.uy \n¿Ganas de un helado?, @treat.uy \n¿Quieres un smoothie?, @treat.uy \n¿Gluten free?, @treat.uy \n¿Productos naturales?, @treat.uy \n\n¡Sencillo! Dale like, comenta y menciona un amigo para participar de un sorteo. El premio es un Helado gratis en cualquiera de nuestros locales 🤤😍',
        imageUrl: 'https://scontent-fra3-1.cdninstagram.com/v/t51.2885-15/500813412_18505438774020783_8450944611229719887_n.jpg?stp=dst-jpg_e35_p1080x1080_sh0.08_tt6&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=IEP2gRKiPR0Q7kNvwH--OFC&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVCkuAq5fy4EtRg_YQHAKR1lfjF1hQzf70c-6Gei3mjag&oe=68B2C90E&_nc_sid=10d13b',
        ownerUsername: 'soymariab',
        ownerAvatarUrl: 'https://scontent-fra3-1.cdninstagram.com/v/t51.2885-19/523508772_18516684802020783_772942058957348881_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=ljrJxMQxKcoQ7kNvwGCJiFg&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVhdEH4JQqMwC2kEvJTd280uPf8skxojzYE0c6cOzRnbw&oe=68B2BCA0&_nc_sid=10d13b',
        createdAt: new Date().toISOString()
      }
    };
    res.status(200).json(mock);
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
    const caption: string | null = pickFirstString(
      first?.postCaption,
      first?.caption,
      first?.edge_media_to_caption?.edges?.[0]?.node?.text,
      first?.title
    );
    const imageUrl: string | null = pickFirstString(
      first?.imageUrl,
      first?.image_url,
      first?.displayUrl,
      first?.display_url,
      first?.thumbnailUrl,
      first?.thumbnail_url,
      first?.displayResources?.[0]?.src,
      first?.display_resources?.[0]?.src
    );
    const postOwnerUsername: string | null = pickFirstString(first?.ownerUsername, first?.owner?.username);
    let postOwnerAvatar: string | null = pickFirstString(
      first?.ownerProfilePicUrl,
      first?.owner?.profile_pic_url,
      first?.owner?.profile_pic_url_hd,
      first?.owner?.profilePicUrl,
      first?.profilePicUrl
    );
    if (!postOwnerAvatar && Array.isArray(first?.latestComments) && postOwnerUsername) {
      const ownerComment: any = (first.latestComments as any[]).find((c: any) => pickFirstString(c?.ownerUsername, c?.owner?.username) === postOwnerUsername);
      postOwnerAvatar = pickFirstString(
        ownerComment?.ownerProfilePicUrl,
        ownerComment?.owner?.profile_pic_url,
        ownerComment?.owner?.profile_pic_url_hd,
        ownerComment?.owner?.profilePicUrl
      );
    }
    if (!postOwnerAvatar) postOwnerAvatar = buildFallbackAvatarUrl(postOwnerUsername);

    const outComments: Array<{ id: string; username: string; text: string; timestamp: string; avatarUrl: string | null; }> = [];
    const pushComment = (node: any): void => {
      const id: string = String(node?.id || '');
      const username: string = pickFirstString(node?.ownerUsername, node?.owner?.username) || '';
      const text: string = String(node?.text || '');
      const tsRaw: unknown = node?.timestamp || node?.takenAt || node?.createdAt || new Date().toISOString();
      const timestamp: string = normalizeTimestamp(tsRaw);
      let avatarUrl: string | null = pickFirstString(
        node?.ownerProfilePicUrl,
        node?.owner?.profile_pic_url,
        node?.owner?.profile_pic_url_hd,
        node?.owner?.profilePicUrl,
        node?.profilePicUrl,
        node?.profile_pic_url
      );
      if (!avatarUrl) avatarUrl = buildFallbackAvatarUrl(username);
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

    const createdAtRaw: string | null = pickFirstString(first?.timestamp, first?.takenAt, first?.createdAt);
    const createdAt: string = normalizeTimestamp(createdAtRaw);
    res.status(200).json({ comments: outComments, post: { caption, imageUrl, ownerUsername: postOwnerUsername, ownerAvatarUrl: postOwnerAvatar, createdAt } });
  } catch (e: any) {
    res.status(500).json({ error: 'Unhandled error', details: e?.message ?? String(e) });
  }
}

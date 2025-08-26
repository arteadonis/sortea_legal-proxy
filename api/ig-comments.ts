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
 * Build a public fallback avatar URL for Instagram users.
 */
function buildUnavatarUrl(username: string | null | undefined): string | null {
  if (!username) return null;
  return `https://unavatar.io/instagram/${encodeURIComponent(username)}?size=256`;
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
        {
          id: '17886625203270317',
          username: 'senatoresilviaaguedadeleon',
          text: 'Que  delicia',
          timestamp: '2025-05-29T22:09:29.000Z',
          avatarUrl: 'https://scontent-fra5-2.cdninstagram.com/v/t51.2885-19/451260971_1496467377629526_4434282802604093405_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_cat=106&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=NNWqqp5o0IUQ7kNvwHM84Ta&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVw8FJV9SVTmZ58RgcGFKlcPgmt_yyKRnlKQy07S-xP9w&oe=68B2CB37&_nc_sid=10d13b'
        },
        {
          id: '18060439076135800',
          username: 'fernandaestevez.9',
          text: 'Donde queda?',
          timestamp: '2025-05-26T15:41:11.000Z',
          avatarUrl: 'https://scontent-fra3-1.cdninstagram.com/v/t51.2885-19/135790967_834857767246249_1001439519743151427_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=101&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=wdvD9n4BxdkQ7kNvwG4cg4s&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVUs_A3kuJxRiH6iyN0bMSLxhhLTe_czvxN4TpHzxxAnQ&oe=68B2BAA3&_nc_sid=10d13b'
        },
        {
          id: '18056624963191420',
          username: 'soymariab',
          text: '@fernandaestevez.9 Hola!! Queda en Tres Cruces, en el primer piso (frente a Arredo) ✨🥰',
          timestamp: '2025-05-26T15:56:23.000Z',
          avatarUrl: 'https://scontent-fra3-1.cdninstagram.com/v/t51.2885-19/523508772_18516684802020783_772942058957348881_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=ljrJxMQxKcoQ7kNvwGCJiFg&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVhdEH4JQqMwC2kEvJTd280uPf8skxojzYE0c6cOzRnbw&oe=68B2BCA0&_nc_sid=10d13b'
        },
        {
          id: '18109108534452014',
          username: 'treat.uy',
          text: '@fernandaestevez.9 Te esperamos 💕🥄',
          timestamp: '2025-05-26T15:59:35.000Z',
          avatarUrl: 'https://scontent-fra5-2.cdninstagram.com/v/t51.2885-19/491504195_18006050621741502_7745786294323588709_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_cat=106&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=Ujat19DLKocQ7kNvwEfhVyj&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVSzDEf-aTzAHjvkBTyBwpSA52HEcM-uINfJfJNgAJtPQ&oe=68B2B8E5&_nc_sid=10d13b'
        },
        {
          id: '17897667840209167',
          username: 'soymariab',
          text: '@senatoresilviaaguedadeleon 😍😍😍😍😍',
          timestamp: '2025-05-29T22:11:37.000Z',
          avatarUrl: 'https://scontent-fra3-1.cdninstagram.com/v/t51.2885-19/523508772_18516684802020783_772942058957348881_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=ljrJxMQxKcoQ7kNvwGCJiFg&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVhdEH4JQqMwC2kEvJTd280uPf8skxojzYE0c6cOzRnbw&oe=68B2BCA0&_nc_sid=10d13b'
        }
      ],
      post: {
        caption: '¿Antojos de un dulcito?, @treat.uy \n¿Ganas de un helado?, @treat.uy \n¿Quieres un smoothie?, @treat.uy \n¿Gluten free?, @treat.uy \n¿Productos naturales?, @treat.uy \n\n¡Sencillo! Dale like, comenta y menciona un amigo para participar de un sorteo. El premio es un Helado gratis en cualquiera de nuestros locales 🤤😍',
        imageUrl: 'https://scontent-fra3-1.cdninstagram.com/v/t51.2885-15/500813412_18505438774020783_8450944611229719887_n.jpg?stp=dst-jpg_e35_p1080x1080_sh0.08_tt6&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=IEP2gRKiPR0Q7kNvwH--OFC&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVCkuAq5fy4EtRg_YQHAKR1lfjF1hQzf70c-6Gei3mjag&oe=68B2C90E&_nc_sid=10d13b',
        ownerUsername: 'soymariab',
        ownerAvatarUrl: 'https://scontent-fra3-1.cdninstagram.com/v/t51.2885-19/523508772_18516684802020783_772942058957348881_n.jpg?stp=dst-jpg_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-fra3-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGj6tnQLIxUk6Jb_tMI5vc9tLj9Q9Gi0im-nPV7QKIV0NQTnrcmQZ7DLj-MgZE1OFU&_nc_ohc=ljrJxMQxKcoQ7kNvwGCJiFg&_nc_gid=qAaO48-WC5LJDCoGZOoTRA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfVhdEH4JQqMwC2kEvJTd280uPf8skxojzYE0c6cOzRnbw&oe=68B2BCA0&_nc_sid=10d13b'
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
    if (!postOwnerAvatar) postOwnerAvatar = buildUnavatarUrl(postOwnerUsername);

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
      if (!avatarUrl) avatarUrl = buildUnavatarUrl(username);
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

/**
 * Fetch Instagram profile data (profile picture URL, full name, etc.)
 * using the Apify Instagram Profile Scraper.
 *
 * Query params:
 *   - usernames: comma-separated list of Instagram usernames (max 10)
 *
 * Returns:
 *   { profiles: [{ username, profilePicUrl, fullName }] }
 */
declare const process: { env: Record<string, string | undefined> };
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ApifyProfileResult {
  username?: string;
  profilePicUrl?: string;
  profilePicUrlHD?: string;
  fullName?: string;
  private?: boolean;
  verified?: boolean;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

interface ProfileOutput {
  username: string;
  profilePicUrl: string | null;
  fullName: string | null;
}

const MAX_USERNAMES = 10;

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
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

  const raw: string = String(req.query.usernames || '').trim();
  if (!raw) {
    res.status(400).json({ error: 'Missing usernames parameter' });
    return;
  }

  const usernames: string[] = raw
    .split(',')
    .map((u: string) => u.trim().replace(/^@/, '').toLowerCase())
    .filter((u: string) => u.length > 0)
    .slice(0, MAX_USERNAMES);

  if (usernames.length === 0) {
    res.status(400).json({ error: 'No valid usernames provided' });
    return;
  }

  const token: string | undefined = process.env.APIFY_TOKEN;
  const taskId: string = (process.env.APIFY_PROFILE_TASK_ID || '').trim();
  const actor: string = (process.env.APIFY_PROFILE_ACTOR || 'apify~instagram-profile-scraper').trim();

  if (!token) {
    res.status(500).json({ error: 'APIFY_TOKEN is not configured' });
    return;
  }

  try {
    const profileUrls: string[] = usernames.map(
      (u: string) => `https://www.instagram.com/${u}/`
    );

    // Run the Apify actor/task and wait for completion
    const runUrl: string = taskId
      ? `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}/runs?token=${token}&waitForFinish=30`
      : `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs?token=${token}&waitForFinish=30`;

    const runResp: Response = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames,
        directUrls: profileUrls,
        proxy: { useApifyProxy: true },
        resultsLimit: usernames.length,
      }),
    });

    if (!runResp.ok) {
      const errText: string = await runResp.text();
      console.error('[ig-profile] Apify run error:', errText);
      res.status(502).json({ error: 'Upstream service error' });
      return;
    }

    const runData: Record<string, any> = await runResp.json() as Record<string, any>;
    const datasetId: string | undefined = runData?.data?.defaultDatasetId;

    if (!datasetId) {
      console.error('[ig-profile] No datasetId in run response');
      res.status(502).json({ error: 'No dataset returned from Apify' });
      return;
    }

    // Fetch results from the dataset
    const dataUrl: string = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&format=json`;
    const dataResp: Response = await fetch(dataUrl);

    if (!dataResp.ok) {
      const errText: string = await dataResp.text();
      console.error('[ig-profile] Dataset fetch error:', errText);
      res.status(502).json({ error: 'Upstream service error' });
      return;
    }

    const items: ApifyProfileResult[] = await dataResp.json() as ApifyProfileResult[];

    // Build a lookup map by normalized username
    const profileMap: Map<string, ApifyProfileResult> = new Map();
    for (const item of items) {
      if (item.username) {
        profileMap.set(item.username.toLowerCase(), item);
      }
    }

    // Return profiles in the same order as requested usernames
    const profiles: ProfileOutput[] = usernames.map((u: string): ProfileOutput => {
      const match: ApifyProfileResult | undefined = profileMap.get(u);
      return {
        username: u,
        profilePicUrl: match?.profilePicUrl || match?.profilePicUrlHD || null,
        fullName: match?.fullName || null,
      };
    });

    res.status(200).json({ profiles });
  } catch (e: unknown) {
    const message: string = e instanceof Error ? e.message : String(e);
    console.error('[ig-profile] Error:', message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

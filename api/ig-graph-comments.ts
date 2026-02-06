/**
 * Fetch ALL comments from an Instagram post owned by the authenticated user
 * using the official Instagram Graph API.
 *
 * Query params:
 *   - media_url: Instagram post URL (to resolve shortcode)
 *   - access_token: Long-lived user access token from OAuth flow
 *   - ig_user_id: Instagram Business Account ID
 *
 * Returns the same JSON shape as ig-comments.ts for compatibility:
 *   { comments: [...], post: { caption, imageUrl, ownerUsername, ... } }
 */
declare const process: { env: Record<string, string | undefined> };
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const COMMENTS_PER_PAGE = 50;
const MAX_PAGES = 400; // Safety limit: 400 pages * 50 = 20,000 comments max

interface GraphComment {
  id: string;
  text: string;
  timestamp: string;
  username: string;
  replies?: { data: GraphComment[] };
}

interface GraphCommentPage {
  data: GraphComment[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

interface GraphMedia {
  id: string;
  caption?: string;
  timestamp?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  shortcode?: string;
  media_type?: string;
}

interface GraphMediaPage {
  data: GraphMedia[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

interface IgUserProfile {
  id: string;
  username?: string;
  profile_picture_url?: string;
}

interface OutputComment {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  avatarUrl: string | null;
}

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Extract the shortcode from an Instagram post URL.
 * Supports /p/SHORTCODE/, /reel/SHORTCODE/, /tv/SHORTCODE/
 */
function extractShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Find the media ID that matches a given shortcode by paginating through user media.
 * The Graph API doesn't expose shortcode directly, so we match via permalink.
 */
async function resolveMediaId({
  igUserId,
  shortcode,
  accessToken,
}: {
  igUserId: string;
  shortcode: string;
  accessToken: string;
}): Promise<GraphMedia | null> {
  const targetPermalink = `https://www.instagram.com/p/${shortcode}/`;
  const targetReelLink = `https://www.instagram.com/reel/${shortcode}/`;
  let url: string | null =
    `${GRAPH_BASE}/${igUserId}/media` +
    `?fields=id,caption,timestamp,media_url,thumbnail_url,permalink,media_type` +
    `&limit=50` +
    `&access_token=${accessToken}`;
  let pages = 0;
  while (url && pages < 20) {
    const resp = await fetch(url);
    if (!resp.ok) {
      const errText: string = await resp.text();
      throw new Error(`Media list failed (${resp.status}): ${errText}`);
    }
    const data = (await resp.json()) as GraphMediaPage;
    for (const media of data.data) {
      const permalink: string = media.permalink || '';
      if (
        permalink === targetPermalink ||
        permalink === targetReelLink ||
        permalink.includes(`/${shortcode}/`)
      ) {
        return media;
      }
    }
    url = data.paging?.next || null;
    pages++;
  }
  return null;
}

/**
 * Fetch ALL comments (with replies) for a given media ID, paginating until done.
 */
async function fetchAllComments({
  mediaId,
  accessToken,
}: {
  mediaId: string;
  accessToken: string;
}): Promise<OutputComment[]> {
  const allComments: OutputComment[] = [];
  let url: string | null =
    `${GRAPH_BASE}/${mediaId}/comments` +
    `?fields=id,text,timestamp,username,replies{id,text,timestamp,username}` +
    `&limit=${COMMENTS_PER_PAGE}` +
    `&access_token=${accessToken}`;
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    console.log(`[ig-graph-comments] Fetching comments page ${pages + 1}...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      const errText: string = await resp.text();
      // Rate limit hit — return what we have so far
      if (resp.status === 429) {
        console.warn('[ig-graph-comments] Rate limit hit, returning partial results');
        break;
      }
      throw new Error(`Comments fetch failed (${resp.status}): ${errText}`);
    }
    const data = (await resp.json()) as GraphCommentPage;
    for (const comment of data.data) {
      allComments.push({
        id: comment.id,
        username: comment.username || '',
        text: comment.text || '',
        timestamp: comment.timestamp || new Date().toISOString(),
        avatarUrl: null,
      });
      // Include replies as flat comments
      if (comment.replies?.data) {
        for (const reply of comment.replies.data) {
          allComments.push({
            id: reply.id,
            username: reply.username || '',
            text: reply.text || '',
            timestamp: reply.timestamp || new Date().toISOString(),
            avatarUrl: null,
          });
        }
      }
    }
    url = data.paging?.next || null;
    pages++;
  }
  console.log(`[ig-graph-comments] Fetched ${allComments.length} comments in ${pages} pages`);
  return allComments;
}

/**
 * Fetch the authenticated user's IG profile for the response.
 */
async function fetchIgProfile({
  igUserId,
  accessToken,
}: {
  igUserId: string;
  accessToken: string;
}): Promise<IgUserProfile> {
  const url = `${GRAPH_BASE}/${igUserId}?fields=id,username,profile_picture_url&access_token=${accessToken}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    return { id: igUserId };
  }
  return (await resp.json()) as IgUserProfile;
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
  const mediaUrl: string = String(req.query.media_url || '').trim();
  const accessToken: string = String(req.query.access_token || '').trim();
  const igUserId: string = String(req.query.ig_user_id || '').trim();
  if (!mediaUrl) {
    res.status(400).json({ error: 'Missing media_url parameter' });
    return;
  }
  if (!accessToken) {
    res.status(400).json({ error: 'Missing access_token parameter' });
    return;
  }
  if (!igUserId) {
    res.status(400).json({ error: 'Missing ig_user_id parameter' });
    return;
  }
  const shortcode: string | null = extractShortcode(mediaUrl);
  if (!shortcode) {
    res.status(400).json({ error: 'Could not extract shortcode from URL' });
    return;
  }
  try {
    console.log(`[ig-graph-comments] Resolving media for shortcode: ${shortcode}`);
    const media: GraphMedia | null = await resolveMediaId({
      igUserId,
      shortcode,
      accessToken,
    });
    if (!media) {
      res.status(404).json({
        error: 'POST_NOT_FOUND',
        details: 'Could not find this post in your Instagram account. Make sure it is YOUR post and your account is Business or Creator.',
      });
      return;
    }
    console.log(`[ig-graph-comments] Found media ID: ${media.id}, fetching comments...`);
    // Fetch comments and profile in parallel
    const [comments, profile] = await Promise.all([
      fetchAllComments({ mediaId: media.id, accessToken }),
      fetchIgProfile({ igUserId, accessToken }),
    ]);
    // Build response in the same shape as ig-comments.ts (Apify endpoint)
    const imageUrl: string | null = media.media_url || media.thumbnail_url || null;
    const response = {
      comments,
      post: {
        caption: media.caption || null,
        imageUrl,
        ownerUsername: profile.username || null,
        ownerAvatarUrl: profile.profile_picture_url || null,
        createdAt: media.timestamp || null,
      },
      meta: {
        source: 'graph_api',
        totalComments: comments.length,
        mediaId: media.id,
        mediaType: media.media_type || null,
      },
    };
    res.status(200).json(response);
  } catch (e: unknown) {
    const message: string = e instanceof Error ? e.message : String(e);
    console.error('[ig-graph-comments] Error:', message);
    // Token expired or invalid
    if (message.includes('OAuthException') || message.includes('Invalid OAuth')) {
      res.status(401).json({
        error: 'TOKEN_EXPIRED',
        details: 'Your Instagram session has expired. Please log in again.',
      });
      return;
    }
    res.status(500).json({ error: 'Unhandled error', details: message });
  }
}

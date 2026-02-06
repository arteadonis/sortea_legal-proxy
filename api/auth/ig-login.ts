/**
 * Generates the Facebook OAuth authorization URL and redirects the user.
 *
 * Flutter opens this endpoint in a browser/Custom Tab.
 * The user sees the Facebook login screen, authorizes, and gets redirected
 * back to /api/auth/ig-callback with the authorization code.
 *
 * Optional query param:
 *   - state: opaque string passed through the OAuth flow for CSRF protection.
 */
declare const process: { env: Record<string, string | undefined> };
import type { VercelRequest, VercelResponse } from '@vercel/node';

const OAUTH_BASE = 'https://www.facebook.com/v21.0/dialog/oauth';

/** Permissions needed to read comments on the user's own IG posts. */
const SCOPES: string[] = [
  'instagram_basic',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
];

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
  const appId: string = process.env.META_APP_ID || '';
  const redirectUri: string = process.env.META_REDIRECT_URI || '';
  if (!appId || !redirectUri) {
    res.status(500).json({ error: 'META_APP_ID or META_REDIRECT_URI not configured' });
    return;
  }
  const state: string = String(req.query.state || '').trim();
  const scope: string = SCOPES.join(',');
  const oauthUrl =
    `${OAUTH_BASE}` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    (state ? `&state=${encodeURIComponent(state)}` : '');
  console.log('[ig-login] Redirecting to Facebook OAuth...');
  res.redirect(302, oauthUrl);
}

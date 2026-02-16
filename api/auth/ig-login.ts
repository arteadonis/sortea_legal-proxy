/**
 * Generates the Facebook OAuth authorization URL and redirects the user.
 *
 * Flutter opens this endpoint in a browser/Custom Tab.
 * The user sees the Facebook login screen, authorizes, and gets redirected
 * back to /api/auth/ig-callback with the authorization code.
 *
 * Optional query params:
 *   - state: opaque string passed through the OAuth flow for CSRF protection.
 *   - auth_type: set to 'reauthenticate' to force re-login (allows account switching).
 */
declare const process: { env: Record<string, string | undefined> };
import type { VercelRequest, VercelResponse } from '@vercel/node';

const OAUTH_BASE = 'https://www.facebook.com/v21.0/dialog/oauth';

/** Permissions required for full functionality (Login + Profile + Comments):
 * - instagram_basic: Read IG profile and media list.
 * - instagram_manage_comments: Read comments (mandatory, no read-only scope exists).
 * - pages_show_list: List Facebook Pages to discover the linked IG Business Account.
 * - pages_read_engagement: Read Page metadata required to resolve the IG link and content.
 * - business_management: Access pages owned by a Business Manager via /me/businesses.
 *
 * NOTE: When META_CONFIG_ID is set, Facebook Login for Business is used instead of
 * manual scopes. This is the recommended flow for apps accessing Business Manager assets.
 */
const SCOPES: string[] = [
  'instagram_basic',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
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
  const authType: string = String(req.query.auth_type || '').trim();
  const configId: string = process.env.META_CONFIG_ID || '';
  // Use 'reauthenticate' to force re-login (account switching), otherwise 'rerequest'.
  const resolvedAuthType: string = authType === 'reauthenticate' ? 'reauthenticate' : 'rerequest';
  let oauthUrl: string;
  if (configId) {
    // Facebook Login for Business: uses config_id which defines permissions and
    // properly handles pages/IG accounts inside a Business Manager portfolio.
    oauthUrl =
      `${OAUTH_BASE}` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&config_id=${configId}` +
      `&response_type=code` +
      `&override_default_response_type=true` +
      `&auth_type=${resolvedAuthType}` +
      (state ? `&state=${encodeURIComponent(state)}` : '');
    console.log(`[ig-login] Using Facebook Login for Business (config_id, auth_type=${resolvedAuthType})...`);
  } else {
    // Classic Facebook Login: uses scope parameter.
    const scope: string = SCOPES.join(',');
    oauthUrl =
      `${OAUTH_BASE}` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&auth_type=${resolvedAuthType}` +
      (state ? `&state=${encodeURIComponent(state)}` : '');
    console.log(`[ig-login] Using classic Facebook Login (scope, auth_type=${resolvedAuthType})...`);
  }
  console.log('[ig-login] Redirecting to Facebook OAuth...');
  res.redirect(302, oauthUrl);
}

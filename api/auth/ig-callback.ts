/**
 * OAuth callback handler for Instagram Graph API authentication.
 *
 * Flow:
 * 1. Facebook redirects here with ?code=XXX after user authorizes.
 * 2. We exchange the code for a short-lived access token.
 * 3. We exchange the short-lived token for a long-lived token (60 days).
 * 4. We resolve the Instagram Business Account ID via the user's Facebook Pages.
 * 5. We redirect back to the Flutter app with the session data via deep link.
 */
declare const process: { env: Record<string, string | undefined> };
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PageData {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

interface PagesResponse {
  data: PageData[];
}

interface IgUserResponse {
  id: string;
  username?: string;
  profile_picture_url?: string;
  name?: string;
}

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Exchange authorization code for short-lived access token.
 */
async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const appId: string = process.env.META_APP_ID || '';
  const appSecret: string = process.env.META_APP_SECRET || '';
  const redirectUri: string = process.env.META_REDIRECT_URI || '';
  const url = `${GRAPH_BASE}/oauth/access_token` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&client_secret=${appSecret}` +
    `&code=${code}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const errText: string = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${errText}`);
  }
  const data = (await resp.json()) as TokenResponse;
  return data;
}

/**
 * Exchange short-lived token for long-lived token (60 days).
 */
async function getLongLivedToken(shortToken: string): Promise<LongLivedTokenResponse> {
  const appId: string = process.env.META_APP_ID || '';
  const appSecret: string = process.env.META_APP_SECRET || '';
  const url = `${GRAPH_BASE}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${appId}` +
    `&client_secret=${appSecret}` +
    `&fb_exchange_token=${shortToken}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const errText: string = await resp.text();
    throw new Error(`Long-lived token exchange failed (${resp.status}): ${errText}`);
  }
  const data = (await resp.json()) as LongLivedTokenResponse;
  return data;
}

/**
 * Get Facebook Pages the user manages and find the linked IG Business Account.
 * Handles pagination to ensure all pages are checked.
 */
async function resolveInstagramAccount(accessToken: string): Promise<{
  igUserId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUsername: string;
  igProfilePicUrl: string | null;
}> {
  // DEBUG: Check granted permissions in detail
  try {
    const permUrl = `${GRAPH_BASE}/me/permissions?access_token=${accessToken}`;
    console.log('[ig-callback][DEBUG] Fetching permissions from:', permUrl.replace(accessToken, 'TOKEN_REDACTED'));
    const permResp = await fetch(permUrl);
    const permRaw: string = await permResp.text();
    console.log('[ig-callback][DEBUG] Permissions raw response:', permRaw);
  } catch (permErr) {
    console.error('[ig-callback][DEBUG] Failed to fetch permissions:', permErr);
  }
  // DEBUG: Check user identity
  try {
    const meUrl = `${GRAPH_BASE}/me?fields=id,name,email&access_token=${accessToken}`;
    const meResp = await fetch(meUrl);
    const meRaw: string = await meResp.text();
    console.log('[ig-callback][DEBUG] /me identity:', meRaw);
  } catch (meErr) {
    console.error('[ig-callback][DEBUG] Failed to fetch /me:', meErr);
  }
  // Fetch all pages with pagination
  const allPages: PageData[] = [];
  const pagesUrl = `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${accessToken}`;
  console.log('[ig-callback][DEBUG] Fetching pages from:', pagesUrl.replace(accessToken, 'TOKEN_REDACTED'));
  let nextUrl: string | null = pagesUrl;
  while (nextUrl) {
    const pagesResp = await fetch(nextUrl);
    const pagesRaw: string = await pagesResp.text();
    console.log('[ig-callback][DEBUG] /me/accounts raw response (status', pagesResp.status, '):', pagesRaw);
    if (!pagesResp.ok) {
      throw new Error(`Pages fetch failed (${pagesResp.status}): ${pagesRaw}`);
    }
    const body = JSON.parse(pagesRaw) as PagesResponse & { paging?: { next?: string } };
    console.log('[ig-callback][DEBUG] Parsed pages data array length:', body.data?.length ?? 'undefined');
    allPages.push(...(body.data || []));
    nextUrl = body.paging?.next || null;
  }
  console.log(`[ig-callback] Found ${allPages.length} Facebook Page(s):`);
  for (const p of allPages) {
    console.log(
      `  - Page "${p.name}" (${p.id}) → ig_business_account: ${
        p.instagram_business_account?.id ?? 'NONE'
      }`
    );
  }
  // DEBUG: If no pages found, try alternative query via /me?fields=accounts
  if (allPages.length === 0) {
    console.log('[ig-callback][DEBUG] No pages via /me/accounts. Trying alternative: /me?fields=accounts{id,name,instagram_business_account}');
    try {
      const altUrl = `${GRAPH_BASE}/me?fields=accounts{id,name,access_token,instagram_business_account}&access_token=${accessToken}`;
      const altResp = await fetch(altUrl);
      const altRaw: string = await altResp.text();
      console.log('[ig-callback][DEBUG] Alternative /me?fields=accounts response (status', altResp.status, '):', altRaw);
    } catch (altErr) {
      console.error('[ig-callback][DEBUG] Alternative query failed:', altErr);
    }
    // DEBUG: Also try querying pages directly if we know any page IDs
    console.log('[ig-callback][DEBUG] Trying /me?fields=id,name,accounts.limit(100){id,name,instagram_business_account,tasks}');
    try {
      const alt2Url = `${GRAPH_BASE}/me?fields=id,name,accounts.limit(100){id,name,instagram_business_account,tasks}&access_token=${accessToken}`;
      const alt2Resp = await fetch(alt2Url);
      const alt2Raw: string = await alt2Resp.text();
      console.log('[ig-callback][DEBUG] Alternative v2 response (status', alt2Resp.status, '):', alt2Raw);
    } catch (alt2Err) {
      console.error('[ig-callback][DEBUG] Alternative v2 query failed:', alt2Err);
    }
  }
  const pageWithIg: PageData | undefined = allPages.find(
    (p: PageData) => p.instagram_business_account?.id
  );
  if (!pageWithIg || !pageWithIg.instagram_business_account) {
    const hint: string = allPages.length === 0
      ? 'No Facebook Pages found. This usually happens if: 1) The user did not select any Page during the Facebook Login flow (Permissions dialog), or 2) The user does not have an Admin/Editor role on the Page, or 3) The Page is in a Business Manager and not assigned to the user.'
      : `Found ${allPages.length} Page(s) but none have an IG Business/Creator account linked.`;
    throw new Error(
      `NO_IG_BUSINESS_ACCOUNT: ${hint} ` +
      'Please go to Facebook Settings > Business Integrations, remove the app, and try again making sure to SELECT ALL PAGES.'
    );
  }
  const igUserId: string = pageWithIg.instagram_business_account.id;
  // Fetch IG username and profile picture
  const igUrl = `${GRAPH_BASE}/${igUserId}?fields=id,username,profile_picture_url,name&access_token=${accessToken}`;
  const igResp = await fetch(igUrl);
  let igUsername = '';
  let igProfilePicUrl: string | null = null;
  if (igResp.ok) {
    const igData = (await igResp.json()) as IgUserResponse;
    igUsername = igData.username || '';
    igProfilePicUrl = igData.profile_picture_url || null;
  }
  return {
    igUserId,
    pageId: pageWithIg.id,
    pageName: pageWithIg.name,
    pageAccessToken: pageWithIg.access_token,
    igUsername,
    igProfilePicUrl,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  // Only GET is expected (redirect from Facebook)
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const code: string = String(req.query.code || '').trim();
  const error: string = String(req.query.error || '').trim();
  const errorReason: string = String(req.query.error_reason || '').trim();
  // Handle user-denied authorization
  if (error) {
    console.error('[ig-callback] Auth denied:', error, errorReason);
    const successUri: string = process.env.META_AUTH_SUCCESS_URI || 'rafflecat://auth/success';
    const errorRedirect = `${successUri}?error=${encodeURIComponent(error)}&error_reason=${encodeURIComponent(errorReason)}`;
    res.redirect(302, errorRedirect);
    return;
  }
  if (!code) {
    res.status(400).json({ error: 'Missing code parameter' });
    return;
  }
  try {
    console.log('[ig-callback] Exchanging code for token...');
    const shortToken: TokenResponse = await exchangeCodeForToken(code);
    console.log('[ig-callback] Got short-lived token, exchanging for long-lived...');
    const longToken: LongLivedTokenResponse = await getLongLivedToken(shortToken.access_token);
    console.log('[ig-callback] Got long-lived token (expires in', longToken.expires_in, 's)');
    console.log('[ig-callback] Resolving Instagram Business Account...');
    const igAccount = await resolveInstagramAccount(longToken.access_token);
    console.log('[ig-callback] Resolved IG account:', igAccount.igUsername, 'ID:', igAccount.igUserId);
    // Calculate expiration date
    const expiresAt: string = new Date(
      Date.now() + longToken.expires_in * 1000
    ).toISOString();
    // Build session payload
    const session = {
      accessToken: longToken.access_token,
      igUserId: igAccount.igUserId,
      igUsername: igAccount.igUsername,
      igProfilePicUrl: igAccount.igProfilePicUrl,
      pageId: igAccount.pageId,
      pageName: igAccount.pageName,
      expiresAt,
    };
    // Redirect back to Flutter app via deep link with session data
    const successUri: string = process.env.META_AUTH_SUCCESS_URI || 'rafflecat://auth/success';
    const sessionParam: string = encodeURIComponent(JSON.stringify(session));
    const redirectUrl = `${successUri}?session=${sessionParam}`;
    console.log('[ig-callback] Redirecting to app...');
    res.redirect(302, redirectUrl);
  } catch (e: unknown) {
    const message: string = e instanceof Error ? e.message : String(e);
    console.error('[ig-callback] Error:', message);
    // If it's a known user-facing error, redirect with error info
    if (message.startsWith('NO_IG_BUSINESS_ACCOUNT')) {
      const successUri: string = process.env.META_AUTH_SUCCESS_URI || 'rafflecat://auth/success';
      const errorRedirect = `${successUri}?error=no_business_account&error_reason=${encodeURIComponent(message)}`;
      res.redirect(302, errorRedirect);
      return;
    }
    res.status(500).json({ error: 'Authentication failed', details: message });
  }
}

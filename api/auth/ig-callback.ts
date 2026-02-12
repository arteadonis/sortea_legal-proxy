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

interface BusinessData {
  id: string;
  name: string;
}

interface BusinessesResponse {
  data: BusinessData[];
  paging?: { next?: string };
}

/**
 * Fallback: resolve pages through Business Manager API.
 * When pages are owned by a Business Portfolio, /me/accounts returns empty.
 * This queries /me/businesses → /{biz}/owned_pages to find them.
 */
async function resolvePagesThroughBusinessManager(accessToken: string): Promise<PageData[]> {
  console.log('[ig-callback][BM-fallback] Querying /me/businesses...');
  const bizResp = await fetch(
    `${GRAPH_BASE}/me/businesses?fields=id,name&access_token=${accessToken}`
  );
  const bizRaw: string = await bizResp.text();
  console.log('[ig-callback][BM-fallback] /me/businesses response (status', bizResp.status, '):', bizRaw);
  if (!bizResp.ok) {
    console.warn('[ig-callback][BM-fallback] Cannot access /me/businesses. business_management permission may be required.');
    return [];
  }
  const bizBody = JSON.parse(bizRaw) as BusinessesResponse;
  if (!bizBody.data || bizBody.data.length === 0) {
    console.log('[ig-callback][BM-fallback] No businesses found.');
    return [];
  }
  const allPages: PageData[] = [];
  for (const biz of bizBody.data) {
    console.log(`[ig-callback][BM-fallback] Querying owned_pages for business "${biz.name}" (${biz.id})...`);
    try {
      const pagesResp = await fetch(
        `${GRAPH_BASE}/${biz.id}/owned_pages?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${accessToken}`
      );
      const pagesRaw: string = await pagesResp.text();
      console.log('[ig-callback][BM-fallback] owned_pages response (status', pagesResp.status, '):', pagesRaw);
      if (pagesResp.ok) {
        const pagesBody = JSON.parse(pagesRaw) as PagesResponse;
        if (pagesBody.data) {
          allPages.push(...pagesBody.data);
        }
      }
    } catch (err) {
      console.error(`[ig-callback][BM-fallback] Error fetching owned_pages for ${biz.id}:`, err);
    }
  }
  console.log(`[ig-callback][BM-fallback] Found ${allPages.length} page(s) through Business Manager.`);
  return allPages;
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
  // Step 1: Try standard /me/accounts endpoint
  const allPages: PageData[] = [];
  let nextUrl: string | null =
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${accessToken}`;
  while (nextUrl) {
    const pagesResp = await fetch(nextUrl);
    if (!pagesResp.ok) {
      const errText: string = await pagesResp.text();
      throw new Error(`Pages fetch failed (${pagesResp.status}): ${errText}`);
    }
    const body = (await pagesResp.json()) as PagesResponse & { paging?: { next?: string } };
    allPages.push(...(body.data || []));
    nextUrl = body.paging?.next || null;
  }
  console.log(`[ig-callback] /me/accounts returned ${allPages.length} page(s).`);
  for (const p of allPages) {
    console.log(
      `  - Page "${p.name}" (${p.id}) → ig_business_account: ${
        p.instagram_business_account?.id ?? 'NONE'
      }`
    );
  }
  // Step 2: If /me/accounts is empty, try Business Manager fallback.
  // Pages owned by a Business Portfolio do not appear in /me/accounts.
  if (allPages.length === 0) {
    console.log('[ig-callback] No pages via /me/accounts. Trying Business Manager fallback...');
    const bmPages: PageData[] = await resolvePagesThroughBusinessManager(accessToken);
    allPages.push(...bmPages);
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
    const DEFAULT_EXPIRY_SECONDS = 5184000; // 60 days
    const expiresInSeconds: number = longToken.expires_in ?? DEFAULT_EXPIRY_SECONDS;
    console.log('[ig-callback] Got long-lived token (expires in', expiresInSeconds, 's)');
    console.log('[ig-callback] Resolving Instagram Business Account...');
    const igAccount = await resolveInstagramAccount(longToken.access_token);
    console.log('[ig-callback] Resolved IG account:', igAccount.igUsername, 'ID:', igAccount.igUserId);
    // Calculate expiration date
    const expiresAt: string = new Date(
      Date.now() + expiresInSeconds * 1000
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

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
  // Handle switch_account: serve an intermediate HTML page that guides the
  // user to log out of Facebook before starting a fresh OAuth flow.
  if (authType === 'switch_account') {
    console.log('[ig-login] Switch account flow — serving intermediate page.');
    const freshOAuthUrl: string = buildOAuthUrl(appId, redirectUri, configId, state, 'rerequest');
    const html: string = buildSwitchAccountPage(freshOAuthUrl);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    return;
  }
  // Use 'reauthenticate' to force re-login (account switching), otherwise 'rerequest'.
  const resolvedAuthType: string = authType === 'reauthenticate' ? 'reauthenticate' : 'rerequest';
  const oauthUrl: string = buildOAuthUrl(appId, redirectUri, configId, state, resolvedAuthType);
  console.log('[ig-login] Redirecting to Facebook OAuth...');
  res.redirect(302, oauthUrl);
}

/**
 * Builds the Facebook OAuth URL with the given parameters.
 */
function buildOAuthUrl(
  appId: string,
  redirectUri: string,
  configId: string,
  state: string,
  resolvedAuthType: string,
): string {
  if (configId) {
    console.log(`[ig-login] Using Facebook Login for Business (config_id, auth_type=${resolvedAuthType})...`);
    return (
      `${OAUTH_BASE}` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&config_id=${configId}` +
      `&response_type=code` +
      `&override_default_response_type=true` +
      `&auth_type=${resolvedAuthType}` +
      (state ? `&state=${encodeURIComponent(state)}` : '')
    );
  }
  const scope: string = SCOPES.join(',');
  console.log(`[ig-login] Using classic Facebook Login (scope, auth_type=${resolvedAuthType})...`);
  return (
    `${OAUTH_BASE}` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    `&auth_type=${resolvedAuthType}` +
    (state ? `&state=${encodeURIComponent(state)}` : '')
  );
}

/**
 * Returns an HTML page that guides the user through logging out of Facebook
 * before starting a fresh OAuth flow with a different account.
 */
function buildSwitchAccountPage(oauthUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cambiar cuenta – RaffleCat</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      max-width:420px;margin:0 auto;padding:48px 24px;background:#FAFAFA;color:#262626}
    h2{font-size:22px;text-align:center;margin-bottom:6px}
    p.sub{color:#737373;text-align:center;margin-bottom:32px;font-size:15px;line-height:1.5}
    .step{display:flex;align-items:flex-start;gap:14px;margin-bottom:22px}
    .num{width:32px;height:32px;border-radius:50%;background:#833AB4;color:#fff;
      display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}
    .step-text{font-size:15px;line-height:1.5;padding-top:4px}
    .btn{display:block;width:100%;padding:16px;border:none;border-radius:14px;
      font-size:16px;font-weight:600;text-decoration:none;text-align:center;cursor:pointer}
    .btn-fb{background:#1877F2;color:#fff;margin-bottom:14px}
    .btn-continue{background:#833AB4;color:#fff}
    .divider{text-align:center;color:#A8A8A8;margin:22px 0;font-size:13px}
  </style>
</head>
<body>
  <h2>Cambiar cuenta</h2>
  <p class="sub">Para usar otra cuenta de Instagram, primero cierra tu sesión de Facebook en este navegador.</p>
  <div class="step">
    <div class="num">1</div>
    <div class="step-text">Abre Facebook y cierra la sesión de tu cuenta actual.</div>
  </div>
  <a class="btn btn-fb" href="https://m.facebook.com/logout.php" target="_self">Ir a Facebook</a>
  <div class="divider">Luego de cerrar sesión:</div>
  <div class="step">
    <div class="num">2</div>
    <div class="step-text">Inicia sesión con tu nueva cuenta de Facebook / Instagram.</div>
  </div>
  <a class="btn btn-continue" href="${oauthUrl}">Continuar con otra cuenta →</a>
</body>
</html>`;
}

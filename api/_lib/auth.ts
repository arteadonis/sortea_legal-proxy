import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Lightweight API authentication middleware.
 * Checks for a shared API key in the `Authorization: Bearer <key>` header
 * or `X-API-Key` header. The key is stored in the `API_SECRET_KEY` env var.
 *
 * Returns true if the request is authorized, false if rejected (response already sent).
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  const secret = process.env.API_SECRET_KEY;
  // If no secret is configured, allow requests (dev/staging mode).
  if (!secret) return true;

  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const xApiKey = (req.headers['x-api-key'] as string) ?? '';
  const provided = bearer || xApiKey;

  if (!provided || provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

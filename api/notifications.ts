import type { VercelRequest, VercelResponse } from '@vercel/node';

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
}

/**
 * In-app notification schema.
 * To add a new notification, add an entry to the NOTIFICATIONS array below.
 * The app will check this endpoint and display any active notifications
 * that the user hasn't dismissed yet.
 */
interface AppNotification {
  id: string;
  type: 'info' | 'promo' | 'update' | 'warning';
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  iconLottie?: string;
  startDate?: string;
  endDate?: string;
  version?: string;
  priority: number;
}

/**
 * Configure your notifications here.
 * Active notifications will be returned to the app.
 * Use startDate/endDate (ISO 8601) to schedule notifications.
 * Use version to target specific app versions (semver comparison).
 */
const NOTIFICATIONS: AppNotification[] = [
  // Example notification - uncomment to activate:
  {
    id: 'promo-2026',
    type: 'promo',
    title: '🎉 Nueva función disponible',
    message: 'Ahora puedes generar captions con IA para anunciar tus ganadores.',
    startDate: '2025-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    priority: 1,
  },
];

function isNotificationActive(notification: AppNotification): boolean {
  const now = new Date();
  if (notification.startDate) {
    const start = new Date(notification.startDate);
    if (now < start) return false;
  }
  if (notification.endDate) {
    const end = new Date(notification.endDate);
    if (now > end) return false;
  }
  return true;
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

  try {
    const dismissedIds = (req.query.dismissed as string)?.split(',').filter(Boolean) || [];
    const appVersion = req.query.version as string | undefined;

    const activeNotifications = NOTIFICATIONS
      .filter(isNotificationActive)
      .filter(n => !dismissedIds.includes(n.id))
      .sort((a, b) => b.priority - a.priority);

    res.status(200).json({
      notifications: activeNotifications,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

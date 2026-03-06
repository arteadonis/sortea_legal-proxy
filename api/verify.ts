import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/verify?id=<verificationId>
 *
 * Looks up a draw verification record in Firestore and returns the
 * public draw summary so third parties can confirm winners.
 *
 * Requires environment variables:
 *   FIREBASE_PROJECT_ID   – e.g. "rafflecat"
 *   FIREBASE_CLIENT_EMAIL – service account email
 *   FIREBASE_PRIVATE_KEY  – service account private key (PEM, with \n)
 */

interface VerificationRecord {
  title: string;
  postUsername: string;
  postUrl: string;
  winners: string[];
  alternates: string[];
  totalComments: number;
  validParticipants: number;
  winnersCount: number;
  alternatesCount: number;
  createdAt: string;
  isProDraw: boolean;
}

// Lazy-init Firestore to avoid cold-start overhead on every request.
let firestoreDb: ReturnType<import('firebase-admin').app.App['firestore']> | null = null;

async function getFirestore(): Promise<ReturnType<import('firebase-admin').app.App['firestore']>> {
  if (firestoreDb) return firestoreDb;
  // Dynamic import so the module is only loaded when needed.
  const admin = await import('firebase-admin');
  if (!admin.default.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase service account environment variables');
    }
    admin.default.initializeApp({
      credential: admin.default.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  firestoreDb = admin.default.firestore();
  return firestoreDb;
}

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS must be set before ANY response to avoid browser blocking
  cors(res);

  try {
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    if (!id) {
      res.status(400).json({ error: 'Missing "id" query parameter' });
      return;
    }
    // Basic validation: SHA-256 hex is 64 chars
    if (!/^[a-f0-9]{64}$/i.test(id)) {
      res.status(400).json({ error: 'Invalid verification ID format' });
      return;
    }

    const db = await getFirestore();
    const doc = await db.collection('verifications').doc(id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Verification record not found' });
      return;
    }
    const data = doc.data() as VerificationRecord;
    // Cache for 1 hour — verification data is immutable
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(200).json({
      verified: true,
      id,
      title: data.title,
      postUsername: data.postUsername,
      postUrl: data.postUrl,
      winners: data.winners,
      alternates: data.alternates,
      totalComments: data.totalComments,
      validParticipants: data.validParticipants,
      winnersCount: data.winnersCount,
      alternatesCount: data.alternatesCount,
      createdAt: data.createdAt,
      isProDraw: data.isProDraw,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[verify] Error:', message);
    // Ensure CORS is still present on error responses
    cors(res);
    res.status(500).json({ error: 'Internal server error' });
  }
}

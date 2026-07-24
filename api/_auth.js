import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function ensureAdmin() {
  if (!getApps().length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }) });
  }
}

export async function requireUser(req, res) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('missing token');
    ensureAdmin();
    return await getAuth().verifyIdToken(token, true);
  } catch (_) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
}

export function applyPrivateCors(req, res) {
  const configured = process.env.APP_ORIGIN;
  const origin = req.headers.origin || '';
  if (!configured || origin === configured || /^https?:\/\/localhost(?::\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || configured || 'null');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

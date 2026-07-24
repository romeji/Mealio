import crypto from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const config = { api: { bodyParser: false } };

function getAdminDb() {
  if (!getApps().length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      throw new Error('Firebase Admin configuration missing');
    }
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }) });
  }
  return getFirestore();
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const timestamp = header.match(/(?:^|,)t=(\d+)/)?.[1];
  const signatures = [...header.matchAll(/(?:^|,)v1=([a-f0-9]+)/gi)].map(match => match[1]);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  return signatures.some(signature => {
    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const rawBody = await readRawBody(req);
    if (!verifyStripeSignature(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
      return res.status(401).send('Invalid Stripe signature');
    }
    const event = JSON.parse(rawBody.toString('utf8'));
    const object = event.data?.object || {};
    const userId = object.client_reference_id || object.metadata?.userId;
    if (!userId) return res.status(200).json({ received: true, ignored: 'missing userId' });

    const ref = getAdminDb().collection('users').doc(userId);
    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      const plan = object.metadata?.plan === 'yearly' ? 'yearly' : 'monthly';
      const duration = plan === 'yearly' ? 365 : 30;
      await ref.set({
        premium: {
          active: true, plan,
          expiresAt: Date.now() + duration * 86400000,
          activatedAt: Date.now(),
          stripeCustomerId: object.customer || '',
          stripeSessionId: object.id || '',
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (event.type === 'customer.subscription.deleted') {
      await ref.set({
        premium: { active: false, cancelledAt: Date.now() },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Stripe webhook]', error.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

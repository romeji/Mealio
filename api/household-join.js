import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function services() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const { auth, db } = services();
    const user = await auth.verifyIdToken(token, true);
    const code = String(req.body?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4 || code.length > 8) return res.status(400).json({ error: 'Code invalide' });

    const codeSnap = await db.collection('houseCodes').doc(code).get();
    const houseId = codeSnap.data()?.houseId;
    if (!houseId) return res.status(404).json({ error: 'Foyer introuvable' });
    const houseRef = db.collection('households').doc(houseId);
    const userRef = db.collection('users').doc(user.uid);
    let household;
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(houseRef);
      if (!snap.exists) throw new Error('Foyer introuvable');
      household = snap.data();
      const members = Array.isArray(household.members) ? household.members : [];
      if (!members.some(member => (typeof member === 'string' ? member : member.uid) === user.uid)) {
        members.push({
          uid: user.uid,
          name: String(req.body?.name || user.name || user.email?.split('@')[0] || 'Membre').slice(0, 60),
          email: user.email || '',
        });
      }
      transaction.update(houseRef, {
        members,
        memberUids: FieldValue.arrayUnion(user.uid),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(userRef, { houseId, houseCode: code }, { merge: true });
    });
    return res.status(200).json({
      houseId, code,
      household: { ...household, members: undefined, memberUids: undefined },
    });
  } catch (error) {
    console.error('[household-join]', error.message);
    return res.status(401).json({ error: 'Invitation invalide ou session expirée' });
  }
}

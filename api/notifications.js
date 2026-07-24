import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const DEFAULT_PREFERENCES = {
  inApp: true,
  push: true,
  shopping: true,
  fridge: true,
  meals: true,
  household: true,
  receipts: true,
  reminders: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00'
};

const EVENT_TEMPLATES = {
  item_added: {
    category: 'shopping', icon: '🛒', title: '{actor} a ajouté un article',
    body: '{itemName} a été ajouté à la liste de courses.', action: 'list'
  },
  shopping_started: {
    category: 'shopping', icon: '🧺', title: '{actor} commence les courses',
    body: 'La liste est en cours. Vous pouvez la suivre en direct.', action: 'cart'
  },
  shopping_completed: {
    category: 'shopping', icon: '✅', title: 'Courses terminées',
    body: '{actor} a rangé {count} article(s) dans le frigo.', action: 'history'
  },
  fridge_updated: {
    category: 'fridge', icon: '🥬', title: 'Frigo mis à jour',
    body: '{actor} a ajouté {count} produit(s) au frigo.', action: 'fridge'
  },
  menu_planned: {
    category: 'meals', icon: '🍽️', title: 'Menu de la semaine prêt',
    body: '{actor} a planifié {count} repas.', action: 'menu'
  },
  recipe_planned: {
    category: 'meals', icon: '👨‍🍳', title: 'Nouveau repas planifié',
    body: '{actor} a prévu « {recipeName} ».', action: 'menu'
  },
  household_joined: {
    category: 'household', icon: '👋', title: 'Nouveau membre dans le foyer',
    body: '{actor} a rejoint votre foyer Mealio.', action: 'household'
  },
  receipt_imported: {
    category: 'receipts', icon: '🧾', title: 'Ticket ajouté',
    body: '{actor} a importé un ticket de {store} ({count} article(s)).', action: 'receipts'
  },
  reminder_list: {
    category: 'reminders', icon: '⏰', title: 'La liste vous attend',
    body: 'Il reste {count} article(s) à acheter.', action: 'list'
  },
  reminder_menu: {
    category: 'reminders', icon: '📅', title: 'Une nouvelle semaine à préparer',
    body: 'Planifiez vos repas et générez la liste en quelques secondes.', action: 'menu'
  }
};

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

function fill(template, payload) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(payload[key] ?? ''));
}

function allowedOrigin(origin) {
  if (!origin) return '*';
  const allowed = [
    'https://smartcard-eosin.vercel.app',
    'https://romeji.github.io',
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.APP_ORIGIN
  ].filter(Boolean);
  return allowed.some(value => origin === value || origin.startsWith(value + '/')) ? origin : allowed[0];
}

async function authenticate(req) {
  const bearer = req.headers.authorization || '';
  if (!bearer.startsWith('Bearer ')) throw Object.assign(new Error('Non authentifié'), { status: 401 });
  return getAuth(getAdminApp()).verifyIdToken(bearer.slice(7));
}

function isQuietHours(preferences, date = new Date()) {
  const parse = value => {
    const [hour, minute] = String(value || '').split(':').map(Number);
    return hour * 60 + minute;
  };
  const now = date.getHours() * 60 + date.getMinutes();
  const start = parse(preferences.quietHoursStart);
  const end = parse(preferences.quietHoursEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export default async function handler(req, res) {
  const origin = allowedOrigin(req.headers.origin);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      vapidKey: process.env.FIREBASE_VAPID_PUBLIC_KEY || '',
      configured: Boolean(process.env.FIREBASE_VAPID_PUBLIC_KEY)
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const decoded = await authenticate(req);
    const uid = decoded.uid;
    const db = getFirestore(getAdminApp());
    const body = req.body || {};
    const action = body.action;
    const userRef = db.collection('users').doc(uid);

    if (action === 'register_device') {
      const token = String(body.token || '').trim();
      const deviceId = String(body.deviceId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
      if (!token || !deviceId) return res.status(400).json({ error: 'Token ou appareil manquant' });
      await userRef.collection('devices').doc(deviceId).set({
        token, platform: 'web', userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        enabled: true, updatedAt: Date.now()
      }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    if (action === 'unregister_device') {
      const deviceId = String(body.deviceId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
      if (deviceId) await userRef.collection('devices').doc(deviceId).delete();
      return res.status(200).json({ ok: true });
    }

    if (action === 'save_preferences') {
      const incoming = body.preferences || {};
      const preferences = { ...DEFAULT_PREFERENCES };
      Object.keys(preferences).forEach(key => {
        if (incoming[key] !== undefined) preferences[key] = incoming[key];
      });
      await userRef.set({ notificationPreferences: preferences }, { merge: true });
      return res.status(200).json({ ok: true, preferences });
    }

    if (action === 'mark_read') {
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 100) : [];
      const batch = db.batch();
      ids.forEach(id => batch.set(userRef.collection('notifications').doc(String(id)), {
        read: true, readAt: Date.now()
      }, { merge: true }));
      await batch.commit();
      return res.status(200).json({ ok: true });
    }

    if (action !== 'emit') return res.status(400).json({ error: 'Action inconnue' });

    const template = EVENT_TEMPLATES[body.eventType];
    if (!template) return res.status(400).json({ error: 'Événement inconnu' });

    const userSnap = await userRef.get();
    const userData = userSnap.data() || {};
    const houseId = userData.houseId;
    if (!houseId) return res.status(200).json({ ok: true, recipients: 0 });

    const houseRef = db.collection('households').doc(houseId);
    const houseSnap = await houseRef.get();
    if (!houseSnap.exists) return res.status(404).json({ error: 'Foyer introuvable' });
    const house = houseSnap.data();
    const memberUids = Array.isArray(house.memberUids)
      ? house.memberUids
      : (house.members || []).map(member => typeof member === 'string' ? member : member.uid);
    if (!memberUids.includes(uid)) return res.status(403).json({ error: 'Accès au foyer refusé' });

    const idempotencyKey = String(body.idempotencyKey || `${body.eventType}-${uid}-${Date.now()}`)
      .replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 140);
    const eventRef = houseRef.collection('notificationEvents').doc(idempotencyKey);
    const rateRef = houseRef.collection('notificationRateLimits').doc(uid);
    let duplicate = false;
    await db.runTransaction(async transaction => {
      const [existing, rateSnapshot] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(rateRef)
      ]);
      if (existing.exists) { duplicate = true; return; }
      const now = Date.now();
      const rate = rateSnapshot.data() || {};
      const inCurrentWindow = now - Number(rate.windowStart || 0) < 10 * 60 * 1000;
      const count = inCurrentWindow ? Number(rate.count || 0) : 0;
      if (count >= 30) throw Object.assign(new Error('Trop de notifications envoyées. Réessayez plus tard.'), { status: 429 });
      transaction.set(rateRef, {
        windowStart: inCurrentWindow ? rate.windowStart : now,
        count: count + 1,
        updatedAt: now
      });
      transaction.create(eventRef, { type: body.eventType, actorUid: uid, createdAt: now });
    });
    if (duplicate) return res.status(200).json({ ok: true, duplicate: true });

    const actor = userData.profile?.name || decoded.name || decoded.email?.split('@')[0] || 'Un membre';
    const payload = { ...body.payload, actor };
    const title = fill(template.title, payload);
    const messageBody = fill(template.body, payload);
    const recipients = memberUids.filter(memberUid => memberUid && memberUid !== uid);
    let pushes = 0;

    for (const recipientUid of recipients) {
      const recipientRef = db.collection('users').doc(recipientUid);
      const recipientSnap = await recipientRef.get();
      const preferences = { ...DEFAULT_PREFERENCES, ...(recipientSnap.data()?.notificationPreferences || {}) };
      if (preferences[template.category] === false) continue;

      const notification = {
        type: body.eventType,
        category: template.category,
        icon: template.icon,
        title,
        body: messageBody,
        action: template.action,
        actorUid: uid,
        houseId,
        read: false,
        createdAt: Date.now()
      };
      if (preferences.inApp !== false) {
        await recipientRef.collection('notifications').add(notification);
      }

      if (preferences.push !== false && !isQuietHours(preferences)) {
        const devices = await recipientRef.collection('devices').where('enabled', '==', true).get();
        const tokens = devices.docs.map(doc => doc.data().token).filter(Boolean).slice(0, 500);
        if (tokens.length) {
          const result = await getMessaging(getAdminApp()).sendEachForMulticast({
            tokens,
            notification: { title: `${template.icon} ${title}`, body: messageBody },
            data: { action: template.action, notificationType: body.eventType, url: '/?notification=' + template.action },
            webpush: {
              fcmOptions: { link: '/?notification=' + template.action },
              notification: { icon: '/mealio-icon.svg', badge: '/mealio-icon.svg', tag: idempotencyKey }
            }
          });
          pushes += result.successCount;
          const cleanup = db.batch();
          result.responses.forEach((response, index) => {
            if (!response.success && /registration-token-not-registered|invalid-registration-token/.test(response.error?.code || '')) {
              const deviceDoc = devices.docs.find(doc => doc.data().token === tokens[index]);
              if (deviceDoc) cleanup.delete(deviceDoc.ref);
            }
          });
          await cleanup.commit();
        }
      }
    }

    await eventRef.set({ deliveredAt: Date.now(), recipients: recipients.length, pushes }, { merge: true });
    return res.status(200).json({ ok: true, recipients: recipients.length, pushes });
  } catch (error) {
    console.error('[notifications]', error);
    return res.status(error.status || 500).json({ error: error.message || 'Erreur notifications' });
  }
}

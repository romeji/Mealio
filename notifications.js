/* FRIGOLY — Notifications foyer, centre in-app et Firebase Cloud Messaging */
(function () {
  const API_URL = () => (typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/notifications';
  const DEFAULTS = {
    inApp: true, push: true, shopping: true, fridge: true, meals: true,
    household: true, receipts: true, reminders: true,
    quietHoursStart: '22:00', quietHoursEnd: '08:00'
  };
  let unsubscribe = null;
  let notifications = [];
  let initialSnapshotReceived = false;
  let preferences = { ...DEFAULTS };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function deviceId() {
    let id = localStorage.getItem('frigoly_device_id');
    if (!id) {
      id = 'web_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2));
      localStorage.setItem('frigoly_device_id', id);
    }
    return id;
  }

  async function api(body, method = 'POST') {
    if (!currentUser) throw new Error('Utilisateur non connecté');
    const token = await currentUser.getIdToken();
    const response = await fetch(API_URL(), {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: method === 'GET' ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Service de notifications indisponible');
    return data;
  }

  function injectUi() {
    if (document.getElementById('notificationBell')) return;
    const style = document.createElement('style');
    style.textContent = `
      .notif-bell{position:fixed;right:74px;top:calc(12px + env(safe-area-inset-top));z-index:1600;width:42px;height:42px;border:0;border-radius:14px;background:var(--bg);color:var(--tx);box-shadow:var(--so);display:flex;align-items:center;justify-content:center;font-size:1.05rem}
      .notif-count{position:absolute;right:-4px;top:-5px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:var(--rd);color:#fff;border:2px solid var(--bg);font-size:.58rem;font-weight:900;display:none;align-items:center;justify-content:center}
      .notif-sheet{position:fixed;inset:0;z-index:5000;background:rgba(20,12,25,.48);backdrop-filter:blur(8px);display:none;align-items:flex-end;justify-content:center}
      .notif-sheet.on{display:flex}.notif-panel{width:100%;max-width:520px;max-height:88dvh;background:var(--bg);border-radius:26px 26px 0 0;display:flex;flex-direction:column;box-shadow:0 -20px 60px rgba(0,0,0,.2)}
      .notif-head{padding:16px 18px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--bg2)}
      .notif-title{font-size:1rem;font-weight:900;flex:1}.notif-actions{display:flex;gap:6px}.notif-icon-btn{border:0;background:var(--bg2);color:var(--tx);border-radius:11px;padding:8px 10px;font-size:.78rem;font-weight:800}
      .notif-list{overflow:auto;padding:10px 12px calc(20px + env(safe-area-inset-bottom))}
      .notif-item{width:100%;border:0;color:var(--tx);background:transparent;padding:11px 9px;border-radius:15px;display:grid;grid-template-columns:40px 1fr auto;gap:10px;text-align:left;align-items:start}
      .notif-item.unread{background:linear-gradient(135deg,rgba(255,107,107,.09),rgba(0,210,198,.07))}
      .notif-item:hover{background:var(--bg2)}.notif-emoji{width:40px;height:40px;border-radius:13px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:1.1rem}
      .notif-item-title{font-size:.78rem;font-weight:900;line-height:1.25}.notif-item-body{font-size:.7rem;color:var(--tx2);line-height:1.35;margin-top:3px}.notif-time{font-size:.58rem;color:var(--tx3);white-space:nowrap}
      .notif-empty{text-align:center;padding:48px 20px;color:var(--tx2)}.notif-empty span{display:block;font-size:2.2rem;margin-bottom:10px}
      .notif-settings{padding:16px 18px 26px;overflow:auto}.notif-setting{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--bg2)}
      .notif-setting-copy{flex:1}.notif-setting-title{font-size:.78rem;font-weight:900}.notif-setting-sub{font-size:.64rem;color:var(--tx2);margin-top:2px}
      .notif-switch{width:44px;height:25px;appearance:none;border-radius:13px;background:var(--tx3);position:relative;transition:.2s}.notif-switch::after{content:'';position:absolute;width:19px;height:19px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.2s}.notif-switch:checked{background:var(--ac)}.notif-switch:checked::after{transform:translateX(19px)}
      @media(min-width:768px){.notif-bell{right:28px}.notif-sheet{align-items:center}.notif-panel{border-radius:26px;max-height:78dvh}}
    `;
    document.head.appendChild(style);

    const bell = document.createElement('button');
    bell.id = 'notificationBell';
    bell.className = 'notif-bell';
    bell.type = 'button';
    bell.setAttribute('aria-label', 'Ouvrir les notifications');
    bell.innerHTML = '🔔<span class="notif-count" id="notificationCount"></span>';
    bell.onclick = openCenter;
    document.body.appendChild(bell);

    const sheet = document.createElement('div');
    sheet.id = 'notificationSheet';
    sheet.className = 'notif-sheet';
    sheet.onclick = event => { if (event.target === sheet) closeCenter(); };
    sheet.innerHTML = '<section class="notif-panel" role="dialog" aria-modal="true" aria-labelledby="notificationTitle">'
      + '<header class="notif-head"><div class="notif-title" id="notificationTitle">🔔 Notifications</div>'
      + '<div class="notif-actions"><button class="notif-icon-btn" onclick="MealioNotifications.markAllRead()">Tout lire</button>'
      + '<button class="notif-icon-btn" onclick="MealioNotifications.openSettings()">⚙️</button>'
      + '<button class="notif-icon-btn" onclick="MealioNotifications.close()">✕</button></div></header>'
      + '<div class="notif-list" id="notificationList"></div></section>';
    document.body.appendChild(sheet);
  }

  function relativeTime(timestamp) {
    const seconds = Math.max(0, Math.floor((Date.now() - Number(timestamp || 0)) / 1000));
    if (seconds < 60) return 'maintenant';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' h';
    return Math.floor(seconds / 86400) + ' j';
  }

  function render() {
    const unread = notifications.filter(item => !item.read).length;
    const badge = document.getElementById('notificationCount');
    if (badge) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = unread ? 'flex' : 'none';
    }
    const list = document.getElementById('notificationList');
    if (!list) return;
    if (!notifications.length) {
      list.innerHTML = '<div class="notif-empty"><span>🌿</span><strong>Tout est calme</strong><div>Les nouvelles de votre foyer apparaîtront ici.</div></div>';
      return;
    }
    list.innerHTML = notifications.map(item => '<button type="button" class="notif-item ' + (!item.read ? 'unread' : '')
      + '" data-notification-id="' + escapeHtml(item.id) + '">'
      + '<span class="notif-emoji">' + escapeHtml(item.icon || '🔔') + '</span><span>'
      + '<span class="notif-item-title">' + escapeHtml(item.title) + '</span>'
      + '<span class="notif-item-body">' + escapeHtml(item.body) + '</span></span>'
      + '<span class="notif-time">' + relativeTime(item.createdAt) + '</span></button>').join('');
    list.querySelectorAll('[data-notification-id]').forEach(button => {
      button.addEventListener('click', () => openNotification(button.dataset.notificationId));
    });
  }

  async function init() {
    if (!currentUser || !db) return;
    injectUi();
    const userDoc = await db.collection('users').doc(currentUser.uid).get().catch(() => null);
    preferences = { ...DEFAULTS, ...(userDoc?.data()?.notificationPreferences || {}) };
    if (unsubscribe) unsubscribe();
    unsubscribe = db.collection('users').doc(currentUser.uid).collection('notifications')
      .orderBy('createdAt', 'desc').limit(60).onSnapshot(snapshot => {
        const previousIds = new Set(notifications.map(item => item.id));
        notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (initialSnapshotReceived) {
          const incoming = notifications.find(item => !previousIds.has(item.id) && !item.read);
          if (incoming && typeof showToast === 'function') showToast(incoming.icon || '🔔', incoming.title, incoming.body);
        }
        initialSnapshotReceived = true;
        render();
      }, error => console.warn('[notifications] listener', error));
    flushQueue();
    handleDeepLink();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      enablePush(false).catch(error => console.warn('[notifications] push registration', error));
    }
  }

  function openCenter() {
    document.getElementById('notificationSheet')?.classList.add('on');
    render();
  }

  function closeCenter() {
    document.getElementById('notificationSheet')?.classList.remove('on');
  }

  function navigate(action) {
    if (action === 'list') { switchTab('liste'); switchSubtab('tobuy'); }
    else if (action === 'cart') { switchTab('liste'); switchSubtab('cart'); }
    else if (action === 'history') { switchTab('liste'); switchSubtab('done'); }
    else if (action === 'fridge') switchTab('frigo');
    else if (action === 'menu') switchTab('menu');
    else if (action === 'receipts') switchTab('ticket');
    else if (action === 'household') { closeCenter(); showFoyerModal(); return; }
    closeCenter();
  }

  async function openNotification(id) {
    const item = notifications.find(notification => notification.id === id);
    if (!item) return;
    if (!item.read) {
      item.read = true;
      render();
      api({ action: 'mark_read', ids: [id] }).catch(() => {});
    }
    navigate(item.action);
  }

  async function markAllRead() {
    const ids = notifications.filter(item => !item.read).map(item => item.id);
    if (!ids.length) return;
    notifications.forEach(item => { item.read = true; });
    render();
    await api({ action: 'mark_read', ids }).catch(error => showToast('⚠️', 'Synchronisation', error.message));
  }

  function settingsRow(key, title, subtitle) {
    return '<label class="notif-setting"><span class="notif-setting-copy"><span class="notif-setting-title">' + title
      + '</span><span class="notif-setting-sub">' + subtitle + '</span></span><input class="notif-switch" type="checkbox" data-notif-pref="'
      + key + '" ' + (preferences[key] !== false ? 'checked' : '') + '></label>';
  }

  function openSettings() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    document.getElementById('notificationTitle').textContent = '⚙️ Préférences';
    list.innerHTML = '<div class="notif-settings">'
      + '<button class="btn acc" style="width:100%;margin-bottom:12px" onclick="MealioNotifications.enablePush()">🔔 Activer les notifications mobiles</button>'
      + settingsRow('push', 'Notifications mobiles', 'Même lorsque Mealio est fermé')
      + settingsRow('inApp', 'Centre de notifications', 'Conserver les événements dans l’application')
      + settingsRow('shopping', 'Liste et courses', 'Articles ajoutés et courses terminées')
      + settingsRow('fridge', 'Frigo', 'Mises à jour et futurs rappels anti-gaspi')
      + settingsRow('meals', 'Menus et recettes', 'Repas planifiés par le foyer')
      + settingsRow('household', 'Vie du foyer', 'Arrivée de nouveaux membres')
      + settingsRow('receipts', 'Tickets', 'Tickets importés par un membre')
      + settingsRow('reminders', 'Rappels utiles', 'Liste en attente et menu de la semaine')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px"><label class="flb">Silence dès<input class="inp" type="time" id="notifQuietStart" value="'
      + escapeHtml(preferences.quietHoursStart) + '"></label><label class="flb">Jusqu’à<input class="inp" type="time" id="notifQuietEnd" value="'
      + escapeHtml(preferences.quietHoursEnd) + '"></label></div>'
      + '<button class="btn acc" style="width:100%;margin-top:14px" onclick="MealioNotifications.saveSettings()">Enregistrer</button></div>';
  }

  async function saveSettings() {
    document.querySelectorAll('[data-notif-pref]').forEach(input => { preferences[input.dataset.notifPref] = input.checked; });
    preferences.quietHoursStart = document.getElementById('notifQuietStart')?.value || '22:00';
    preferences.quietHoursEnd = document.getElementById('notifQuietEnd')?.value || '08:00';
    const result = await api({ action: 'save_preferences', preferences });
    preferences = result.preferences;
    showToast('✅', 'Préférences enregistrées', 'Vos notifications sont personnalisées.');
    document.getElementById('notificationTitle').textContent = '🔔 Notifications';
    render();
  }

  async function enablePush(showConfirmation = true) {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !firebase.messaging) {
      showToast('❌', 'Non compatible', 'Ce navigateur ne prend pas en charge les notifications push.');
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('🔕', 'Notifications non activées', 'Vous pourrez les autoriser depuis les réglages du navigateur.');
      return false;
    }
    const configResponse = await fetch(API_URL());
    const config = await configResponse.json();
    if (!config.vapidKey) throw new Error('Clé VAPID non configurée sur le serveur');
    const registration = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration
    });
    await api({ action: 'register_device', token, deviceId: deviceId() });
    preferences.push = true;
    await api({ action: 'save_preferences', preferences });
    if (showConfirmation) showToast('🔔', 'Notifications mobiles activées', 'Cet appareil recevra les nouvelles du foyer.');
    return true;
  }

  function queueEvent(event) {
    const queue = JSON.parse(localStorage.getItem('frigoly_notification_queue') || '[]');
    queue.push(event);
    localStorage.setItem('frigoly_notification_queue', JSON.stringify(queue.slice(-40)));
  }

  async function emit(eventType, payload = {}, idempotencyKey) {
    if (!currentUser || !state.houseId) return;
    const event = {
      action: 'emit', eventType, payload,
      idempotencyKey: idempotencyKey || `${eventType}_${currentUser.uid}_${Date.now()}`
    };
    try {
      await api(event);
    } catch (error) {
      if (!navigator.onLine || /fetch|network/i.test(error.message)) queueEvent(event);
      else console.warn('[notifications] emit', error);
    }
  }

  async function flushQueue() {
    if (!navigator.onLine || !currentUser) return;
    const queue = JSON.parse(localStorage.getItem('frigoly_notification_queue') || '[]');
    if (!queue.length) return;
    const remaining = [];
    for (const event of queue) {
      try { await api(event); } catch (_) { remaining.push(event); }
    }
    localStorage.setItem('frigoly_notification_queue', JSON.stringify(remaining));
  }

  function handleDeepLink() {
    const action = new URLSearchParams(location.search).get('notification');
    if (!action) return;
    history.replaceState({}, '', location.pathname);
    setTimeout(() => navigate(action), 400);
  }

  window.addEventListener('online', flushQueue);
  window.MealioNotifications = {
    init, emit, open: openCenter, close: closeCenter, openNotification,
    markAllRead, openSettings, saveSettings, enablePush, flushQueue
  };
  window.requestPushPermission = enablePush;
})();

(function (root) {
  'use strict';
  const DB_NAME = 'frigoly_offline';
  const STORE = 'recipes';
  const VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in root)) return reject(new Error('IndexedDB indisponible'));
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('savedAt', '_savedAt');
          store.createIndex('source', 'source');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putMany(recipes) {
    const valid = (recipes || []).filter(r => r?.id && r?.name).map(r => ({
      ...r, _savedAt: Date.now(), _schemaVersion: 1,
    }));
    if (!valid.length) return 0;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      valid.forEach(recipe => tx.objectStore(STORE).put(recipe));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return valid.length;
  }

  async function getAll(limit = 1000) {
    const db = await openDb();
    const result = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result || [])
        .sort((a, b) => (b._savedAt || 0) - (a._savedAt || 0)).slice(0, limit));
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  }

  async function hydrateMemory() {
    try {
      const recipes = await getAll();
      if (!root._jowCache) root._jowCache = {};
      recipes.forEach(recipe => { root._jowCache[recipe.id] = recipe; });
      return recipes.length;
    } catch (_) {
      // Migration unique de l'ancien petit cache localStorage.
      try {
        const legacy = Object.values(JSON.parse(localStorage.getItem('jow_local_db') || '{}'));
        if (!root._jowCache) root._jowCache = {};
        legacy.forEach(recipe => { if (recipe?.id) root._jowCache[recipe.id] = recipe; });
        if (legacy.length) await putMany(legacy);
        localStorage.removeItem('jow_local_db');
        return legacy.length;
      } catch (_) { return 0; }
    }
  }

  root.MealioRecipeStore = { putMany, getAll, hydrateMemory };
})(typeof globalThis !== 'undefined' ? globalThis : window);

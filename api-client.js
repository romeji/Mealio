(function (root) {
  'use strict';
  async function mealioApiFetch(url, options = {}) {
    const user = root.currentUser || root.firebase?.auth?.().currentUser;
    const token = user?.getIdToken ? await user.getIdToken() : '';
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  }
  root.mealioApiFetch = mealioApiFetch;
})(typeof globalThis !== 'undefined' ? globalThis : window);

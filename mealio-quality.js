(function (root) {
  'use strict';

  const STOP_WORDS = new Set([
    'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'au', 'aux',
    'frais', 'fraiche', 'fraiches', 'bio', 'entier', 'entiere', 'en',
  ]);
  const ALIASES = {
    tomates: 'tomate', oeufs: 'oeuf', œufs: 'oeuf', pommes: 'pomme',
    patates: 'pomme terre', 'pommes terre': 'pomme terre',
    courgettes: 'courgette', carottes: 'carotte', oignons: 'oignon',
    poivrons: 'poivron', champignons: 'champignon', bananes: 'banane',
    avocats: 'avocat', yaourts: 'yaourt',
  };

  function cleanText(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[’']/g, ' ')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|mg|l|cl|ml|piece|pieces|tranche|tranches|pot|pots)?\b/g, ' ')
      .replace(/[^a-z0-9œ\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function canonicalFoodKey(value) {
    let text = cleanText(value)
      .split(' ').filter(word => !STOP_WORDS.has(word)).join(' ');
    if (ALIASES[text]) return ALIASES[text];
    text = text.split(' ').map(word => {
      if (ALIASES[word]) return ALIASES[word];
      if (word.length > 4 && word.endsWith('s')) return word.slice(0, -1);
      return word;
    }).join(' ');
    return ALIASES[text] || text;
  }

  function foodMatches(left, right) {
    const a = canonicalFoodKey(left);
    const b = canonicalFoodKey(right);
    if (!a || !b || a.length < 3 || b.length < 3) return false;
    if (a === b) return true;
    const aw = new Set(a.split(' '));
    const bw = new Set(b.split(' '));
    let common = 0;
    aw.forEach(word => { if (bw.has(word) && word.length > 2) common++; });
    return common >= Math.min(2, aw.size, bw.size);
  }

  function mergeDetectedFoods(items) {
    const merged = new Map();
    (Array.isArray(items) ? items : []).forEach(raw => {
      const name = String(raw.nom || raw.name || raw.label || '').trim();
      const key = canonicalFoodKey(name);
      if (!key || name.length < 2) return;
      const confidence = Math.max(0, Math.min(1, Number(raw.confiance ?? raw.confidence ?? 0.65)));
      if (!merged.has(key)) {
        merged.set(key, {
          nom: name, emoji: raw.emoji || '🥗',
          quantite: raw.quantite || raw.qty || raw.quantity || '',
          categorie: raw.categorie || raw.category || '',
          confidence,
        });
      } else {
        const current = merged.get(key);
        current.confidence = Math.max(current.confidence, confidence);
        if (!current.quantite && (raw.quantite || raw.qty || raw.quantity)) {
          current.quantite = raw.quantite || raw.qty || raw.quantity;
        }
      }
    });
    return [...merged.values()].sort((a, b) => b.confidence - a.confidence);
  }

  function scoreRecipeForFridge(recipe, fridgeItems) {
    const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    const relevant = ingredients
      .map(i => typeof i === 'string' ? i : (i?.name || ''))
      .filter(Boolean);
    const stock = (fridgeItems || []).map(i => typeof i === 'string' ? i : i?.name).filter(Boolean);
    const matched = relevant.filter(ingredient => stock.some(food => foodMatches(ingredient, food)));
    const missing = relevant.filter(ingredient => !stock.some(food => foodMatches(ingredient, food)));
    const ratio = relevant.length ? matched.length / relevant.length : 0;
    return {
      matched, missing, matchCount: matched.length,
      ratio, canCook: matched.length >= 2 && (missing.length <= 2 || ratio >= 0.65),
      score: Math.round((ratio * 80) + Math.min(matched.length, 5) * 4),
    };
  }

  function isValidBarcode(value) {
    const code = String(value || '').replace(/\D/g, '');
    if (![8, 12, 13, 14].includes(code.length)) return false;
    const digits = [...code].map(Number);
    const check = digits.pop();
    let sum = 0;
    for (let i = digits.length - 1, position = 0; i >= 0; i--, position++) {
      sum += digits[i] * (position % 2 === 0 ? 3 : 1);
    }
    return (10 - (sum % 10)) % 10 === check;
  }

  root.MealioQuality = {
    cleanText, escapeHtml, canonicalFoodKey, foodMatches, mergeDetectedFoods,
    scoreRecipeForFridge, isValidBarcode,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);

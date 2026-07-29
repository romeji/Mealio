(function () {
  'use strict';

  const SEASONS = {
    winter: { label: 'Hiver', emoji: '❄️', ingredients: ['poireau', 'carotte', 'chou', 'courge', 'endive', 'pomme de terre'] },
    spring: { label: 'Printemps', emoji: '🌱', ingredients: ['asperge', 'petit pois', 'épinard', 'radis', 'fraise', 'artichaut'] },
    summer: { label: 'Été', emoji: '☀️', ingredients: ['tomate', 'courgette', 'aubergine', 'poivron', 'concombre', 'melon'] },
    autumn: { label: 'Automne', emoji: '🍂', ingredients: ['potimarron', 'champignon', 'courge', 'poire', 'pomme', 'châtaigne'] },
  };

  function seasonForMonth(month) {
    if ([11, 0, 1].includes(month)) return 'winter';
    if ([2, 3, 4].includes(month)) return 'spring';
    if ([5, 6, 7].includes(month)) return 'summer';
    return 'autumn';
  }

  function dayKey() {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  }

  function stableNumber(text) {
    let hash = 2166136261;
    for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  }

  function dietCompatible(recipe) {
    const diet = state?.profile?.diet || 'omnivore';
    const habits = recipe.eatingHabits || {};
    if (diet === 'veg' || diet === 'vegetarian') return habits.vegetarian === true;
    if (diet === 'vegan') return habits.vegan === true;
    if (diet === 'pesc') return habits.pescatarian === true;
    if (diet === 'gluten') return habits.glutenFree === true;
    if (diet === 'halal') return habits.porkless === true;
    if (diet === 'keto') return habits.lowCarb === true || (recipe.carb > 0 && recipe.carb <= 20);
    return true;
  }

  function rank(recipe, season, seed) {
    const quality = window.MealioQuality;
    const text = [recipe.name, recipe.description, ...(recipe.tags || []),
      ...(recipe.ingredients || []).map(i => typeof i === 'string' ? i : i.name)].join(' ');
    const seasonHits = season.ingredients.filter(i => quality?.foodMatches(text, i)).length;
    const fridge = quality?.scoreRecipeForFridge(recipe, state.fridge || []) || { score: 0, matchCount: 0 };
    const likes = Math.max(0, Number(recipe.likes) || 0);
    const rating = Math.max(0, Number(recipe.rating) || 0);
    const popularity = Math.min(24, Math.log10(likes + 1) * 6 + rating * 2);
    const freshness = (stableNumber(`${seed}:${recipe.id}`) % 1000) / 1000 * 8;
    return {
      recipe, seasonHits, fridge,
      score: seasonHits * 20 + fridge.score * .35 + popularity + freshness,
      popularity,
    };
  }

  async function fetchDailyCandidates(season, force) {
    const rotation = Number(localStorage.getItem('frigoly_daily_rotation') || 0);
    const ingredient = season.ingredients[(stableNumber(dayKey()) + rotation) % season.ingredients.length];
    const cached = Object.values(window._jowCache || {}).filter(dietCompatible);
    if (!navigator.onLine && cached.length) return cached;
    try {
      const params = new URLSearchParams({ q: `${ingredient} recette`, limit: '18' });
      const response = await fetch(API_BASE + '/api/jow?' + params);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const fresh = (data.recipes || []).map(_jowNormalize).filter(dietCompatible);
      if (fresh.length) {
        fresh.forEach(_jowSaveRecipe);
        saveToGlobalDB(fresh).catch(() => {});
      }
      const seen = new Set(fresh.map(r => r.id));
      return fresh.concat(cached.filter(r => !seen.has(r.id)));
    } catch (_) {
      return cached;
    }
  }

  function render(items, season) {
    const root = document.getElementById('dailyRecipesGrid');
    const subtitle = document.getElementById('dailyRecipesSubtitle');
    if (!root) return;
    subtitle.textContent = `${season.emoji} ${season.label} · selon votre profil et votre frigo`;
    if (!items.length) {
      root.innerHTML = '<div class="daily-empty">Chargez quelques recettes en ligne : elles seront ensuite disponibles ici hors connexion.</div>';
      return;
    }
    const esc = window.MealioQuality?.escapeHtml || (v => String(v || ''));
    root.innerHTML = items.map(({ recipe:r, seasonHits, fridge, popularity }) => {
      const reason = fridge.matchCount
        ? `${fridge.matchCount} ingrédient${fridge.matchCount > 1 ? 's' : ''} déjà au frigo`
        : seasonHits ? 'Produits de saison' : 'Sélection du jour';
      const popular = popularity > 5 ? '<span class="daily-pill">🔥 Appréciée</span>' : '';
      return `<article class="daily-card" tabindex="0" role="button" data-recipe-id="${esc(r.id)}"
        onclick="openDailyRecipe(this.dataset.recipeId)" onkeydown="if(event.key==='Enter')openDailyRecipe(this.dataset.recipeId)">
        <button type="button" class="recipe-heart ${(state.recipeBookmarks||[]).some(b=>b.id===r.id)?'on':''}" data-recipe-id="${esc(r.id)}"
          onclick="event.stopPropagation();toggleBookmark(this.dataset.recipeId);this.classList.toggle('on')" aria-label="Ajouter aux favoris">♡</button>
        ${r.photo ? `<img src="${esc(r.photo)}" alt="" loading="lazy">` : '<div class="daily-placeholder">🍲</div>'}
        <div class="daily-body">
          <div class="daily-title">${esc(r.name)}</div>
          <div class="daily-reason">${esc(reason)}</div>
          <div class="daily-meta">${r.time ? `<span>⏱ ${Number(r.time)} min</span>` : ''}${popular}</div>
        </div>
      </article>`;
    }).join('');
  }

  async function loadDailyRecipes(force = false) {
    const root = document.getElementById('dailyRecipesGrid');
    if (!root || root.dataset.loading === '1') return;
    root.dataset.loading = '1';
    root.innerHTML = '<div class="daily-loading">Création de votre sélection du jour…</div>';
    const season = SEASONS[seasonForMonth(new Date().getMonth())];
    const candidates = await fetchDailyCandidates(season, force);
    const ranked = candidates.filter(dietCompatible)
      .map(r => rank(r, season, dayKey()))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    render(ranked, season);
    root.dataset.loading = '0';
  }

  function refreshDailyRecipes() {
    const value = Number(localStorage.getItem('frigoly_daily_rotation') || 0) + 1;
    localStorage.setItem('frigoly_daily_rotation', String(value % 12));
    loadDailyRecipes(true);
  }

  function openDailyRecipe(id) {
    const recipe = window._jowCache?.[id];
    if (!recipe) return;
    if (recipe.source === 'jow' && typeof _openJowRecipe === 'function') return _openJowRecipe(id);
    window._currentRecipe = recipe;
    if (typeof renderRecipeModal === 'function') {
      renderRecipeModal(recipe, recipe.portions || 4, false);
      document.getElementById('recipeDetailModal')?.parentElement?.classList.add('on');
    }
  }

  window.loadDailyRecipes = loadDailyRecipes;
  window.refreshDailyRecipes = refreshDailyRecipes;
  window.openDailyRecipe = openDailyRecipe;
  window.addEventListener('DOMContentLoaded', () => setTimeout(loadDailyRecipes, 500));
})();

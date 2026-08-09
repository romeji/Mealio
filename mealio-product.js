/* Mealio — cohérence produit et continuité des parcours */
(function () {
  'use strict';

  const DIET_LABELS = {
    omnivore: 'Omnivore', veg: 'Végétarien', vegan: 'Vegan', pesc: 'Pescétarien',
    gluten: 'Sans gluten', keto: 'Keto', halal: 'Sans porc'
  };
  const SLOT_LABELS = { b:'Petit-déjeuner', l:'Déjeuner', d:'Dîner', snack:'Collation' };
  const DAY_LABELS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function plannedMeals() {
    const meals = [];
    Object.entries(state.weekMenu || {}).forEach(([day, menu]) => {
      if(!menu) return;
      Object.keys(SLOT_LABELS).forEach(slot => {
        if(menu[slot]) meals.push({day:Number(day), slot, name:menu[slot], data:menu[slot+'Data'] || {}});
      });
    });
    return meals;
  }

  function ingredientName(ingredient) {
    return String(typeof ingredient === 'string' ? ingredient : (ingredient?.name || ingredient?.ingredientName || '')).trim();
  }

  function fridgeMatch(name) {
    const key = normalize(name);
    if(!key) return null;
    const first = key.split(' ')[0];
    return (state.fridge || []).find(item => {
      const candidate = normalize(item.name);
      if(!candidate) return false;
      const candidateFirst = candidate.split(' ')[0];
      return candidate === key || candidate.includes(key) || key.includes(candidate) || (first.length > 3 && first === candidateFirst);
    }) || null;
  }

  function weekIngredients() {
    const grouped = new Map();
    plannedMeals().forEach(meal => {
      (meal.data.ingredients || []).forEach(ingredient => {
        const name = ingredientName(ingredient);
        const key = normalize(name);
        if(!key) return;
        const quantity = typeof ingredient === 'object'
          ? [ingredient.quantity || ingredient.qty || '', ingredient.unit || ''].filter(Boolean).join(' ').trim()
          : '';
        if(!grouped.has(key)) grouped.set(key, {key,name,quantities:[],mealRefs:[],inFridge:null});
        const entry = grouped.get(key);
        if(quantity && !entry.quantities.includes(quantity)) entry.quantities.push(quantity);
        entry.mealRefs.push({day:meal.day,slot:meal.slot,recipe:meal.name});
      });
    });
    return [...grouped.values()].map(entry => ({...entry,inFridge:fridgeMatch(entry.name)}));
  }

  function summary() {
    const meals = plannedMeals();
    const ingredients = weekIngredients();
    const uniqueRecipes = new Set(meals.map(meal => meal.data.recipeId || normalize(meal.name)).filter(Boolean));
    const totalKcal = meals.reduce((sum, meal) => sum + (Number(meal.data.kcal) || 0), 0);
    const estimatedBudget = meals.reduce((sum, meal) => {
      const portions = Number(state.profile?.portions || state.profile?.people || 2);
      return sum + (Number(meal.data.pricePerPortionEuro || meal.data.price) || 0) * portions;
    }, 0);
    return {
      meals, ingredients, uniqueRecipes:uniqueRecipes.size, totalKcal, estimatedBudget,
      missing:ingredients.filter(item => !item.inFridge), available:ingredients.filter(item => item.inFridge)
    };
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if(element) element.textContent = value;
  }

  function currentDiet() {
    return state.menuGenerationDiet || state.profile?.diet || 'omnivore';
  }

  function updateMenu() {
    const data = summary();
    setText('menuV5Meals', data.meals.length);
    setText('menuV5Recipes', data.uniqueRecipes);
    setText('menuV5Kcal', data.totalKcal ? data.totalKcal.toLocaleString('fr-FR') : 0);
    setText('menuV5Ingredients', data.ingredients.length);

    const workspace = document.getElementById('menuWeekWorkspaceV4');
    if(workspace) {
      let flow = document.getElementById('menuFlowV6');
      if(!flow) {
        flow = document.createElement('section');
        flow.id = 'menuFlowV6';
        flow.className = 'menu-flow-v6';
        const summaryCard = workspace.querySelector('.menu-summary-v5');
        summaryCard?.insertAdjacentElement('afterend', flow);
      }
      const plannedDays = new Set(data.meals.map(meal => meal.day)).size;
      flow.innerHTML = data.meals.length
        ? `<div><i data-lucide="circle-check-big"></i><span><strong>${plannedDays}/7 jours organisés</strong><small>${data.available.length} ingrédient${data.available.length>1?'s':''} déjà au frigo · ${data.missing.length} à prévoir</small></span></div>`
        : `<div><i data-lucide="calendar-plus"></i><span><strong>Votre semaine est encore vide</strong><small>Générez une proposition ou ajoutez vos repas manuellement.</small></span></div>`;
    }

    let action = 'generate';
    let label = 'Générer ma semaine';
    let icon = 'sparkles';
    const plannedDays = new Set(data.meals.map(meal => meal.day)).size;
    if(data.meals.length && plannedDays < 7) { action='complete'; label='Compléter ma semaine'; icon='calendar-plus'; }
    else if(data.meals.length && data.missing.length) { action='shopping'; label=`Ajouter ${data.missing.length} manquant${data.missing.length>1?'s':''}`; icon='shopping-basket'; }
    else if(data.meals.length) { action='view-list'; label='Voir ma liste'; icon='list-checks'; }
    const primary = document.getElementById('menuPrimaryV6');
    if(primary) {
      primary.dataset.action = action;
      setText('menuPrimaryLabelV6', label);
      const iconElement = primary.querySelector('svg');
      if(iconElement) iconElement.outerHTML = `<i data-lucide="${icon}"></i>`;
    }

    const settings = typeof _readMenuFilterSettings === 'function' ? _readMenuFilterSettings() : {};
    const parts = [DIET_LABELS[currentDiet()] || currentDiet()];
    if(settings.maxTime) parts.push(`≤ ${settings.maxTime} min`);
    if(settings.weekBudget) parts.push(`${settings.weekBudget} €`);
    if(settings.selectedAllergens?.length) parts.push(`${settings.selectedAllergens.length} allergène${settings.selectedAllergens.length>1?'s':''}`);
    setText('menuFilterSummaryV6', parts.join(' · '));
    document.querySelectorAll('#dietChips .diet-chip').forEach(chip => chip.classList.toggle('on', chip.dataset.v === currentDiet()));

    if(window.lucide?.createIcons) window.lucide.createIcons({attrs:{'aria-hidden':'true','stroke-width':2}});
  }

  function handleMenuPrimaryAction() {
    const action = document.getElementById('menuPrimaryV6')?.dataset.action || 'generate';
    if(action === 'generate' || action === 'complete') return generateAIMenuFull();
    if(action === 'shopping') return showWeekIngredientSheet();
    switchTab('liste');
    switchSubtab('tobuy');
  }

  function showWeekIngredientSheet() {
    document.getElementById('weekIngredientsSheetV6')?.remove();
    const data = summary();
    const overlay = document.createElement('div');
    overlay.id = 'weekIngredientsSheetV6';
    overlay.className = 'mealio-sheet-v6 on';
    overlay.innerHTML = `<section class="mealio-sheet-panel-v6" role="dialog" aria-modal="true" aria-labelledby="weekIngredientsTitleV6">
      <header><div><strong id="weekIngredientsTitleV6">Préparer mes courses</strong><small>${data.ingredients.length} ingrédients · ${data.available.length} déjà au frigo</small></div><button type="button" data-close-sheet aria-label="Fermer">×</button></header>
      <div class="mealio-sheet-body-v6">
        ${data.missing.length ? `<div class="sheet-section-title-v6">À ajouter à la liste (${data.missing.length})</div>${data.missing.map((item,index)=>`<label class="ingredient-choice-v6"><input type="checkbox" data-week-ingredient="${index}" checked><span><strong>${escapeHtml(item.name)}</strong><small>${item.quantities.join(' · ') || item.mealRefs.map(ref=>DAY_LABELS[ref.day-1]).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}</small></span></label>`).join('')}` : '<div class="sheet-success-v6">Vous avez déjà tous les ingrédients nécessaires.</div>'}
        ${data.available.length ? `<details class="sheet-available-v6"><summary>Déjà dans mon frigo (${data.available.length})</summary>${data.available.map(item=>`<div>${escapeHtml(item.name)}</div>`).join('')}</details>` : ''}
      </div>
      <footer><button type="button" class="btn" data-close-sheet>Annuler</button><button type="button" class="btn acc" onclick="MealioProduct.confirmWeekIngredients()">Ajouter à Ma liste</button></footer>
    </section>`;
    overlay.addEventListener('click', event => {
      if(event.target === overlay || event.target.closest('[data-close-sheet]')) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function confirmWeekIngredients() {
    const missing = summary().missing;
    let added = 0, updated = 0;
    document.querySelectorAll('[data-week-ingredient]:checked').forEach(input => {
      const ingredient = missing[Number(input.dataset.weekIngredient)];
      if(!ingredient) return;
      const existing = (state.items||[]).find(item => !item.checked && normalize(item.name) === ingredient.key);
      if(existing) {
        existing.mealRefs = [...(existing.mealRefs||[]), ...ingredient.mealRefs];
        existing.source = existing.source === 'manual' ? 'manual+menu' : (existing.source || 'menu');
        updated++;
      } else {
        const catalog = typeof PRODUCTS !== 'undefined' ? PRODUCTS : (window.PRODUCTS || []);
        const product = catalog.find(item => normalize(item.name) === ingredient.key);
        state.items.unshift({
          id:'i'+Date.now()+Math.random().toString(36).slice(2,7), name:ingredient.name,
          emoji:product?.emoji || '🛒', cat:product?.cat || '🍝 Épicerie', price:product?.price || 0,
          qty:ingredient.quantities.join(' + '), checked:false, status:'needed', source:'menu',
          sourceLabel:'Menu de la semaine', mealRefs:ingredient.mealRefs, addedAt:Date.now(),
          addedBy:currentUser ? (currentUser.displayName || currentUser.email) : ''
        });
        added++;
      }
    });
    if(typeof saveItems === 'function') saveItems(); else saveState();
    if(typeof renderList === 'function') renderList();
    document.getElementById('weekIngredientsSheetV6')?.remove();
    window.MealioNotifications?.emit('shopping_batch_added', {count:added+updated}, 'shopping_batch_added_'+Date.now());
    showToast('🛒', `${added} ajouté${added>1?'s':''}${updated?' · '+updated+' déjà présent'+(updated>1?'s':''):''}`, 'La liste est prête pour les courses.');
    switchTab('liste');
    switchSubtab('tobuy');
  }

  function updateHome() {
    const data = summary();
    const pending = (state.items||[]).filter(item => !item.checked).length;
    const title = document.getElementById('homeReadyTitleV6');
    const text = document.getElementById('homeReadyTextV6');
    if(!title || !text) return;
    if(!data.meals.length) {
      homeNextAction = 'menu';
      title.textContent = 'Prêt à gagner du temps ?';
      text.textContent = 'Générez votre menu de la semaine en un clic.';
    } else if(data.missing.length && !pending) {
      homeNextAction = 'menu';
      title.textContent = `${data.missing.length} ingrédient${data.missing.length>1?'s':''} à prévoir`;
      text.textContent = 'Préparez la liste à partir de votre semaine.';
    } else if(pending) {
      homeNextAction = 'list';
      title.textContent = 'Votre liste est prête';
      text.textContent = `${pending} article${pending>1?'s':''} à acheter.`;
    } else {
      homeNextAction = 'menu';
      title.textContent = 'Votre semaine est organisée';
      text.textContent = 'Consultez vos repas et remplacez une recette si besoin.';
    }
  }

  function updateScanPurpose(tab) {
    const box = document.getElementById('scanPurposeV6');
    if(!box) return;
    const copy = {
      ticket:['Importer mes achats','Photographiez un ticket puis vérifiez les produits avant de les ajouter.'],
      barcode:['Identifier un produit','Scannez son code-barres, vérifiez les informations puis choisissez sa destination.'],
      fridge:['Remplir mon frigo','Photographiez vos aliments, corrigez la détection puis validez l’inventaire.']
    }[tab] || [];
    box.innerHTML = `<strong>${copy[0]||''}</strong><span>${copy[1]||''}</span>`;
  }

  function estimatedExpiry(item) {
    const explicit = item.expiryDate || item.expiresAt || item.expiry || item.bestBefore;
    if(explicit) {
      const time = explicit?.toDate ? explicit.toDate().getTime() : new Date(explicit).getTime();
      if(Number.isFinite(time)) return time;
    }
    const added = Number(item.addedAt) || Date.now();
    const hay = normalize((item.cat||'')+' '+(item.name||''));
    let days = 14;
    if(/viande|poisson|saumon|poulet|boeuf|porc/.test(hay)) days=3;
    else if(/legume|fruit|salade|epinard/.test(hay)) days=6;
    else if(/lait|yaourt|creme|fromage/.test(hay)) days=10;
    else if(/congele|surgel/.test(hay)) days=90;
    else if(/epicerie|pate|riz|conserve/.test(hay)) days=180;
    return added + days*86400000;
  }

  function closeSheet() {
    document.querySelectorAll('.mealio-sheet-v6').forEach(sheet => sheet.remove());
    document.body.classList.remove('mealio-sheet-open');
  }

  function showShoppingCompletion(checked) {
    closeSheet();
    const overlay = document.createElement('div');
    overlay.className = 'mealio-sheet-v6 on';
    overlay.innerHTML = `<section class="mealio-sheet-panel-v6 shopping-completion-v6" role="dialog" aria-modal="true" aria-labelledby="shoppingCompleteTitleV6">
      <header><div><strong id="shoppingCompleteTitleV6">Terminer les courses</strong><small>${checked.length} article${checked.length>1?'s':''} dans le chariot</small></div><button type="button" data-close-sheet aria-label="Fermer">×</button></header>
      <div class="mealio-sheet-body-v6">
        <p class="sheet-lead-v6">Que souhaitez-vous faire des produits achetés ? La session sera enregistrée dans l’historique dans les deux cas.</p>
        <button type="button" class="completion-choice-v6 primary" onclick="completeShopping(true)"><i data-lucide="refrigerator"></i><span><strong>Ranger dans mon frigo</strong><small>Met à jour automatiquement mes stocks</small></span><i data-lucide="chevron-right"></i></button>
        <button type="button" class="completion-choice-v6" onclick="completeShopping(false)"><i data-lucide="history"></i><span><strong>Historique uniquement</strong><small>Ne modifie pas les stocks du frigo</small></span><i data-lucide="chevron-right"></i></button>
      </div>
    </section>`;
    overlay.addEventListener('click', event => {
      if(event.target === overlay || event.target.closest('[data-close-sheet]')) closeSheet();
    });
    document.body.appendChild(overlay);
    document.body.classList.add('mealio-sheet-open');
    window.lucide?.createIcons?.({attrs:{'aria-hidden':'true','stroke-width':2}});
  }

  function consumeFridgeItem(id) {
    const item = (state.fridge||[]).find(entry => String(entry.id) === String(id));
    if(!item) return;
    const qty = Number(item.qty) || 1;
    if(qty > 1) item.qty = qty - 1;
    else state.fridge = state.fridge.filter(entry => String(entry.id) !== String(id));
    if(typeof saveFridge === 'function') saveFridge(); else saveState();
    renderFridge?.();
    closeSheet();
    showToast('✓', item.name, qty > 1 ? 'Quantité diminuée.' : 'Produit retiré du frigo.');
  }

  function moveFridgeItemToList(id) {
    const item = (state.fridge||[]).find(entry => String(entry.id) === String(id));
    if(!item) return;
    if(!(state.items||[]).some(entry => !entry.checked && normalize(entry.name) === normalize(item.name))) {
      state.items.unshift({id:'i'+Date.now()+Math.random().toString(36).slice(2,7),name:item.name,emoji:item.emoji||'🛒',cat:item.cat||'🍝 Épicerie',price:0,qty:'',checked:false,status:'needed',source:'fridge',addedAt:Date.now()});
      saveItems?.();
      renderList?.();
    }
    closeSheet();
    showToast('🛒', item.name, 'Ajouté à Ma liste.');
  }

  const PROFILE_SECTION_IDS = {
    budget:'profileBudgetSectionV6', appearance:'profileAppearanceSectionV6',
    personal:'profilePersonalSectionV6', food:'profileFoodSectionV6'
  };

  function openProfileSection(section) {
    const targetId = PROFILE_SECTION_IDS[section];
    if(!targetId) return;
    document.getElementById('profileModalInner')?.classList.add('profile-detail-open-v6');
    document.querySelectorAll('.profile-detail-v6').forEach(element => element.classList.toggle('active', element.id === targetId || element.id === 'profileSaveV6' || (section === 'appearance' && element.id === 'profileThemePickerV6')));
    const labels={budget:'Budget & prix',appearance:'Apparence',personal:'Informations personnelles',food:'Régime & objectifs'};
    const label=document.getElementById('profileBackLabelV6');
    if(label) label.textContent='Retour aux paramètres · '+labels[section];
    const modal=document.getElementById('profileModalInner');
    if(modal) modal.scrollTop=0;
    window.lucide?.createIcons?.({attrs:{'aria-hidden':'true','stroke-width':2}});
  }

  function closeProfileSection() {
    document.getElementById('profileModalInner')?.classList.remove('profile-detail-open-v6');
    document.querySelectorAll('.profile-detail-v6').forEach(element => element.classList.remove('active'));
    const modal=document.getElementById('profileModalInner');
    if(modal) modal.scrollTop=0;
  }

  function openChoiceSettings(kind, choices) {
    closeSheet();
    const selected = new Set(kind === 'allergies' ? (state.selectedAllergens||[]) : (state.profile?.equipment||[]));
    const title = kind === 'allergies' ? 'Allergies et exclusions' : 'Mes équipements';
    const subtitle = kind === 'allergies' ? 'Ces choix filtrent la génération et la recherche.' : 'Les recettes proposées tiendront compte de votre cuisine.';
    const overlay = document.createElement('div');
    overlay.className='mealio-sheet-v6 on';
    overlay.innerHTML=`<section class="mealio-sheet-panel-v6" role="dialog" aria-modal="true"><header><div><strong>${title}</strong><small>${subtitle}</small></div><button type="button" data-close-sheet aria-label="Fermer">×</button></header><div class="mealio-sheet-body-v6 choice-grid-v6">${choices.map(choice=>`<label class="choice-card-v6"><input type="checkbox" value="${choice.id}" ${selected.has(choice.id)?'checked':''}><i data-lucide="${choice.icon}"></i><span>${choice.label}</span></label>`).join('')}</div><footer><button type="button" class="btn" data-close-sheet>Annuler</button><button type="button" class="btn acc" data-save-choice>Enregistrer</button></footer></section>`;
    overlay.addEventListener('click',event=>{
      if(event.target===overlay || event.target.closest('[data-close-sheet]')) closeSheet();
      if(event.target.closest('[data-save-choice]')) {
        const values=[...overlay.querySelectorAll('input:checked')].map(input=>input.value);
        if(kind==='allergies') state.selectedAllergens=values;
        else state.profile={...(state.profile||{}),equipment:values};
        saveState();
        if(typeof syncToFirestore==='function') syncToFirestore(kind==='allergies'?'allergens':'profile',kind==='allergies'?values:state.profile).catch(()=>{});
        closeSheet(); updateMenu();
        showToast('✓',title,'Préférences enregistrées.');
      }
    });
    document.body.appendChild(overlay); document.body.classList.add('mealio-sheet-open');
    window.lucide?.createIcons?.({attrs:{'aria-hidden':'true','stroke-width':1.8}});
  }

  function openAllergySettings() {
    openChoiceSettings('allergies',[
      {id:'gluten',label:'Gluten',icon:'wheat-off'},{id:'lactose',label:'Lactose',icon:'milk-off'},
      {id:'nuts',label:'Fruits à coque',icon:'nut-off'},{id:'egg',label:'Œufs',icon:'egg-off'},
      {id:'shellfish',label:'Crustacés',icon:'shell'},{id:'soy',label:'Soja',icon:'sprout'}
    ]);
  }

  function openEquipmentSettings() {
    openChoiceSettings('equipment',[
      {id:'oven',label:'Four',icon:'cooking-pot'},{id:'microwave',label:'Micro-ondes',icon:'microwave'},
      {id:'hob',label:'Plaques',icon:'circle-dot'},{id:'mixer',label:'Mixeur',icon:'blender'},
      {id:'processor',label:'Robot cuiseur',icon:'cooking-pot'},{id:'airfryer',label:'Air fryer',icon:'heater'}
    ]);
  }

  function recipeAvailability(recipe) {
    const ingredients = (recipe?._baseIngredients || recipe?.ingredients || []).map(ingredientName).filter(Boolean);
    const available = ingredients.filter(name => fridgeMatch(name));
    const missing = ingredients.filter(name => !fridgeMatch(name));
    return {ingredients,available,missing};
  }

  function augmentRecipe(recipe) {
    const modal = document.getElementById('recipeDetailModal');
    if(!modal || !recipe) return;
    const availability = recipeAvailability(recipe);
    const anchor = modal.querySelector('#ingrTitle');
    if(anchor && !document.getElementById('recipeAvailabilityV6')) {
      const card = document.createElement('section');
      card.id = 'recipeAvailabilityV6';
      card.className = 'recipe-availability-v6';
      card.innerHTML = availability.ingredients.length
        ? `<div><i data-lucide="refrigerator"></i><span><strong>${availability.available.length}/${availability.ingredients.length} ingrédients disponibles</strong><small>${availability.missing.length ? availability.missing.length+' à ajouter à la liste' : 'Vous avez tout ce qu’il faut'}</small></span></div>${availability.missing.length?'<button type="button" onclick="MealioProduct.addRecipeMissingToList()">Ajouter les manquants</button>':''}`
        : '<div><i data-lucide="info"></i><span><strong>Ingrédients à vérifier</strong><small>La disponibilité ne peut pas être calculée pour cette recette.</small></span></div>';
      anchor.insertAdjacentElement('beforebegin', card);
    }
    const actions = modal.querySelector('div[style*="position:sticky"]');
    if(actions && !actions.querySelector('[data-cook-recipe]')) {
      const cook = document.createElement('button');
      cook.type='button'; cook.dataset.cookRecipe='1'; cook.className='btn recipe-cook-v6';
      cook.textContent='✓ Cuisinée'; cook.onclick=()=>markRecipeCooked(recipe);
      actions.insertBefore(cook, actions.firstChild);
    }
    if(window.lucide?.createIcons) window.lucide.createIcons({attrs:{'aria-hidden':'true','stroke-width':2}});
  }

  function addRecipeMissingToList() {
    const recipe = window._currentRecipe;
    if(!recipe) return;
    const missing = recipeAvailability(recipe).missing;
    let added = 0;
    missing.forEach(name => {
      if((state.items||[]).some(item => !item.checked && normalize(item.name) === normalize(name))) return;
      state.items.unshift({id:'i'+Date.now()+Math.random().toString(36).slice(2,7),name,emoji:'🛒',cat:'🍝 Épicerie',price:0,qty:'',checked:false,status:'needed',source:'recipe',sourceLabel:recipe.name,recipeId:recipe.id,addedAt:Date.now()});
      added++;
    });
    if(typeof saveItems==='function') saveItems();
    if(typeof renderList==='function') renderList();
    showToast('🛒', `${added} ingrédient${added>1?'s':''} ajouté${added>1?'s':''}`, 'Depuis cette recette.');
  }

  function markRecipeCooked(recipe) {
    const availability = recipeAvailability(recipe);
    const consume = () => {
      availability.available.forEach(name => {
        const item = fridgeMatch(name);
        if(!item) return;
        const qty = Number(item.qty)||1;
        if(qty>1) item.qty=qty-1;
        else state.fridge=state.fridge.filter(candidate=>candidate.id!==item.id);
      });
      state.cookedRecipes = state.cookedRecipes || [];
      state.cookedRecipes.unshift({id:recipe.id,name:recipe.name,cookedAt:Date.now()});
      state.cookedRecipes=state.cookedRecipes.slice(0,100);
      if(typeof saveFridge==='function') saveFridge(); else saveState();
      if(typeof renderFridge==='function') renderFridge();
      window.MealioNotifications?.emit('recipe_cooked',{recipeName:recipe.name},'recipe_cooked_'+Date.now());
      showToast('👨‍🍳','Recette cuisinée',`${availability.available.length} stock${availability.available.length>1?'s':''} mis à jour.`);
    };
    if(typeof confirm2==='function') confirm2('👨‍🍳','Marquer comme cuisinée',`Mettre à jour ${availability.available.length} produit${availability.available.length>1?'s':''} du frigo ?`,consume);
    else consume();
  }

  function escapeHtml(value) {
    return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function wrap(name, after) {
    const original = window[name];
    if(typeof original !== 'function' || original._mealioProductWrapped) return;
    const wrapped = function(...args) {
      const result = original.apply(this,args);
      Promise.resolve(result).finally(()=>after(...args));
      return result;
    };
    wrapped._mealioProductWrapped=true;
    window[name]=wrapped;
  }

  function init() {
    state.profile = state.profile || {diet:'omnivore'};
    state.menuGenerationDiet = state.menuGenerationDiet || null;
    state.selectedDiet = [currentDiet()];
    wrap('renderWeek',updateMenu);
    wrap('updateHomeHub',updateHome);
    wrap('renderRecipeModal',augmentRecipe);
    wrap('switchScanTab',updateScanPurpose);
    wrap('renderList',updateHome);
    wrap('openProfile',closeProfileSection);
    updateMenu(); updateHome(); updateScanPurpose('ticket');
  }

  window.MealioProduct = {
    init, summary, weekIngredients, updateMenu, updateHome, updateScanPurpose,
    handleMenuPrimaryAction, showWeekIngredientSheet, confirmWeekIngredients,
    estimatedExpiry, recipeAvailability, addRecipeMissingToList, markRecipeCooked,
    closeSheet, showShoppingCompletion, consumeFridgeItem, moveFridgeItemToList,
    openProfileSection, closeProfileSection, openAllergySettings, openEquipmentSettings
  };
  window.addEventListener('DOMContentLoaded',()=>setTimeout(init,900));
})();

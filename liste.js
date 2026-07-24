/* FRIGOLY — MODULE LISTE */
// LISTE
// ═══════════════════════════════════════════════
const CATEGORIES = ['🥛 Laitage','🥩 Viande','🥦 Légumes','🍎 Fruits','🥖 Boulangerie','🐟 Poisson','🧴 Hygiène','🧹 Ménager','🍝 Épicerie','🥤 Boissons','🐾 Animaux'];

function getFilteredItems() {
  let items = state.items.filter(i => !i.checked);
  if(state.filterCat !== 'all') items = items.filter(i => i.cat === state.filterCat);
  if(state.sortAZ) items = [...items].sort((a,b) => a.name.localeCompare(b.name));
  return items;
}

function renderList() {
  const items = getFilteredItems();
  const wrap = document.getElementById('itemsWrap');
  const empty = document.getElementById('emptyState');
  const showPrix = !state.profile || state.profile.showPrix !== false;
  const total = state.items.length;
  const checked = state.items.filter(i => i.checked).length;
  const budgetUsed = state.items.reduce((s,i) => s + (i.price || 0), 0);
  const weekBudget = state.budget || 80;
  if(typeof updateHomeHub === 'function') updateHomeHub();

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statCoche').textContent = checked;

  // Stat budget — masqué si prix désactivés
  const statBudgetEl = document.getElementById('statBudget');
  const statBudgetCard = statBudgetEl ? statBudgetEl.closest('.ls-p') : null;
  if(statBudgetCard) statBudgetCard.style.display = showPrix ? '' : 'none';
  if(statBudgetEl) statBudgetEl.textContent = budgetUsed.toFixed(0) + '€';

  document.getElementById('lgSub').textContent = items.length + ' article' + (items.length !== 1 ? 's' : '') + ' à acheter';
  document.getElementById('toBuyLabel').textContent = 'À acheter (' + items.length + ')';

  // Barre de budget — masquée si prix désactivés
  const budgetBarWrap = document.querySelector('.budget-bar-wrap');
  if(budgetBarWrap) budgetBarWrap.style.display = showPrix ? '' : 'none';

  if(showPrix) {
    const pct = Math.min(100, Math.round(budgetUsed / weekBudget * 100));
    const fill = document.getElementById('bbFill');
    if(fill) {
      fill.style.width = pct + '%';
      fill.style.background = pct > 90 ? 'linear-gradient(90deg,#e17055,#d63031)' : pct > 70 ? 'linear-gradient(90deg,#f0b429,#e17055)' : 'var(--grad)';
    }
    const lbl = document.getElementById('bbLbl');
    if(lbl) lbl.textContent = budgetUsed.toFixed(2).replace('.',',') + '€ / ' + weekBudget + '€ semaine';
  }

  if(!items.length) {
    if(wrap) wrap.innerHTML = '';
    if(empty) empty.style.display = 'block';
    return;
  }
  if(empty) empty.style.display = 'none';
  if(wrap) { wrap.innerHTML = items.map(item => itemHTML(item)).join(''); attachSwipe(); }
}

function getMemberBadgeColor(addedBy) {
  if(!addedBy) return '#888';
  // Use a hash of the name to assign a stable color
  let hash = 0;
  for(let i=0;i<addedBy.length;i++) hash = addedBy.charCodeAt(i)+((hash<<5)-hash);
  // Pick from palette: warm (F indicator) vs cool (H)
  const warmColors = ['#e84393','#e74c3c','#e67e22','#9b59b6','#ff6b9d'];
  const coolColors = ['#3498db','#2ecc71','#1abc9c','#27ae60','#2980b9'];
  // Try to detect gender from profile if it's the current user
  const isSelf = currentUser && (addedBy === currentUser.email || addedBy === (currentUser.displayName||''));
  let palette;
  if(isSelf && state.profile && state.profile.sex) {
    palette = state.profile.sex === 'F' ? warmColors : (state.profile.sex === 'H' ? coolColors : warmColors);
  } else {
    // default: alternate by hash
    palette = Math.abs(hash) % 2 === 0 ? warmColors : coolColors;
  }
  return palette[Math.abs(hash) % palette.length];
}

function getMemberInitial(addedBy) {
  if(!addedBy) return '?';
  return (addedBy.split('@')[0] || addedBy).charAt(0).toUpperCase();
}

function itemHTML(item) {
  const showPrice = state.profile && state.profile.showPrix !== false;
  const memberColor = item.addedBy ? getMemberBadgeColor(item.addedBy) : null;
  const memberInitial = item.addedBy ? getMemberInitial(item.addedBy) : null;
  return `<div class="item-wrap" data-id="${item.id}">
    <div class="item-delete-bg"><div class="delbg-icon">🗑️<br><span style="font-size:.6rem;font-weight:700;">Supprimer</span></div></div>
    <div class="item" data-id="${item.id}">
      <div class="chk${item.checked?' on':''}" onclick="event.stopPropagation();toggleCheck('${item.id}')">
        ${item.checked?'<svg width="14" height="14" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}
      </div>
      <div class="i-em">${item.emoji||'🛒'}</div>
      <div class="i-info">
        <div class="inm">${item.name}</div>
        ${item.qty?`<div class="imeta"><span style="color:var(--tl);font-weight:700;">${item.qty}</span></div>`:''}
      </div>
      <div class="i-r">
        ${showPrice && item.price?`<span class="ipr">${item.price.toFixed(2)}€</span>`:''}
        ${state.houseId && memberColor?`<div title="Ajouté par ${item.addedBy||'?'}" style="width:22px;height:22px;border-radius:50%;background:${memberColor};display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:800;color:#fff;flex-shrink:0;">${memberInitial}</div>`:''}
        <button class="btn ghost sm" style="padding:4px 6px;color:var(--tx3);" onclick="event.stopPropagation();openEdit('${item.id}')">✏️</button>
        <button class="btn ghost sm" style="padding:4px 6px;color:var(--rd);" onclick="event.stopPropagation();deleteItem('${item.id}')">🗑</button>
      </div>
    </div>
  </div>`;
}

function toggleCheck(id) {
  const item = state.items.find(i => i.id === id);
  if(!item) return;
  const shoppingWasIdle = !state.items.some(i => i.checked);
  item.checked = !item.checked;
  item.checkedAt = item.checked ? Date.now() : null;
  saveItems();
  renderList();
  if(state.currentSubtab === 'cart') renderCart();
  if(item.checked && shoppingWasIdle) {
    window.MealioNotifications?.emit('shopping_started', {}, 'shopping_started_' + new Date().toISOString().slice(0,10));
  }
}

function addItemFromInput() {
  const inp = document.getElementById('addInput');
  const val = inp.value.trim();
  if(!val) return;
  const existing = state.items.find(i => i.name.toLowerCase() === val.toLowerCase() && !i.checked);
  if(existing) {
    const cur = existing.qty ? parseInt(existing.qty) || 1 : 1;
    confirm2('🔄', val + ' est déjà dans la liste', 'Quantité actuelle: ' + (existing.qty || '1') + '. Mettre à jour?', () => {
      existing.qty = String(cur + 1);
      saveItems(); renderList();
      showToast('🔄', val, 'Quantité mise à jour.');
    });
    inp.value = '';
    document.getElementById('acList').style.display = 'none';
    return;
  }
  const prod = PRODUCTS.find(p => p.name.toLowerCase() === val.toLowerCase());
  const item = {
    id: 'i' + Date.now() + Math.random().toString(36).slice(2,7),
    name: prod ? prod.name : val,
    emoji: prod ? prod.emoji : '🛒',
    cat: prod ? prod.cat : '🍝 Épicerie',
    price: prod ? prod.price : 0,
    qty: '', checked: false, addedAt: Date.now(),
    addedBy: currentUser ? (currentUser.displayName || currentUser.email) : 'Inconnu'
  };
  state.items.unshift(item);
  saveItems();
  window.MealioNotifications?.emit('item_added', {itemName:item.name}, 'item_added_' + item.id);
  inp.value = '';
  document.getElementById('acList').style.display = 'none';
  renderList();
  showToast('✅', item.name, 'Ajouté à votre liste.');
}

function addItemByName(name) {
  const prod = PRODUCTS.find(p => p.name.toLowerCase() === name.toLowerCase()) || {name, emoji:'🛒', cat:'🍝 Épicerie', price:0};
  const ex = state.items.find(i => i.name.toLowerCase() === name.toLowerCase() && !i.checked);
  if(ex) { ex.qty = String((parseInt(ex.qty)||1) + 1); saveItems(); renderList(); showToast('🔄', name, 'Quantité +1'); return; }
  const item = {id:'i'+Date.now()+Math.random().toString(36).slice(2,7),name:prod.name,emoji:prod.emoji,cat:prod.cat,price:prod.price,qty:'',checked:false,addedAt:Date.now(),addedBy:currentUser?currentUser.email:''};
  state.items.unshift(item);
  saveItems(); renderList();
  window.MealioNotifications?.emit('item_added', {itemName:item.name}, 'item_added_' + item.id);
  showToast('✅', prod.name, 'Ajouté à la liste.');
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  saveItems(); renderList();
  if(state.currentSubtab === 'cart') renderCart();
}

function clearChecked() {
  const n = state.items.filter(i => i.checked).length;
  if(!n) { showToast('ℹ️','Rien','Cochez d\'abord des articles.'); return; }
  confirm2('🗑️','Supprimer les cochés', `Supprimer ${n} article(s) coché(s) ?`, () => {
    state.items = state.items.filter(i => !i.checked);
    saveItems(); renderList();
    if(state.currentSubtab === 'cart') renderCart();
    showToast('✅', n + ' supprimé(s)', '');
  });
}

function sortItems() {
  state.sortAZ = !state.sortAZ;
  renderList();
  showToast('📋', state.sortAZ ? 'Trié A→Z' : 'Ordre original', '');
}

function filterCat(el) {
  document.querySelectorAll('#catChips .chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  state.filterCat = el.dataset.cat;
  renderList();
}

// ═══════════════════════════════════════════════
// CHARIOT
// ═══════════════════════════════════════════════
function renderCart() {
  const checked = state.items.filter(i => i.checked);
  const wrap = document.getElementById('cartItemsWrap');
  const empty = document.getElementById('emptyCart');
  const banner = document.getElementById('cartBannerWrap');
  if(!checked.length) {
    if(wrap) wrap.innerHTML = '';
    if(empty) empty.style.display = 'block';
    if(banner) banner.innerHTML = '';
    return;
  }
  if(empty) empty.style.display = 'none';
  const total = checked.reduce((s,i) => s+(i.price||0), 0).toFixed(2);
  if(banner) banner.innerHTML = `
    <div class="cart-banner">
      <div><div class="cart-banner-tx">${checked.length} article(s) dans le chariot</div><div class="cart-banner-sub">Total estimé : ${total}€</div></div>
      <div class="finish-btn" onclick="finishShopping()">✅ Terminer</div>
    </div>`;
  if(wrap) wrap.innerHTML = checked.map(item => `
    <div class="item-wrap" style="margin-bottom:7px;">
      <div class="item ck" data-id="${item.id}">
        <div class="chk on" onclick="toggleCheck('${item.id}');switchSubtab('cart')">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="i-em">${item.emoji||'🛒'}</div>
        <div class="i-info"><div class="inm">${item.name}</div>${item.qty?`<div class="imeta">${item.qty}</div>`:''}</div>
        <div class="i-r">
          ${item.price?`<span class="ipr">${item.price.toFixed(2)}€</span>`:''}
          <button class="btn ghost sm" style="padding:4px 6px;color:var(--rd);" onclick="deleteItem('${item.id}');renderCart()">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

function finishShopping() {
  const checked = state.items.filter(i => i.checked);
  if(!checked.length) return;
  confirm2('🎉', 'Courses terminées !', `Ajouter ${checked.length} article(s) au frigo et à l'historique ?`, () => {
    const session = {
      date: new Date().toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit'}),
      timestamp: Date.now(),
      items: checked.map(i => ({name:i.name,emoji:i.emoji,price:i.price||0})),
      total: checked.reduce((s,i) => s+(i.price||0), 0).toFixed(2)
    };
    state.history.unshift(session);
    if(state.history.length > 20) state.history.pop();
    checked.forEach(item => {
      const ex = state.fridge.find(f => f.name.toLowerCase() === item.name.toLowerCase());
      if(ex) { ex.qty = (parseInt(ex.qty)||1) + 1; }
      else { state.fridge.push({id:'f'+Date.now()+Math.random().toString(36).slice(2,5),name:item.name,emoji:item.emoji||'🛒',qty:1,cat:item.cat}); }
    });
    state.items = state.items.filter(i => !i.checked);
    saveItems(); saveFridge(); saveHistory();
    window.MealioNotifications?.emit('shopping_completed', {count:checked.length}, 'shopping_completed_' + session.timestamp);
    renderList(); renderFridge(); renderCart(); renderHistory();
    showToast('🎉', 'Course terminée !', 'Articles ajoutés au frigo et à l\'historique.');
    switchSubtab('done');
  });
}

// ═══════════════════════════════════════════════
// HISTORIQUE
// ═══════════════════════════════════════════════
function renderHistory() {
  const wrap = document.getElementById('historyWrap');
  const empty = document.getElementById('emptyHistory');
  const cnt = document.getElementById('histCount');
  if(cnt) cnt.textContent = state.history.length + ' session(s)';
  if(!state.history.length) {
    if(wrap) wrap.innerHTML = '';
    if(empty) empty.style.display = 'block';
    return;
  }
  if(empty) empty.style.display = 'none';
  if(wrap) wrap.innerHTML = state.history.map((s,i) => `
    <div class="hist-session">
      <div class="hist-session-hd" onclick="toggleHistSession(${i})">
        <div><div class="hist-session-date">🛒 Course du ${s.date}</div><div class="hist-session-meta">${s.items.length} articles · ${s.total}€</div></div>
        <span id="hist-arrow-${i}">▼</span>
      </div>
      <div class="hist-session-body" id="hist-body-${i}" style="display:none;">
        ${s.items.map(it => `<div class="hist-item"><span class="hist-item-em">${it.emoji||'🛒'}</span><span style="flex:1;">${it.name}</span><span style="color:var(--tx2);font-size:.75rem;">${it.price?it.price.toFixed(2)+'€':''}</span></div>`).join('')}
        <button class="btn sm acc" style="margin-top:8px;width:100%;" onclick="reorderFromHistory(${i})">🔄 Recommander ces articles</button>
      </div>
    </div>`).join('');
}

function toggleHistSession(i) {
  const body = document.getElementById('hist-body-' + i);
  const arrow = document.getElementById('hist-arrow-' + i);
  const open = body.style.display === 'block';
  body.style.display = open ? 'none' : 'block';
  if(arrow) arrow.textContent = open ? '▼' : '▲';
}

function reorderFromHistory(i) {
  const s = state.history[i]; let added = 0;
  s.items.forEach(it => {
    if(!state.items.some(si => si.name.toLowerCase() === it.name.toLowerCase() && !si.checked)) {
      state.items.unshift({id:'i'+Date.now()+Math.random().toString(36).slice(2,7),name:it.name,emoji:it.emoji,cat:'🍝 Épicerie',price:it.price||0,qty:'',checked:false,addedAt:Date.now()});
      added++;
    }
  });
  saveItems(); renderList(); switchSubtab('tobuy');
  showToast('✅', added + ' ajouté(s)', 'Depuis l\'historique.');
}

// ═══════════════════════════════════════════════
// AUTOCOMPLETE
// ═══════════════════════════════════════════════
let acTimeout;
function onSearchInput(val) {
  clearTimeout(acTimeout);
  if(!val.trim()) { document.getElementById('acList').style.display = 'none'; return; }
  acTimeout = setTimeout(() => {
    const matches = PRODUCTS.filter(p => p.name.toLowerCase().includes(val.toLowerCase())).slice(0,8);
    showAC('acList', 'addInput', matches);
  }, 150);
}

function showAC(listId, inputId, products) {
  const list = document.getElementById(listId);
  if(!products.length || !products) { if(list) list.style.display = 'none'; return; }
  const inp = document.getElementById(inputId);
  if(!inp || !list) return;
  // Use CSS absolute positioning (defined in .ac-list)
  list.style.position = '';
  list.style.zIndex = '';
  list.style.top = '';
  list.style.left = '';
  list.style.width = '';
  list.style.minWidth = '';
  list.style.display = 'block';
  list.innerHTML = products.map(p => {
    const safeName = (p.name||'').replace(/'/g,"&#39;");
    return '<div class="ac-item" onclick="acSelect(\'' + safeName + '\',\'' + listId + '\',\'' + inputId + '\')">'
      + '<span class="ac-item-em">' + (p.emoji||'🛍️') + '</span>'
      + '<span class="ac-item-nm">' + (p.name||'') + '</span>'
      + '<span class="ac-item-cat">' + (p.cat||'') + '</span>'
      + '</div>';
  }).join('');
}

function acSelect(name, listId, inputId) {
  document.getElementById(inputId).value = name;
  document.getElementById(listId).style.display = 'none';
  if(inputId === 'addInput') addItemFromInput();
  else if(inputId === 'fridgeInput') addFridgeItem();
}

document.addEventListener('click', e => {
  if(!e.target.closest('.ac-wrap')) document.querySelectorAll('.ac-list').forEach(l => l.style.display = 'none');
});

// ═══════════════════════════════════════════════
// SWIPE
// ═══════════════════════════════════════════════
function attachSwipe() {
  document.querySelectorAll('#itemsWrap .item').forEach(el => {
    let sx = 0, cx = 0, dragging = false;
    el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; dragging = true; el.classList.add('swiping'); }, {passive:true});
    el.addEventListener('touchmove', e => {
      if(!dragging) return;
      cx = e.touches[0].clientX - sx;
      if(cx < 0) el.style.transform = `translateX(${Math.max(cx,-110)}px)`;
    }, {passive:true});
    el.addEventListener('touchend', () => {
      dragging = false; el.classList.remove('swiping');
      if(cx < -70) {
        const id = el.dataset.id;
        el.classList.add('deleting');
        el.style.transform = 'translateX(-110%)';
        el.style.opacity = '0';
        setTimeout(() => deleteItem(id), 220);
      } else { el.style.transform = ''; }
      cx = 0;
    });
  });
}

// ═══════════════════════════════════════════════
// EDIT MODAL
// ═══════════════════════════════════════════════
function openEdit(id) {
  const item = state.items.find(i => i.id === id);
  if(!item) return;
  state.editingItemId = id;
  document.getElementById('editModalInner').innerHTML = `
    <div class="mhdl"></div>
    <div class="modal-ti">Modifier l'article</div>
    <div class="edit-field"><label class="edit-label">Nom</label><input class="inp" id="editName" value="${item.name}"></div>
    <div class="edit-field"><label class="edit-label">Quantité / Note</label><input class="inp" id="editQty" value="${item.qty||''}"></div>
    <div class="edit-field"><label class="edit-label">Prix (€)</label><input class="inp" id="editPrice" type="number" value="${item.price||''}" placeholder="0.00" step="0.10" min="0"></div>
    <div class="edit-field"><label class="edit-label">Catégorie</label><div class="cat-selector" id="editCatSel">${CATEGORIES.map(c=>`<div class="cat-opt${item.cat===c?' on':''}" onclick="this.parentNode.querySelectorAll('.cat-opt').forEach(x=>x.classList.remove('on'));this.classList.add('on')" data-cat="${c}">${c}</div>`).join('')}</div></div>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn" style="flex:1;" onclick="closeEdit()">Annuler</button>
      <button class="btn acc" style="flex:1;" onclick="saveEdit()">Sauvegarder</button>
    </div>`;
  document.getElementById('editOverlay').classList.add('on');
}

function closeEdit() { document.getElementById('editOverlay').classList.remove('on'); state.editingItemId = null; }

function saveEdit() {
  const item = state.items.find(i => i.id === state.editingItemId);
  if(!item) return;
  item.name = document.getElementById('editName').value.trim() || item.name;
  item.qty = document.getElementById('editQty').value.trim();
  const pv = parseFloat(document.getElementById('editPrice').value);
  if(!isNaN(pv)) item.price = pv;
  const sel = document.querySelector('#editCatSel .cat-opt.on');
  if(sel) item.cat = sel.dataset.cat;
  saveItems(); closeEdit(); renderList();
  showToast('✅', item.name, 'Mis à jour.');
}

// ═══════════════════════════════════════════════

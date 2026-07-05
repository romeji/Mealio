// startBarcodeCamera / stopBarcodeCamera / startLiveBarcodeScan sont
// définies dans index.html (version plus récente et complète : trait
// rouge animé, flash vert, fallback capture photo). Ne PAS les redéfinir
// ici pour éviter tout écrasement silencieux au chargement des scripts.

/* SMARTCARD — MODULE SCAN */

// URL de base de l'API serverless (Vercel) — les endpoints /api/... ne sont
// jamais exécutables tels quels sur GitHub Pages (hébergement statique
// uniquement, aucun backend possible) donc on force le domaine complet.
const API_BASE = 'https://smartcard-eosin.vercel.app';

// TICKET SCAN — Powered by Tesseract.js + Mistral AI
// Basé sur Smart Receipt AI V8 ULTIME
// ═══════════════════════════════════════════════
let ticketParsedItems = [];
let aiCache = {};
try { aiCache = JSON.parse(localStorage.getItem('sc_ai_cache') || '{}'); } catch(e) {}

const STORES_LIST = ['Carrefour','Leclerc','Auchan','Intermarché','Lidl','Aldi','Monoprix','Casino','Super U','Franprix','Picard','Biocoop','Naturalia','La Vie Claire','Netto','Leader Price','Simply','Système U','Spar','Grand Frais','Bio c Bon','Marché U'];

// ── Navigation ──────────────────────────────────
function startTicketScan() {
  document.getElementById('ticketStartZone').style.display = 'none';
  document.getElementById('ticketZone').style.display = 'block';
  document.getElementById('ticketEditZone').style.display = 'none';
  document.getElementById('ticketResults').style.display = 'none';
}

function resetTicketScan() {
  document.getElementById('ticketStartZone').style.display = 'block';
  document.getElementById('ticketZone').style.display = 'none';
  document.getElementById('ticketEditZone').style.display = 'none';
  document.getElementById('ticketResults').style.display = 'none';
  const preview = document.getElementById('ticketPreview');
  if(preview) { preview.src = ''; preview.style.display = 'none'; }
  const camPh = document.getElementById('camPh');
  if(camPh) camPh.style.display = 'flex';
  const btn = document.getElementById('analyzeBtn');
  if(btn) btn.disabled = true;
  // Recréer les inputs fichier pour que onChange se déclenche même si même fichier sélectionné
  _rebuildFileInputs();
  currentTicketFile = null;
  ticketParsedItems = [];
}

function _rebuildFileInputs() {
  // Input caméra
  const old1 = document.getElementById('ticketFile');
  if(old1) {
    const n = document.createElement('input');
    n.type = 'file'; n.id = 'ticketFile'; n.accept = 'image/*';
    n.style.display = 'none';
    n.onchange = function(){ analyzeTicket(this); };
    old1.parentNode.replaceChild(n, old1);
  }
  // Input galerie
  const old2 = document.getElementById('ticketFileGallery');
  if(old2) {
    const n = document.createElement('input');
    n.type = 'file'; n.id = 'ticketFileGallery'; n.accept = 'image/*';
    n.style.display = 'none';
    n.onchange = function(){ analyzeTicket(this); };
    old2.parentNode.replaceChild(n, old2);
  }
}

function triggerFileInput() {
  document.getElementById('ticketFile').click();
}

// ── Image load & preview ────────────────────────
let currentTicketFile = null; // stockage fiable du fichier

function analyzeTicket(input) {
  const file = input.files[0];
  if(!file) return;
  currentTicketFile = file; // stockage global fiable
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('ticketPreview');
    preview.src = e.target.result;
    preview.style.display = 'block';
    const camPh = document.getElementById('camPh');
    if(camPh) camPh.style.display = 'none';
    const btn = document.getElementById('analyzeBtn');
    if(btn) { btn.disabled = false; btn.textContent = '🤖 Analyser avec l\'IA'; }
  };
  reader.readAsDataURL(file);
}

// ── Progress helper ─────────────────────────────
function setOCRProgress(pct, text) {
  const el = document.getElementById('ocrProgress');
  const bar = document.getElementById('ocrProgressBar');
  const txt = document.getElementById('ocrProgressText');
  if(el) el.style.display = 'block';
  if(bar) bar.style.width = pct + '%';
  if(txt) txt.textContent = text;
}

// ── Prétraitement image (V8 ULTIME exact) ───────
async function preprocessImage(file) {
  return new Promise(res => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      // Binarisation seuil 140 — identique au module original
      let d = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let data = d.data;
      for(let i = 0; i < data.length; i += 4) {
        let avg = (data[i] + data[i+1] + data[i+2]) / 3;
        avg = avg > 140 ? 255 : 0;
        data[i] = data[i+1] = data[i+2] = avg;
      }
      ctx.putImageData(d, 0, 0);
      res(canvas);
    };
    img.src = URL.createObjectURL(file);
  });
}

// ── Nettoyage ligne OCR (V8 ULTIME exact) ───────
function cleanLine(l) {
  return l.toLowerCase()
    .replace(/[^a-z0-9\s.,€]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Extraction lignes avec prix (V8 ULTIME exact) ─
function extractLines(text) {
  return text.split('\n')
    .map(l => cleanLine(l))
    .filter(l => l.match(/\d+[.,]\d{2}/) && !l.includes('total') && !l.includes('ttc') && !l.includes('net a payer') && !l.includes('vous payez'));
}

// ── Correction IA via Mistral (V8 ULTIME exact) ─
async function askMistralAI(lines) {
  const uncached = lines.filter(l => !aiCache[l]);

  if(uncached.length > 0) {
    setOCRProgress(82, 'Correction Mistral AI (' + uncached.length + ' articles)...');

    try {
      const res = await fetch(API_BASE + '/api/mistral-correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: uncached }),
      });
      const data = await res.json();
      const results = Array.isArray(data.results) && data.results.length === uncached.length
        ? data.results
        : uncached; // dégradation gracieuse si la réponse est inattendue

      uncached.forEach((l, i) => {
        aiCache[l] = results[i] || l;
      });
      try { localStorage.setItem('sc_ai_cache', JSON.stringify(aiCache)); } catch(e) {}
    } catch(e) {
      // If Mistral fails, use raw lines
      uncached.forEach(l => { aiCache[l] = l; });
    }
  }

  return lines.map(l => aiCache[l] || l);
}

// ── Matching produit ─────────────────────────────
function findBestProduct(name) {
  const nl = name.toLowerCase();
  let p = PRODUCTS.find(p => p.name.toLowerCase() === nl);
  if(p) return p;
  const words = nl.split(' ').filter(w => w.length > 2);
  let best = null, bestScore = 0;
  for(const prod of PRODUCTS) {
    const pl = prod.name.toLowerCase();
    let score = 0;
    for(const w of words) { if(pl.includes(w)) score++; }
    if(score > bestScore) { bestScore = score; best = prod; }
  }
  return bestScore >= 1 ? best : null;
}

function guessEmoji(name) {
  const nl = name.toLowerCase();
  const map = [
    [['lait','milk'],'🥛'],[['fromage','cheese','camembert','brie','gruyere','cheddar','raclette','comté'],'🧀'],
    [['yaourt','yogurt','skyr'],'🍶'],[['beurre'],'🧈'],[['oeuf','egg','œuf'],'🥚'],
    [['crème','creme'],'🥛'],[['tomate'],'🍅'],[['pomme','apple'],'🍎'],
    [['banane'],'🍌'],[['orange'],'🍊'],[['citron'],'🍋'],
    [['pain','baguette','brioche','madeleine','seigle'],'🍞'],[['croissant','feuilleté'],'🥐'],
    [['pate','pasta','ravioli','tortelloni','lasagne'],'🍝'],[['riz','rice'],'🍚'],
    [['poulet','chicken'],'🍗'],[['boeuf','steak','viande','jambon'],'🥩'],[['saucisse','knack','merguez'],'🌭'],
    [['poisson','saumon','thon','cabillaud','colin'],'🐟'],[['crevette'],'🦐'],[['moule','huître'],'🐚'],
    [['biere','beer'],'🍺'],[['vin','wine'],'🍷'],[['eau','water','volvic','evian'],'💧'],
    [['jus','juice','oasis'],'🍊'],[['coca','soda','pepsi'],'🥤'],[['cafe','coffee','cappuccino'],'☕'],
    [['chocolat','nutella','nesquik'],'🍫'],[['chips'],'🍟'],[['glace','sorbet'],'🍦'],
    [['savon','shampoo','gel douche','bain'],'🧴'],[['papier','essuie','sopalin'],'🧻'],[['lessive'],'👕'],
    [['eponge'],'🧽'],[['poubelle'],'🗑️'],[['carotte'],'🥕'],[['courgette'],'🥒'],
    [['champignon'],'🍄'],[['legume','vegetal','surgelé'],'🥦'],[['pizza'],'🍕'],
    [['chat','chien','croquette','litière'],'🐾']
  ];
  for(const [keys, em] of map) {
    if(keys.some(k => nl.includes(k))) return em;
  }
  return '🛒';
}

// ── Détection magasin ────────────────────────────
function detectStore(lines) {
  for(let i = 0; i < Math.min(8, lines.length); i++) {
    const l = lines[i].toLowerCase();
    for(const s of STORES_LIST) {
      if(l.includes(s.toLowerCase())) return s;
    }
  }
  return '';
}

// ── Analyse principale ───────────────────────────
async function runTicketAnalysis() {
  const file = currentTicketFile;
  if(!file) {
    showToast('⚠️', 'Aucune image', 'Choisissez d\'abord une photo de ticket.');
    return;
  }
  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Analyse en cours...';
  setOCRProgress(5, 'Préparation de l\'image...');

  // ── Étape 1 : Essayer Gemini Vision en priorité ──────────────────
  try {
    setOCRProgress(10, '📸 Gemini Vision analyse le ticket...');

    // Compress image
    const b64 = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if(w > MAX || h > MAX) { if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;} }
        const c = document.createElement('canvas'); c.width=w; c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        res(c.toDataURL('image/jpeg',0.8).split(',')[1]);
      };
      img.onerror = rej;
      const fr = new FileReader(); fr.onload=e=>img.src=e.target.result; fr.readAsDataURL(file);
    });

    const resp = await fetch(API_BASE + '/api/gemini-vision', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        imageBase64: b64,
        mimeType: 'image/jpeg',
        prompt: `Analyze this French supermarket receipt image. Extract all purchased products with their prices.
Return ONLY a JSON object, no text before or after, start with { end with }:
{"store":"Carrefour","total":42.50,"items":[{"name":"Lait demi-écrémé","price":1.29},{"name":"Tomates","price":2.49}]}
Rules:
- Extract every product line with a price
- Use clean readable French product names
- Exclude totals, taxes, loyalty points lines
- Return ONLY the JSON`
      })
    });

    if(resp.ok) {
      const data = await resp.json();
      const rawText = (data.text || '').trim();
      const firstBrace = rawText.indexOf('{');
      const lastBrace  = rawText.lastIndexOf('}');

      if(firstBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(rawText.slice(firstBrace, lastBrace+1));
        const geminiItems = parsed.items || [];

        if(geminiItems.length > 0) {
          setOCRProgress(90, `✅ ${geminiItems.length} articles détectés par Gemini`);

          // Build items from Gemini result
          const items = geminiItems.map(gi => {
            const matched = findBestProduct(gi.name);
            return {
              id: 'tk'+Date.now()+Math.random().toString(36).slice(2,5),
              name: gi.name,
              emoji: matched?.emoji || '🛒',
              cat: matched?.cat || '🍝 Épicerie',
              price: gi.price || 0,
              qty: 1, checked: false,
              addedAt: Date.now(),
            };
          }).filter(i => i.name && i.name.length > 1);

          setOCRProgress(100, '✅ Analyse Gemini terminée');
          setTimeout(() => {
            const el = document.getElementById('ocrProgress');
            if(el) el.style.display = 'none';
          }, 1500);

          renderTicketResults(items, parsed.store || '', parsed.total || 0);
          btn.disabled = false;
          btn.textContent = '🤖 Analyser avec l\'IA';
          return; // ✅ Gemini succeeded — skip Tesseract
        }
      }
    }
    console.warn('[ticket] Gemini Vision failed or returned no items — falling back to Tesseract');
  } catch(e) {
    console.warn('[ticket] Gemini Vision exception:', e.message, '— falling back to Tesseract');
  }

  // ── Étape 2 : Fallback Tesseract + Mistral ───────────────────────
  try {
    setOCRProgress(15, 'OCR Tesseract en cours...');
    const canvas = await preprocessImage(file);

    // Étape 2 — OCR Tesseract.js v4
    let ocrText = '';
    setOCRProgress(20, 'OCR en cours (0%)...');
    const { data: { text } } = await Tesseract.recognize(canvas, 'fra', {
      logger: m => {
        if(m.status === 'recognizing text') {
          const pct = 20 + Math.round(m.progress * 55);
          setOCRProgress(pct, 'OCR : ' + Math.round(m.progress * 100) + '%');
        }
      }
    });
    ocrText = text;

    setOCRProgress(76, 'Extraction des articles...');

    // Étape 3 — Extraction lignes (V8 exact)
    const rawLines = extractLines(ocrText);

    // Étape 4 — Détection magasin & total
    const allLines = ocrText.split('\n').map(l => cleanLine(l)).filter(l => l.length > 0);
    const storeName = detectStore(allLines);
    let total = 0;
    const totalRe = /total|net a payer|vous payez|montant/i;
    for(const l of allLines) {
      if(totalRe.test(l)) {
        const pm = l.match(/(\d{1,3}[,.]\d{2})/g);
        if(pm) { const v = parseFloat(pm[pm.length-1].replace(',','.')); if(v > total) total = v; }
      }
    }

    // Étape 5 — Correction Mistral AI (avec cache)
    let correctedNames = rawLines;
    if(rawLines.length > 0) {
      correctedNames = await askMistralAI(rawLines);
    }
    setOCRProgress(95, 'Matching produits...');

    // Étape 6 — Construction des items
    const items = rawLines.map((rawLine, i) => {
      const corrName = correctedNames[i] || rawLine;
      const pm = rawLine.match(/(\d{1,3}[,.]\d{2})/g);
      const price = pm ? parseFloat(pm[pm.length-1].replace(',','.')) : 0;

      let cleanName = corrName
        .replace(/\d{1,3}[,.]\d{2}/g, '')   // retirer les prix
        .replace(/[€*]/g, '')
        // Retirer les quantités : "2x", "x2", "1 x", "x 1", "2 X", "(x3)" etc.
        .replace(/\b\d+\s*[xX×]\b/g, '')
        .replace(/\b[xX×]\s*\d+\b/g, '')
        .replace(/^\s*\d+\s+/g, '')          // chiffre seul en début de ligne
        .replace(/\(\s*\d+\s*\)/g, '')       // (2) (3) etc.
        .replace(/\s+/g, ' ')
        .trim();

      if(!cleanName || cleanName.length < 2) {
        cleanName = rawLine.replace(/\d{1,3}[,.]\d{2}.*/, '').trim();
        // Retirer aussi les quantités du fallback
        cleanName = cleanName
          .replace(/\b\d+\s*[xX×]\b/g, '')
          .replace(/\b[xX×]\s*\d+\b/g, '')
          .replace(/^\s*\d+\s+/g, '')
          .trim();
      }
      if(!cleanName || cleanName.length < 2) return null;
      cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

      const matched = findBestProduct(cleanName);
      return {
        id: 'tk' + Date.now() + Math.random().toString(36).slice(2,5),
        rawName: rawLine,
        name: matched ? matched.name : cleanName,
        emoji: matched ? matched.emoji : guessEmoji(cleanName),
        price: isNaN(price) ? 0 : price,
        cat: matched ? matched.cat : '🍝 Épicerie',
        include: true,
        matched: !!matched
      };
    }).filter(it => it && it.name.length > 1 && it.price >= 0);

    setOCRProgress(100, '✅ Terminé !');
    setTimeout(() => {
      const prog = document.getElementById('ocrProgress');
      if(prog) prog.style.display = 'none';
    }, 800);

    renderTicketResults(items, storeName, total);

  } catch(e) {
    console.error('Ticket analysis error:', e);
    const prog = document.getElementById('ocrProgress');
    if(prog) prog.style.display = 'none';
    showTicketError(e.message || 'Erreur inconnue');
  }

  btn.disabled = false;
  btn.textContent = '🤖 Analyser avec l\'IA';
}

function renderTicketResults(items, storeName, total) {
  const btn = document.getElementById('analyzeBtn');
  if(items.length === 0) {
    ticketParsedItems = [];
    showTicketEditZoneEmpty(storeName);
  } else {
    ticketParsedItems = items;
    showTicketEditZone(storeName, total, items);
    showToast('✅', items.length + ' article(s) détecté(s)', storeName ? 'Magasin : ' + storeName : 'Ticket analysé');
  }
  if(btn) { btn.disabled = false; btn.textContent = '🤖 Analyser avec l\'IA'; }
}

// Zone vide — aucun article détecté
function showTicketEditZoneEmpty(storeName) {
  document.getElementById('ticketZone').style.display = 'none';
  document.getElementById('ticketEditZone').style.display = 'block';
  document.getElementById('ticketEditZone').innerHTML = `
    <div class="sr-block" style="text-align:center;padding:24px 16px;">
      <div style="font-size:2.5rem;margin-bottom:12px;">😕</div>
      <div style="font-weight:900;font-size:1rem;margin-bottom:8px;">Aucun article détecté</div>
      <div style="font-size:.8rem;color:var(--tx2);line-height:1.7;margin-bottom:16px;">
        L'OCR n'a trouvé aucune ligne avec un prix.<br>
        ${storeName ? 'Magasin détecté : <strong>' + storeName + '</strong><br>' : ''}
        <br>
        <strong>Conseils :</strong><br>
        📄 Ticket bien à plat, de haut<br>
        💡 Bonne luminosité, pas de reflets<br>
        🔍 Texte net et lisible
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn acc" style="width:100%;" onclick="addTicketItemRow();document.getElementById('tkItemsList')&&document.getElementById('ticketEditZone').querySelector('.sr-block').insertAdjacentHTML('beforeend',document.getElementById('tkItemsList').outerHTML)">
          ✏️ Saisir les articles manuellement
        </button>
        <button class="btn" style="width:100%;" onclick="resetTicketScan()">↩️ Reprendre une photo</button>
      </div>
    </div>`;
  // Initialize empty edit zone for manual entry
  ticketParsedItems = [];
  document.getElementById('ticketEditZone').innerHTML = `
    <div class="sr-block">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="font-size:1.5rem;">😕</div>
        <div>
          <div style="font-weight:900;font-size:.95rem;color:var(--rd);">Aucun article détecté</div>
          <div style="font-size:.72rem;color:var(--tx2);">Photo trop floue ? Essayez de saisir manuellement</div>
        </div>
      </div>
      <div style="background:rgba(255,107,107,.08);border-radius:var(--rs);padding:12px;margin-bottom:14px;font-size:.75rem;color:var(--tx2);line-height:1.7;">
        💡 <strong>Conseils photo :</strong> ticket à plat · de haut · bonne lumière · pas de reflets
      </div>
      <div style="font-size:.7rem;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">Articles (saisie manuelle)</div>
      <div id="tkItemsList"></div>
      <button class="btn" style="width:100%;margin-top:10px;border:1.5px dashed var(--tx3);color:var(--tx2);font-size:.8rem;" onclick="addTicketItemRow()">
        ➕ Ajouter un article
      </button>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:14px;border-top:2px solid var(--bg2);">
        <button class="btn acc" style="width:100%;padding:13px;" onclick="confirmTicketToList()">📝 Valider → Ajouter à ma liste</button>
        <button class="btn ghost" style="width:100%;color:var(--tx3);font-size:.78rem;" onclick="resetTicketScan()">↩️ Reprendre une photo</button>
      </div>
    </div>`;
}

// Erreur technique — message clair, pas de démo
function showTicketError(errMsg) {
  document.getElementById('ticketZone').style.display = 'none';
  document.getElementById('ticketEditZone').style.display = 'block';
  document.getElementById('ticketEditZone').innerHTML = `
    <div class="sr-block" style="text-align:center;padding:24px 16px;">
      <div style="font-size:2.5rem;margin-bottom:12px;">❌</div>
      <div style="font-weight:900;font-size:1rem;margin-bottom:8px;color:var(--rd);">Erreur d'analyse</div>
      <div style="font-size:.78rem;color:var(--tx2);line-height:1.7;margin-bottom:16px;">
        Une erreur s'est produite pendant l'analyse.<br>
        Vérifiez votre connexion internet et réessayez.<br>
        <span style="font-size:.65rem;color:var(--tx3);font-family:monospace;">${errMsg}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn acc" style="width:100%;" onclick="resetTicketScan();startTicketScan()">🔄 Réessayer</button>
        <button class="btn" style="width:100%;" onclick="resetTicketScan()">↩️ Annuler</button>
      </div>
    </div>`;
}

// ── Zone d'édition du ticket ────────────────────
function showTicketEditZone(storeName, total, items) {
  document.getElementById('ticketZone').style.display = 'none';
  document.getElementById('ticketEditZone').style.display = 'block';
  const storeOptions = STORES_LIST.map(s => `<option value="${s}" ${s===storeName?"selected":""}>${s}</option>`).join('');

  document.getElementById('ticketEditZone').innerHTML = `
    <div class="sr-block">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <div style="font-size:1.5rem;">✏️</div>
        <div>
          <div style="font-weight:900;font-size:.95rem;">Vérifiez votre ticket</div>
          <div style="font-size:.72rem;color:var(--tx2);">Corrigez les erreurs avant d'ajouter à votre liste</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div>
          <label class="edit-label">🏪 Magasin</label>
          <input class="inp" id="tkStore" list="storesList" value="${storeName||''}" placeholder="Nom du magasin">
          <datalist id="storesList">${storeOptions}</datalist>
        </div>
        <div>
          <label class="edit-label">💰 Total (€)</label>
          <input class="inp" id="tkTotal" type="number" value="${total||''}" step="0.01" min="0" placeholder="0.00">
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:.7rem;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;">
          ${items.length} article(s) — décochez pour exclure
        </div>
        <div style="font-size:.68rem;color:var(--tx2);">🔄 Tap emoji pour changer</div>
      </div>

      <div id="tkItemsList">
        ${items.map((it,i) => renderTicketEditItem(it, i)).join('')}
      </div>

      <button class="btn" style="width:100%;margin-top:10px;border:1.5px dashed var(--tx3);color:var(--tx2);font-size:.8rem;" onclick="addTicketItemRow()">
        ➕ Ajouter une ligne manuellement
      </button>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;padding-top:14px;border-top:2px solid var(--bg2);">
        <div style="display:flex;gap:8px;">
          <button class="btn acc" style="flex:1;padding:13px;" onclick="confirmTicketToList()">
            🛒 Ma liste
          </button>
          <button class="btn acc3" style="flex:1;padding:13px;" onclick="confirmTicketToFridge()">
            🧊 Au frigo
          </button>
        </div>
        ${state.houseId ? `
        <button class="btn" style="width:100%;padding:11px;" onclick="confirmTicketToShared()">
          👨‍👩‍👧 Liste commune du foyer
        </button>` : ''}
        <button class="btn ghost" style="width:100%;padding:10px;color:var(--rd);font-size:.8rem;" onclick="resetTicketScan()">
          ✕ Annuler
        </button>
      </div>
    </div>`;
}

function renderTicketEditItem(it, i) {
  return `<div id="tkRow-${it.id}" style="display:flex;align-items:flex-start;gap:8px;padding:10px 0;border-bottom:1px solid var(--bg2);">
    <input type="checkbox" id="tkChk-${it.id}" ${it.include?"checked":""} onchange="ticketItemToggle('${it.id}',this.checked)"
      style="accent-color:var(--ac);width:20px;height:20px;flex-shrink:0;margin-top:4px;cursor:pointer;">
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;">
      <div style="display:flex;gap:6px;align-items:center;position:relative;">
        <span style="font-size:1.3rem;flex-shrink:0;cursor:pointer;" id="tkEmoji-${it.id}" onclick="changeTicketEmoji('${it.id}')" title="Tap pour changer">
          ${it.emoji}
        </span>
        <div style="flex:1;position:relative;">
          <input class="inp" style="width:100%;padding:8px 10px;font-size:.85rem;" id="tkName-${it.id}"
            value="${it.name.replace(/"/g,'&quot;')}"
            oninput="tkAutoComplete('${it.id}',this.value)"
            onblur="setTimeout(()=>tkHideAC('${it.id}'),180)"
            onfocus="tkAutoComplete('${it.id}',this.value)"
            placeholder="Nom de l'article (ex: ba = banane)">
          <div id="tkAC-${it.id}" style="position:absolute;left:0;right:0;top:100%;z-index:500;background:var(--bg);border-radius:var(--rs);box-shadow:var(--sf);max-height:180px;overflow-y:auto;display:none;"></div>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
          <input class="inp" style="width:75px;padding:7px 8px;font-size:.82rem;text-align:right;" id="tkPrice-${it.id}"
            type="number" value="${it.price||''}" step="0.01" min="0" placeholder="Prix"
            onchange="ticketItemPriceChange('${it.id}',this.value)">
          <span style="font-size:.75rem;color:var(--tx2);font-weight:700;">€</span>
        </div>
        <select class="inp" style="flex:1;padding:7px 8px;font-size:.72rem;" id="tkCat-${it.id}"
          onchange="ticketItemCatChange('${it.id}',this.value)">
          ${['🥛 Laitage','🥩 Viande','🥦 Légumes','🍎 Fruits','🥖 Boulangerie','🐟 Poisson','🍝 Épicerie','🥤 Boissons','🧴 Hygiène','🧹 Ménager','🐾 Animaux']
            .map(c=>`<option value="${c}" ${it.cat===c?"selected":""}>${c}</option>`).join('')}
        </select>
        <button onclick="deleteTicketItem('${it.id}')"
          style="padding:7px 10px;background:rgba(231,76,60,.12);color:var(--rd);border-radius:var(--rx);cursor:pointer;font-size:.8rem;flex-shrink:0;border:none;font-weight:700;">
          🗑
        </button>
      </div>
      <div style="font-size:.62rem;font-weight:700;color:${it.matched?"var(--gn)":"var(--or)"};" id="tkStatus-${it.id}">
        ${it.matched ? '✓ Produit reconnu' : '⚠️ Non reconnu — modifiez le nom'}
      </div>
    </div>
  </div>`;
}

// Autocomplétion live pour les noms de ticket
function tkAutoComplete(id, val) {
  const acEl = document.getElementById('tkAC-' + id);
  if(!acEl) return;
  const q = (val || '').trim().toLowerCase();
  if(q.length < 1) { acEl.style.display = 'none'; return; }
  const matches = PRODUCTS.filter(p =>
    p.name.toLowerCase().startsWith(q) ||
    p.name.toLowerCase().includes(q) ||
    p.name.toLowerCase().split(' ').some(w => w.startsWith(q))
  ).slice(0, 8);
  if(!matches.length) { acEl.style.display = 'none'; return; }
  acEl.style.display = 'block';
  acEl.innerHTML = matches.map(p => `
    <div onclick="tkSelectProduct('${id}','${p.name.replace(/'/g,"&#39;")}')"
      style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:background .1s;"
      onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <span style="font-size:1.1rem;">${p.emoji}</span>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:.85rem;">${p.name}</div>
        <div style="font-size:.65rem;color:var(--tx2);">${p.cat} · ${p.price.toFixed(2)}€</div>
      </div>
    </div>`).join('');
}

function tkSelectProduct(id, name) {
  const inp = document.getElementById('tkName-' + id);
  const acEl = document.getElementById('tkAC-' + id);
  if(inp) inp.value = name;
  if(acEl) acEl.style.display = 'none';
  ticketItemNameChange(id, name);
  // Update status
  const statusEl = document.getElementById('tkStatus-' + id);
  if(statusEl) statusEl.innerHTML = '✓ Produit reconnu';
  if(statusEl) statusEl.style.color = 'var(--gn)';
}

function tkHideAC(id) {
  const acEl = document.getElementById('tkAC-' + id);
  if(acEl) acEl.style.display = 'none';
}

// ── Actions sur les items ────────────────────────
function ticketItemToggle(id, checked) {
  const it = ticketParsedItems.find(i => i.id === id);
  if(it) it.include = checked;
}

function ticketItemNameChange(id, val) {
  const it = ticketParsedItems.find(i => i.id === id);
  if(!it) return;
  it.name = val;
  const matched = findBestProduct(val);
  if(matched) {
    it.emoji = matched.emoji;
    it.cat = matched.cat;
    it.matched = true;
    const emojiEl = document.getElementById('tkEmoji-' + id);
    const catEl = document.getElementById('tkCat-' + id);
    if(emojiEl) emojiEl.textContent = matched.emoji;
    if(catEl) catEl.value = matched.cat;
  }
}

function ticketItemPriceChange(id, val) {
  const it = ticketParsedItems.find(i => i.id === id);
  if(it) it.price = parseFloat(val) || 0;
}

function ticketItemCatChange(id, val) {
  const it = ticketParsedItems.find(i => i.id === id);
  if(it) it.cat = val;
}

function deleteTicketItem(id) {
  ticketParsedItems = ticketParsedItems.filter(i => i.id !== id);
  const row = document.getElementById('tkRow-' + id);
  if(row) row.remove();
}

const EMOJI_CYCLE = ['🛒','🥛','🧀','🥚','🍗','🥩','🐟','🦐','🍅','🥕','🥦','🍎','🍌','🍊','🍋','🍞','🥐','🍝','🍚','🫒','🥤','🍺','🍷','💧','☕','🍵','🍫','🧴','🧹','🧽','🧻','🐾','🍕','🍦','🌶️'];

function changeTicketEmoji(id) {
  const it = ticketParsedItems.find(i => i.id === id);
  if(!it) return;
  const cur = EMOJI_CYCLE.indexOf(it.emoji);
  it.emoji = EMOJI_CYCLE[(cur + 1) % EMOJI_CYCLE.length];
  const el = document.getElementById('tkEmoji-' + id);
  if(el) el.textContent = it.emoji;
}

function addTicketItemRow() {
  const newId = 'tk' + Date.now();
  const newItem = {id:newId, rawName:'', name:'', emoji:'🛒', price:0, cat:'🍝 Épicerie', include:true, matched:false};
  ticketParsedItems.push(newItem);
  const list = document.getElementById('tkItemsList');
  if(list) {
    const div = document.createElement('div');
    div.innerHTML = renderTicketEditItem(newItem, ticketParsedItems.length - 1);
    list.appendChild(div.firstElementChild);
  }
  // Focus the new name input
  setTimeout(() => {
    const inp = document.getElementById('tkName-' + newId);
    if(inp) inp.focus();
  }, 50);
}

// ── Récupération des données finales ─────────────
function getTicketData() {
  const store = (document.getElementById('tkStore') || {}).value || '';
  const totalRaw = (document.getElementById('tkTotal') || {}).value;
  const total = parseFloat(totalRaw) || ticketParsedItems.filter(i=>i.include).reduce((s,i)=>s+(i.price||0),0);
  const items = ticketParsedItems.filter(i => i.include && i.name && i.name.length > 0);
  return {store, total, items};
}

// ── Confirmation & ajout ─────────────────────────
function confirmTicketToList() {
  const data = getTicketData();
  if(data.items.length === 0) { showToast('⚠️','Aucun article sélectionné','Cochez au moins un article.'); return; }
  data.items.forEach(it => {
    const ex = state.items.find(si => si.name.toLowerCase() === it.name.toLowerCase());
    if(ex) { ex.qty = String((parseInt(ex.qty)||1) + 1); }
    else {
      state.items.unshift({
        id: 'i'+Date.now()+Math.random().toString(36).slice(2,7),
        name: it.name, emoji: it.emoji||'🛒', cat: it.cat||'🍝 Épicerie',
        price: it.price||0, qty: '', checked: false, addedAt: Date.now(),
        addedBy: currentUser ? currentUser.email : ''
      });
    }
  });
  saveItems();
  renderList();
  saveTicketHistory(data);
  addTicketToFridgeItems(data.items);
  showToast('✅', data.items.length + ' article(s) ajouté(s)', data.store || 'Ticket analysé');
  resetTicketScan();
  switchTab('liste');
}

function confirmTicketToShared() {
  confirmTicketToList();
  showToast('👨‍👩‍👧', 'Partagé avec le foyer', 'Liste commune mise à jour');
}

function confirmTicketToFridge() {
  const data = getTicketData();
  if(data.items.length === 0) { showToast('⚠️','Aucun article','Cochez au moins un article.'); return; }
  addTicketToFridgeItems(data.items);
  saveTicketHistory(data);
  showToast('🧊', data.items.length + ' article(s) au frigo', data.store || '');
  resetTicketScan();
}

function addTicketToFridgeItems(items) {
  items.forEach(it => {
    const ex = state.fridge.find(f => f.name.toLowerCase() === it.name.toLowerCase());
    if(ex) { ex.qty = (parseInt(ex.qty)||1) + 1; }
    else { state.fridge.push({id:'f'+Date.now()+Math.random().toString(36).slice(2,5), name:it.name, emoji:it.emoji||'🛒', qty:1, cat:it.cat||'🍝 Épicerie'}); }
  });
  saveFridge();
  renderFridge();
}

async function saveTicketHistory(data) {
  if(!data.items.length) return;
  const calcTotal = data.total || data.items.reduce((s,i)=>s+(i.price||0),0);
  const entry = {
    date: new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'}),
    timestamp: Date.now(),
    items: data.items.map(i => ({name:i.name, emoji:i.emoji, price:i.price||0, cat:i.cat})),
    total: parseFloat(calcTotal).toFixed(2),
    source: '🧾 ' + (data.store || 'Ticket')
  };
  state.history.unshift(entry);
  if(state.history.length > 30) state.history.pop();
  saveHistory();
  if(db && currentUser) {
    try {
      const docId = state.houseId || currentUser.uid;
      const snap = await db.collection('households').doc(docId).get();
      const existing = snap.exists ? (snap.data().ticketHistory || []) : [];
      existing.unshift({...entry, id: 'tick-' + Date.now()});
      if(existing.length > 30) existing.pop();
      await db.collection('households').doc(docId).set({ticketHistory: existing}, {merge:true});
    } catch(e) { console.warn('Ticket history save:', e); }
  }
}


// ═══════════════════════════════════════════════
// PROFILE & SETTINGS
// ═══════════════════════════════════════════════
function showProfile() {
  fillProfileForm();
  const overlay = document.getElementById('profileOverlay');
  overlay.classList.add('on');
  // Swipe-down to close — only when modal is already scrolled to top
  const modal = document.getElementById('profileModalInner');
  if(!modal) return;
  let startY = 0, startScrollTop = 0, swipeEnabled = false;
  const onStart = e => {
    startY = e.touches[0].clientY;
    startScrollTop = modal.scrollTop;
    swipeEnabled = false;
    modal.style.transition = 'none';
  };
  const onMove = e => {
    const dy = e.touches[0].clientY - startY;
    // Only swipe-to-close if modal is AT TOP and dragging DOWN
    if(startScrollTop <= 2 && dy > 8) {
      swipeEnabled = true;
      e.preventDefault(); // prevent scroll while swiping to close
      modal.style.transform = `translateY(${Math.max(0,dy)}px)`;
      modal.style.opacity = String(Math.max(0, 1 - dy/300));
    } else {
      swipeEnabled = false;
      // Let the modal scroll normally
    }
  };
  const onEnd = e => {
    modal.style.transition = '';
    const dy = e.changedTouches[0].clientY - startY;
    if(swipeEnabled && dy > 90) {
      modal.style.transform = '';
      modal.style.opacity = '';
      closeProfile();
    } else {
      modal.style.transform = '';
      modal.style.opacity = '';
    }
    swipeEnabled = false;
  };
  // Remove old listeners before adding new ones
  if(modal._swipe) {
    modal.removeEventListener('touchstart', modal._swipe.s);
    modal.removeEventListener('touchmove', modal._swipe.m);
    modal.removeEventListener('touchend', modal._swipe.e);
  }
  modal.addEventListener('touchstart', onStart, {passive:true});
  modal.addEventListener('touchmove', onMove, {passive:false}); // passive:false to allow preventDefault
  modal.addEventListener('touchend', onEnd, {passive:true});
  modal._swipe = {s:onStart, m:onMove, e:onEnd};
}

function closeProfile() {
  document.getElementById('profileOverlay').classList.remove('on');
  const modal = document.getElementById('profileModalInner');
  if(modal) { modal.style.transform=''; modal.style.opacity=''; }
}

function togglePrixMode(el) {
  el.classList.toggle('on');
  const show = el.classList.contains('on');
  document.getElementById('budgetSection').style.display = show ? 'block' : 'none';
  state.profile.showPrix = show;
  saveState();
  renderList(); // re-render for budget bar + stat card
}

function saveBudget() {
  const val = parseInt(document.getElementById('profileBudget').value);
  if(!isNaN(val) && val > 0) {
    state.budget = val;
    syncToFirestore('budget', val);
    saveState(); renderList();
    showToast('✅','Budget mis à jour', val + '€/semaine');
    closeProfile();
  }
}

// ═══════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════
// Theme config: id, label, accent color, bg dark?
const THEMES = [
  {id:'light',  label:'☀️ Clair',   accent:'#ff6b6b', dark:false},
  {id:'dark',   label:'🌑 Sombre',  accent:'#ff8e53', dark:true},
  {id:'rouge',  label:'🔴 Rouge',   accent:'#e74c3c', dark:false},
  {id:'violet', label:'🟣 Violet',  accent:'#8e44ad', dark:false},
  {id:'ocean',  label:'🔵 Océan',   accent:'#2980b9', dark:false},
  {id:'green',  label:'🌿 Vert',    accent:'#27ae60', dark:false},
];

function toggleTheme() {
  const html = document.documentElement;
  const cur = html.dataset.theme || 'light';
  const ids = THEMES.map(t=>t.id);
  const next = ids[(ids.indexOf(cur)+1)%ids.length];
  applyTheme(next);
  const cfg = THEMES.find(t=>t.id===next)||THEMES[0];
  showToast('🎨', cfg.label, 'Thème appliqué');
}

function applyTheme(themeId) {
  const html = document.documentElement;
  html.dataset.theme = themeId;
  try { localStorage.setItem('sc_theme', themeId); } catch(e) {}
  const cfg = THEMES.find(t=>t.id===themeId) || THEMES[0];
  try {
    const col = encodeURIComponent(cfg.accent);
    const newIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E%3Crect width='180' height='180' rx='40' fill='" + col + "'/%3E%3Cpath d='M24 44h24l28 70h48l20-50H48' stroke='white' stroke-width='12' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3Ccircle cx='71' cy='138' r='12' fill='white'/%3E%3Ccircle cx='118' cy='138' r='12' fill='white'/%3E%3C/svg%3E";
    const fi = document.querySelector('link[rel="icon"]'); if(fi) fi.href = newIcon;
    const ai = document.querySelector('link[rel="apple-touch-icon"]'); if(ai) ai.href = newIcon;
    const tc = document.querySelector('meta[name="theme-color"]');
    if(tc) tc.content = cfg.dark ? '#14161a' : cfg.accent;
    // Update caddy icon for dark themes
    const tabListe = document.querySelector('#tab-liste svg');
    if(tabListe) tabListe.style.color = cfg.dark ? cfg.accent : '';
  } catch(e) {}
}

// ═══════════════════════════════════════════════
// CONFIRM DIALOG
// ═══════════════════════════════════════════════

function scanFridgeWithPhoto() {
  // Create a hidden file input and trigger it
  let fi = document.getElementById('_fridgeCamInput');
  if(!fi) {
    fi = document.createElement('input');
    fi.type = 'file'; fi.id = '_fridgeCamInput'; fi.accept = 'image/*';
    fi.style.display = 'none';
    document.body.appendChild(fi);
  }
  fi.value = '';
  fi.onchange = async function() {
    const file = fi.files[0];
    if(!file) return;
    await _runFridgeScan(file);
  };

  // On mobile show picker (camera or gallery), on desktop just file picker
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if(isMobile) {
    // Show choice overlay
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;';
    ov.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:480px;">
      <div style="width:36px;height:4px;background:var(--bg2);border-radius:2px;margin:0 auto 16px;"></div>
      <div style="font-weight:900;font-size:.95rem;margin-bottom:4px;">📸 Scanner le frigo</div>
      <div style="font-size:.75rem;color:var(--tx2);margin-bottom:16px;">Choisissez comment photographier vos aliments</div>
      <button onclick="document.getElementById('_fridgeCamInput').setAttribute('capture','environment');document.getElementById('_fridgeCamInput').click();this.closest('[style*=fixed]').remove();" class="btn acc" style="width:100%;padding:13px;margin-bottom:8px;border-radius:14px;font-weight:800;">📷 Prendre une photo</button>
      <button onclick="document.getElementById('_fridgeCamInput').removeAttribute('capture');document.getElementById('_fridgeCamInput').click();this.closest('[style*=fixed]').remove();" class="btn" style="width:100%;padding:12px;margin-bottom:8px;border-radius:14px;">🖼️ Choisir depuis la galerie</button>
      <button onclick="this.closest('[style*=fixed]').remove();" class="btn ghost" style="width:100%;padding:10px;color:var(--tx3);">Annuler</button>
    </div>`;
    ov.onclick = e => { if(e.target===ov) ov.remove(); };
    document.body.appendChild(ov);
  } else {
    fi.removeAttribute('capture');
    fi.click();
  }
}

async function _runFridgeScan(file) {
  const loadingOv = document.createElement('div');
  loadingOv.id = '_fridgeScanLoading';
  loadingOv.style.cssText = 'position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
  loadingOv.innerHTML = `
    <div style="width:70px;height:70px;border-radius:50%;border:4px solid rgba(255,255,255,.2);border-top-color:var(--ac);animation:spin .8s linear infinite;"></div>
    <div style="color:#fff;font-weight:800;font-size:1rem;">🤖 Analyse en cours…</div>
    <div style="color:rgba(255,255,255,.7);font-size:.8rem;" id="_fridgeScanStatus">Envoi de la photo à l'IA</div>
  `;
  document.body.appendChild(loadingOv);
  const setStatus = msg => { const el=document.getElementById('_fridgeScanStatus'); if(el) el.textContent=msg; };

  try {
    // Compress image: resize to max 600px, quality 0.6 → ~100-200KB base64, well under Vercel's 4.5MB
    const b64 = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        let w = img.width, h = img.height;
        if(w > MAX || h > MAX) {
          if(w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // Try quality 0.6 first, drop to 0.4 if still too large
        let dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        if(dataUrl.length > 3_000_000) dataUrl = canvas.toDataURL('image/jpeg', 0.4);
        res(dataUrl.split(',')[1]);
      };
      img.onerror = rej;
      const fr = new FileReader();
      fr.onload = e => img.src = e.target.result;
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });

    setStatus('Identification des aliments…');

    const resp = await fetch(API_BASE + '/api/gemini-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: b64,
        mimeType: 'image/jpeg',
        prompt: `You are a food detection API. Look at this image and return ONLY a JSON object. No explanation, no markdown, no text. Start with { and end with }.

{"aliments":[{"nom":"Tomates","emoji":"🍅","quantite":"4"},{"nom":"Lait","emoji":"🥛","quantite":"1L"},{"nom":"Fromage","emoji":"🧀","quantite":"200g"}]}

Detect every visible food item. Use French names. Maximum 20 items. Return ONLY the JSON.`
      })
    });

    if(!resp.ok) {
      const errText = await resp.text().catch(()=>'');
      throw new Error('Erreur serveur ' + resp.status + ' — ' + errText.slice(0, 150));
    }

    setStatus('Traitement…');
    const data = await resp.json();
    const rawText = (data.text || '').trim();
    console.log('[scan] Raw AI response:', rawText.slice(0, 500));

    if(!rawText) throw new Error('Réponse vide de l\'IA.');

    // Extract JSON: find first { and last } to strip any surrounding text
    const firstBrace = rawText.indexOf('{');
    const lastBrace  = rawText.lastIndexOf('}');
    if(firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('L\'IA n\'a pas retourné de JSON valide. Réponse: ' + rawText.slice(0, 100));
    }

    let aliments = [];
    const jsonStr = rawText.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      const raw = parsed.aliments || parsed.items || parsed.foods || [];
      aliments = raw.map(i => ({
        nom:      (i.nom || i.name || i.label || '').trim(),
        emoji:    i.emoji || '🥗',
        quantite: i.quantite || i.qty || i.quantity || '',
        categorie:i.categorie || i.category || '',
      })).filter(i => i.nom.length > 1);
    } catch(e) {
      throw new Error('JSON malformé: ' + e.message + ' — ' + jsonStr.slice(0, 100));
    }

    loadingOv.remove();

    if(!aliments.length) {
      showToast('⚠️', 'Aucun aliment trouvé', 'L\'IA n\'a pas détecté d\'aliments dans cette photo.');
      return;
    }

    _showFridgeScanResults(aliments);

  } catch(e) {
    loadingOv.remove();
    console.error('Fridge scan error:', e);
    showToast('❌', 'Erreur Gemini Vision', e.message || 'Vérifiez GEMINI_API_KEY dans Vercel.');
  }
}

function _showFridgeScanResults(aliments) {
  // Normalize — ensure every item has .nom regardless of source format
  aliments = aliments.map(a => ({
    nom:      a.nom || a.name || a.label || a.ingredient || String(a) || '?',
    emoji:    a.emoji || '🥗',
    quantite: a.quantite || a.qty || a.quantity || a.measure || '',
    categorie:a.categorie || a.category || '',
  })).filter(a => a.nom && a.nom !== '?' && a.nom.length > 1);

  console.log('[scan] _showFridgeScanResults received:', aliments.length, 'items:', aliments);

  if(!aliments.length) {
    showToast('⚠️', 'Liste vide', 'L\'IA n\'a pas retourné d\'aliments valides. Vérifiez la console.');
    return;
  }

  const existing = document.getElementById('_fridgeScanSheet');
  if(existing) existing.remove();

  const sheet = document.createElement('div');
  sheet.id = '_fridgeScanSheet';
  sheet.style.cssText = 'position:fixed;inset:0;z-index:8500;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;';

  const selected = new Set(aliments.map((_, i) => i));
  window._fridgeScanSelected = selected;
  window._fridgeScanCount = aliments.length;
  window._fridgeScanAliments = aliments; // store for _addSelectedFridgeItems

  sheet.innerHTML = `<div style="background:var(--bg);border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:85vh;display:flex;flex-direction:column;">
    <div style="padding:16px 18px 10px;border-bottom:1px solid var(--bg2);flex-shrink:0;">
      <div style="width:36px;height:4px;background:var(--bg2);border-radius:2px;margin:0 auto 12px;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:900;font-size:1rem;">🤖 ${aliments.length} aliment${aliments.length>1?'s':''} détecté${aliments.length>1?'s':''}</div>
          <div style="font-size:.72rem;color:var(--tx2);margin-top:2px;">Sélectionnez les aliments à ajouter à votre frigo</div>
        </div>
        <button onclick="document.getElementById('_fridgeScanSheet').remove()" style="width:30px;height:30px;border-radius:50%;background:var(--bg2);border:none;cursor:pointer;font-size:.9rem;">✕</button>
      </div>
    </div>
    <div style="overflow-y:auto;flex:1;padding:12px 14px;" id="_fridgeScanList">
      ${aliments.map((a, i) => `
        <div id="_fridgeItem_${i}" onclick="_toggleFridgeItem(${i})" style="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:12px;margin-bottom:6px;cursor:pointer;background:rgba(0,210,198,.1);border:1.5px solid rgba(0,210,198,.3);transition:all .15s;">
          <div style="font-size:1.4rem;flex-shrink:0;">${a.emoji}</div>
          <div style="flex:1;">
            <div style="font-weight:800;font-size:.88rem;">${a.nom}</div>
            ${a.quantite ? `<div style="font-size:.68rem;color:var(--tx2);">${a.quantite}</div>` : ''}
          </div>
          <div id="_fridgeCheck_${i}" style="width:22px;height:22px;border-radius:50%;background:var(--tl);display:flex;align-items:center;justify-content:center;color:#fff;font-size:.75rem;font-weight:900;flex-shrink:0;">✓</div>
        </div>
      `).join('')}
    </div>
    <div style="padding:12px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--bg2);flex-shrink:0;display:flex;gap:8px;">
      <button onclick="_selectAllFridgeItems(${aliments.length})" class="btn" style="flex:1;padding:11px;border-radius:12px;font-size:.8rem;">Tout sélectionner</button>
      <button onclick="_addSelectedFridgeItems()" class="btn acc" style="flex:2;padding:13px;border-radius:12px;font-weight:900;">🧊 Ajouter au frigo</button>
    </div>
  </div>`;
  sheet.onclick = e => { if(e.target===sheet) sheet.remove(); };
  document.body.appendChild(sheet);
}

function _toggleFridgeItem(i) {
  const sel = window._fridgeScanSelected || new Set();
  const item = document.getElementById('_fridgeItem_'+i);
  const check = document.getElementById('_fridgeCheck_'+i);
  if(sel.has(i)) {
    sel.delete(i);
    if(item) { item.style.background='var(--bg2)'; item.style.border='1.5px solid transparent'; }
    if(check) { check.style.background='var(--tx3)'; check.textContent=''; }
  } else {
    sel.add(i);
    if(item) { item.style.background='rgba(0,210,198,.1)'; item.style.border='1.5px solid rgba(0,210,198,.3)'; }
    if(check) { check.style.background='var(--tl)'; check.textContent='✓'; }
  }
  window._fridgeScanSelected = sel;
}

function _selectAllFridgeItems(count) {
  const sel = new Set();
  for(let i = 0; i < count; i++) {
    sel.add(i);
    const item = document.getElementById('_fridgeItem_'+i);
    const check = document.getElementById('_fridgeCheck_'+i);
    if(item) { item.style.background='rgba(0,210,198,.1)'; item.style.border='1.5px solid rgba(0,210,198,.3)'; }
    if(check) { check.style.background='var(--tl)'; check.textContent='✓'; }
  }
  window._fridgeScanSelected = sel;
}

function _addSelectedFridgeItems(aliments) {
  // Use stored aliments if not passed directly
  if(!aliments) aliments = window._fridgeScanAliments || [];
  if(typeof aliments === 'string') { try { aliments = JSON.parse(aliments); } catch(e) { aliments = window._fridgeScanAliments || []; } }

  const sel = window._fridgeScanSelected || new Set();
  let added = 0;
  aliments.forEach((a, i) => {
    if(!sel.has(i)) return;
    const nom = a.nom || a.name || '';
    if(!nom) return;
    const existing = state.fridge.find(f => f.name.toLowerCase() === nom.toLowerCase());
    if(existing) {
      existing.qty = (parseInt(existing.qty)||1) + 1;
    } else {
      state.fridge.push({
        id: 'f'+Date.now()+Math.random().toString(36).slice(2,5),
        name: nom,
        emoji: a.emoji || '🥗',
        qty: a.quantite || 1,
        cat: a.categorie || '🥦 Légumes',
      });
      added++;
    }
  });
  saveFridge();
  renderFridge();
  document.getElementById('_fridgeScanSheet')?.remove();
  const total = sel.size;
  showToast('🧊', total + ' aliment' + (total>1?'s':'') + ' ajouté' + (total>1?'s':''), 'Votre frigo a été mis à jour !');
  switchTab('frigo');
}


function switchScanTab(tab) {
  ['ticket', 'barcode', 'fridge'].forEach(t => {
    const btn = document.getElementById('scan-stab-' + t);
    const cap = t.charAt(0).toUpperCase() + t.slice(1);
    const mod = document.getElementById('scanMod' + cap);
    if(btn) btn.classList.toggle('on', t === tab);
    if(mod) mod.style.display = t === tab ? 'block' : 'none';
  });
  if(tab === 'barcode') renderBarcodeHistory();
  if(tab === 'ticket') stopBarcodeCamera();
  if(tab === 'fridge') {
    // Reset scan stats
    const stats = document.getElementById('fridgeScanStats');
    if(stats && stats.style.display !== 'none') {
      // keep shown if just scanned
    }
  }
}


// ═══════════════════════════════════════════════
// CODE-BARRES — Open Food Facts
// ═══════════════════════════════════════════════
const OFF_API = 'https://world.openfoodfacts.org/api/v2/product/';
const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
let barcodeStream = null;
let barcodeScanInterval = null;
let barcodeHistory = [];
try { barcodeHistory = JSON.parse(localStorage.getItem('sc_barcode_history') || '[]'); } catch(e) {}

// ── Lookup par code-barres ───────────────────────
async function lookupBarcode(code) {
  const inp = document.getElementById('barcodeInput');
  const barcode = (code || (inp ? inp.value.trim().replace(/\D/g,'') : '')).trim();
  if(!barcode || barcode.length < 8) {
    showToast('⚠️','Code invalide','Minimum 8 chiffres.');
    return;
  }
  if(inp) inp.value = barcode;
  stopBarcodeCamera();
  showBarcodeLoading('Recherche du produit...');
  // Scroll to result immediately
  setTimeout(() => {
    const r = document.getElementById('barcodeResult');
    if(r) r.scrollIntoView({behavior:'smooth', block:'nearest'});
  }, 100);
  try {
    const resp = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,brands,image_url,nutriscore_grade,ecoscore_grade,nova_group,nutriments,allergens_tags,labels_tags,additives_tags,categories_tags,quantity,ingredients_text_fr`,
      { headers: { 'User-Agent': 'SmartCard/3.0 - contact: smartcard-app' } }
    );
    const data = await resp.json();
    if(data.status !== 1 || !data.product) {
      showBarcodeError(`Code <strong>${barcode}</strong> non trouvé dans Open Food Facts.<br>Ce produit n'est peut-être pas encore référencé.`);
      return;
    }
    const product = enrichProduct(data.product, barcode);
    saveBarcodeHistory(product);
    displayBarcodeProduct(product);
  } catch(e) {
    showBarcodeError('Erreur réseau. Vérifiez votre connexion internet.');
  }
}

// ── Enrichissement produit ───────────────────────
function enrichProduct(p, barcode) {
  return {
    barcode,
    name: p.product_name || 'Produit inconnu',
    brand: (p.brands || '').split(',')[0].trim(),
    image: p.image_url || '',
    quantity: p.quantity || '',
    nutriscore: (p.nutriscore_grade || 'u').toLowerCase(),
    ecoscore: (p.ecoscore_grade || 'u').toLowerCase(),
    nova: p.nova_group || null,
    nutrients: p.nutriments || {},
    allergens: p.allergens_tags || [],
    labels: p.labels_tags || [],
    additives: (p.additives_tags || []).slice(0, 8),
    ingredients: p.ingredients_text_fr || '',
    categories: (p.categories_tags || []).filter(c => c.startsWith('en:')).slice(0, 3),
    timestamp: Date.now()
  };
}

// ── Nutriscore logo SVG ──────────────────────────
function nutriscoreSVG(grade) {
  const g = (grade||'u').toLowerCase();
  const colors = {a:'#1a9641',b:'#6ab74a',c:'#f4d03f',d:'#e67e22',e:'#d62728',u:'#9e9e9e'};
  const label = {a:'A',b:'B',c:'C',d:'D',e:'E',u:'?'};
  const textColor = g === 'c' ? '#333' : '#fff';
  const bg = colors[g] || colors.u;
  if(g === 'u') {
    // Special unknown logo
    return `<div style="display:inline-flex;align-items:center;gap:6px;">
      <div style="width:44px;height:44px;border-radius:12px;background:#e0e0e0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#9e9e9e" stroke-width="2"/><path d="M9 9a3 3 0 1 1 4 2.83V13M12 16v1" stroke="#9e9e9e" stroke-width="2" stroke-linecap="round"/></svg>
      </div>
      <span style="font-size:.7rem;color:var(--tx2);font-weight:600;">Non évalué</span>
    </div>`;
  }
  const grades = ['a','b','c','d','e'];
  const bars = grades.map(gr => {
    const active = gr === g;
    const bc = colors[gr];
    return `<div style="flex:1;height:${active?"18px":"12px"};border-radius:3px;background:${bc};transition:all .3s;${active?"box-shadow:0 2px 8px rgba(0,0,0,.3);":""};align-self:flex-end;"></div>`;
  }).join('');
  return `<div style="display:flex;align-items:flex-end;gap:3px;height:20px;">${bars}</div>
  <div style="display:flex;margin-top:4px;">
    ${grades.map(gr=>`<div style="flex:1;text-align:center;font-size:.58rem;font-weight:${gr===g?"900":"400"};color:${gr===g?colors[gr]:'var(--tx3)'};">${gr.toUpperCase()}</div>`).join('')}
  </div>`;
}

// ── Affichage produit — carte pliable inline ─────
function displayBarcodeProduct(product) {
  const zone = document.getElementById('barcodeResult');
  zone.style.display = 'block';

  const ns = product.nutriscore;
  const es = product.ecoscore;
  const novaLabel = {1:'Peu transformé 🌿',2:'Ingrédient culinaire',3:'Transformé ⚠️',4:'Ultra-transformé 🚫'};
  const n = product.nutrients;
  const kcal = n['energy-kcal_100g'] || n['energy-kcal'] || (n['energy_100g'] ? Math.round(n['energy_100g']/4.18) : null);
  const fat = n['fat_100g'];
  const satFat = n['saturated-fat_100g'];
  const sugar = n['sugars_100g'];
  const salt = n['salt_100g'];
  const protein = n['proteins_100g'];
  const fiber = n['fiber_100g'];

  const allergens = product.allergens.map(a=>a.replace('en:','').replace(/-/g,' ')).filter(Boolean);
  const goodLabels = product.labels
    .filter(l=>l.includes('bio')||l.includes('organic')||l.includes('fair')||l.includes('label-rouge')||l.includes('sans-ogm'))
    .map(l=>l.replace('en:','').replace(/-/g,' ')).slice(0,3);

  const safeProduct = JSON.stringify(product).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const cat0 = (product.categories[0]||'').replace(/'/g,"\\'");

  zone.innerHTML = `
    <!-- Carte compacte — toujours visible -->
    <div class="off-product-card" style="margin-bottom:0;">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;" onclick="toggleProductDetails(this)">
        ${product.image
          ? `<img class="off-product-img" src="${product.image}" style="width:56px;height:56px;" alt="${product.name}" onerror="this.outerHTML='<div style=\\'width:56px;height:56px;border-radius:var(--rs);background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0;\\'>🛒</div>'">`
          : `<div style="width:56px;height:56px;border-radius:var(--rs);background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:1.8rem;flex-shrink:0;">🛒</div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:900;font-size:.92rem;color:var(--tx);">${product.name}</div>
          ${product.brand ? `<div style="font-size:.72rem;color:var(--tx2);">${product.brand}${product.quantity?' · '+product.quantity:''}</div>` : ''}
          <!-- Mini nutriscore bar -->
          <div style="margin-top:6px;">${nutriscoreSVG(ns)}</div>
        </div>
        ${es !== 'u' ? `<div class="eco-score eco-${es}" title="Éco-Score">${es.toUpperCase()}</div>` : ''}
        <div style="color:var(--tx3);font-size:.9rem;transition:transform .3s;flex-shrink:0;" class="product-chevron">▼</div>
      </div>

      <!-- Boutons d'action — toujours visibles -->
      <div style="display:flex;gap:8px;padding:0 16px 14px;">
        <button class="btn acc" style="flex:1;padding:11px;font-size:.82rem;" onclick="addBarcodeToList(JSON.parse(this.closest('.off-product-card').dataset.product))">
          🛒 Ajouter à la liste
        </button>
        <button class="btn" style="flex:1;padding:11px;font-size:.82rem;" onclick="addBarcodeToFridge(JSON.parse(this.closest('.off-product-card').dataset.product))">
          🧊 Au frigo
        </button>
      </div>

      <!-- Détails dépliables -->
      <div class="product-details" style="display:none;border-top:1px solid var(--bg2);">
        <div style="padding:14px 16px;">

          <!-- Badges -->
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">
            ${product.nova ? `<span class="off-badge off-badge-${product.nova<=2?'green':product.nova===3?"orange":"red"}">NOVA ${product.nova} · ${novaLabel[product.nova]||''}</span>` : ''}
            ${goodLabels.map(l=>`<span class="off-badge off-badge-green">✓ ${l}</span>`).join('')}
            ${allergens.length ? `<span class="off-badge off-badge-red">⚠️ ${allergens.slice(0,3).join(', ')}</span>` : ''}
          </div>

          <!-- Valeurs nutritionnelles -->
          <div style="font-size:.7rem;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">Pour 100g</div>
          <div class="off-nutrient-grid">
            ${kcal!==null?`<div class="off-nutrient"><div class="off-nutrient-val" style="color:var(--ac);">${Math.round(kcal)}<span style="font-size:.6rem;"> kcal</span></div><div class="off-nutrient-lbl">Énergie</div></div>`:''}
            ${protein!==undefined?`<div class="off-nutrient"><div class="off-nutrient-val" style="color:var(--bl);">${protein.toFixed(1)}<span style="font-size:.6rem;"> g</span></div><div class="off-nutrient-lbl">Protéines</div></div>`:''}
            ${fat!==undefined?`<div class="off-nutrient"><div class="off-nutrient-val" style="color:var(--lv);">${fat.toFixed(1)}<span style="font-size:.6rem;"> g</span></div><div class="off-nutrient-lbl">Lipides</div>${satFat!==undefined?`<div class="off-nutrient-per">sat. ${satFat.toFixed(1)}g</div>`:''}</div>`:''}
            ${sugar!==undefined?`<div class="off-nutrient"><div class="off-nutrient-val" style="color:var(--or);">${sugar.toFixed(1)}<span style="font-size:.6rem;"> g</span></div><div class="off-nutrient-lbl">Sucres</div></div>`:''}
            ${salt!==undefined?`<div class="off-nutrient"><div class="off-nutrient-val" style="color:var(--yl);">${salt.toFixed(2)}<span style="font-size:.6rem;"> g</span></div><div class="off-nutrient-lbl">Sel</div></div>`:''}
            ${fiber!==undefined?`<div class="off-nutrient"><div class="off-nutrient-val" style="color:var(--gn);">${fiber.toFixed(1)}<span style="font-size:.6rem;"> g</span></div><div class="off-nutrient-lbl">Fibres</div></div>`:''}
          </div>

          ${product.additives.length?`<div style="margin:10px 0;"><div style="font-size:.7rem;font-weight:800;color:var(--tx3);text-transform:uppercase;margin-bottom:4px;">Additifs</div><div>${product.additives.map(a=>`<span class="additive-chip">${a.replace('en:','').toUpperCase()}</span>`).join('')}</div></div>`:''}

          ${product.ingredients?`<details style="margin-bottom:10px;"><summary style="font-size:.75rem;font-weight:700;color:var(--tx2);cursor:pointer;">📋 Ingrédients</summary><div style="font-size:.7rem;color:var(--tx2);line-height:1.6;margin-top:6px;">${product.ingredients}</div></details>`:''}

          <!-- Alternatives — auto-loaded -->
          <div id="barcodeAltZone" style="margin-top:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div style="font-weight:800;font-size:.85rem;">✨ Alternatives plus saines</div>
              <button class="btn sm" style="font-size:.65rem;padding:4px 10px;" onclick="loadAlternatives('${product.barcode}','${cat0}','${ns}')">🔄 Rafraîchir</button>
            </div>
            <div id="barcodeAltList"><div style="text-align:center;padding:8px;color:var(--tx3);font-size:.75rem;">Chargement…</div></div>
          </div>
        </div>
      </div>
    </div>`;

  // Store product data on element
  zone.querySelector('.off-product-card').dataset.product = JSON.stringify(product);

  // Auto-load alternatives immediately (no button tap required)
  const cat0first = (product.categories[0]||'').replace('en:','').trim();
  if(cat0first) {
    loadAlternatives(product.barcode, cat0first, product.nutriscore);
  }
}

function toggleProductDetails(header) {
  const card = header.closest('.off-product-card');
  const details = card.querySelector('.product-details');
  const chevron = card.querySelector('.product-chevron');
  const isOpen = details.style.display !== 'none';
  details.style.display = isOpen ? 'none' : 'block';
  chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

// ── Ajouter à la liste ───────────────────────────
function addBarcodeToList(product) {
  const matched = findBestProduct(product.name);
  state.items.unshift({
    id: 'i'+Date.now()+Math.random().toString(36).slice(2,7),
    name: matched ? matched.name : product.name,
    emoji: matched ? matched.emoji : guessEmoji(product.name),
    cat: matched ? matched.cat : '🍝 Épicerie',
    price: 0, qty:'', checked:false, addedAt:Date.now(),
    addedBy: currentUser ? currentUser.email : '',
    nutriscore: product.nutriscore, brand: product.brand, barcode: product.barcode
  });
  saveItems(); renderList();
  showToast('✅', product.name, 'Nutri-Score ' + product.nutriscore.toUpperCase() + (product.brand?' · '+product.brand:''));
}

function addBarcodeToFridge(product) {
  const matched = findBestProduct(product.name);
  const name = matched ? matched.name : product.name;
  const ex = state.fridge.find(f => f.name.toLowerCase() === name.toLowerCase());
  if(ex) { ex.qty = (parseInt(ex.qty)||1)+1; }
  else { state.fridge.push({id:'f'+Date.now()+Math.random().toString(36).slice(2,5),name,emoji:matched?matched.emoji:guessEmoji(product.name),qty:1,cat:matched?matched.cat:'🍝 Épicerie',nutriscore:product.nutriscore}); }
  saveFridge(); renderFridge();
  showToast('🧊', name, 'Ajouté au frigo');
}

// ── Alternatives — Open Food Facts ───────────────
async function loadAlternatives(barcode, category, currentNS) {
  const zone = document.getElementById('barcodeAltZone');
  const list = document.getElementById('barcodeAltList');
  if(!zone || !list) return;
  zone.style.display = 'block';
  list.innerHTML = `<div class="scan-loader" style="padding:16px 0;"><div class="scan-loader-spinner" style="width:28px;height:28px;border-width:2px;"></div></div>`;

  try {
    // Utiliser une catégorie nettoyée, simplifée
    let cat = (category || '').replace('en:','').replace(/-/g,' ').trim();
    if(!cat || cat.length < 3) cat = 'beverages'; // fallback

    // OFF search endpoint correct avec JSONP-safe fields
    const url = `https://world.openfoodfacts.org/cgi/search.pl?action=process&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(cat)}&sort_by=uniquescans_n&page_size=10&json=1&fields=code,product_name,brands,image_url,nutriscore_grade,nutriments`;

    const resp = await fetch(url);
    if(!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();

    const grades = ['a','b','c','d','e'];
    const curIdx = grades.indexOf(currentNS);
    const products = (data.products || [])
      .filter(p => {
        const pg = (p.nutriscore_grade||'u').toLowerCase();
        return p.code !== barcode && p.product_name && pg !== 'u' && grades.indexOf(pg) <= Math.max(0, curIdx - 1);
      })
      .slice(0, 5);

    if(!products.length) {
      // Try without grade filter if nothing better found
      const fallback = (data.products || []).filter(p => p.code !== barcode && p.product_name).slice(0,4);
      if(!fallback.length) { list.innerHTML = `<div style="text-align:center;padding:12px;color:var(--tx2);font-size:.78rem;">Aucune alternative trouvée pour cette catégorie.</div>`; return; }
      renderAlternatives(fallback);
    } else {
      renderAlternatives(products);
    }
  } catch(e) {
    list.innerHTML = `<div style="text-align:center;padding:12px;color:var(--tx2);font-size:.78rem;">Impossible de charger les alternatives.<br><span style="font-size:.65rem;">Vérifiez votre connexion.</span></div>`;
  }
}

function renderAlternatives(products) {
  const list = document.getElementById('barcodeAltList');
  if(!list) return;
  list.innerHTML = products.map(p => {
    const ns = (p.nutriscore_grade||'u').toLowerCase();
    const kcal = p.nutriments ? (p.nutriments['energy-kcal_100g']||null) : null;
    const colors = {a:'#1a9641',b:'#6ab74a',c:'#f4d03f',d:'#e67e22',e:'#d62728',u:'#9e9e9e'};
    return `<div class="off-alt-card" onclick="lookupBarcode('${p.code}')">
      ${p.image_url
        ? `<img class="off-alt-img" src="${p.image_url}" alt="" onerror="this.style.display='none'">`
        : `<div class="off-alt-img" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem;">🛒</div>`}
      <div style="flex:1;min-width:0;">
        <div class="off-alt-name">${p.product_name}</div>
        <div class="off-alt-brand">${p.brands||''}${kcal?' · '+Math.round(kcal)+' kcal':''}</div>
      </div>
      <div style="width:28px;height:28px;border-radius:8px;background:${colors[ns]};display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:900;color:${ns==='c'?"#333":"#fff"};flex-shrink:0;">${ns.toUpperCase()}</div>
      <div style="color:var(--tx3);font-size:.85rem;margin-left:4px;">›</div>
    </div>`;
  }).join('');
}

// ── Scan caméra avec fallback fichier ────────────
// ── Historique ────────────────────────────────────
function saveBarcodeHistory(product) {
  barcodeHistory = barcodeHistory.filter(h => h.barcode !== product.barcode);
  barcodeHistory.unshift(product);
  if(barcodeHistory.length > 20) barcodeHistory.pop();
  try { localStorage.setItem('sc_barcode_history', JSON.stringify(barcodeHistory)); } catch(e) {}
  renderBarcodeHistory();
}

function renderBarcodeHistory() {
  const zone = document.getElementById('barcodeHistory');
  const list = document.getElementById('barcodeHistoryList');
  if(!zone || !list) return;
  if(!barcodeHistory.length) { zone.style.display='none'; return; }
  zone.style.display = 'block';
  const colors = {a:'#1a9641',b:'#6ab74a',c:'#f4d03f',d:'#e67e22',e:'#d62728',u:'#9e9e9e'};
  list.innerHTML = barcodeHistory.slice(0,8).map(h => `
    <div class="barcode-hist-item" onclick="lookupBarcode('${h.barcode}')">
      ${h.image
        ? `<img class="barcode-hist-img" src="${h.image}" alt="" onerror="this.style.display='none'">`
        : `<div class="barcode-hist-img" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;">🛒</div>`}
      <div style="flex:1;min-width:0;">
        <div class="barcode-hist-name">${h.name}</div>
        <div class="barcode-hist-sub">${h.brand||''} · <span style="font-family:monospace;">${h.barcode}</span></div>
      </div>
      <div style="width:24px;height:24px;border-radius:7px;background:${colors[(h.nutriscore||'u').toLowerCase()]};display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:900;color:${h.nutriscore==='c'?"#333":"#fff"};flex-shrink:0;">${(h.nutriscore||'?').toUpperCase()}</div>
    </div>`).join('');
}

function clearBarcodeHistory() {
  barcodeHistory = [];
  try { localStorage.removeItem('sc_barcode_history'); } catch(e) {}
  renderBarcodeHistory();
  showToast('✅','Historique effacé','');
}

// ── États intermédiaires ──────────────────────────
function showBarcodeLoading(msg) {
  const zone = document.getElementById('barcodeResult');
  if(!zone) return;
  zone.style.display = 'block';
  zone.innerHTML = `<div class="scan-loader"><div class="scan-loader-spinner"></div><div style="font-size:.82rem;color:var(--tx2);">${msg}</div></div>`;
}

function showBarcodeError(msg) {
  const zone = document.getElementById('barcodeResult');
  if(!zone) return;
  zone.style.display = 'block';
  zone.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--rs);box-shadow:var(--so);padding:20px 16px;text-align:center;">
      <div style="font-size:2rem;margin-bottom:8px;">🔍</div>
      <div style="font-weight:900;font-size:.9rem;color:var(--rd);margin-bottom:8px;">Produit introuvable</div>
      <div style="font-size:.78rem;color:var(--tx2);line-height:1.7;">${msg}</div>
    </div>`;
}




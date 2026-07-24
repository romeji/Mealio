// api/gemini-vision.js — Vision avec fallback automatique Gemini → Claude
import { applyPrivateCors, requireUser } from './_auth.js';
export default async function handler(req, res) {
  applyPrivateCors(req, res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!await requireUser(req, res)) return;

  const { imageBase64, mimeType = 'image/jpeg', prompt } = req.body || {};
  if (!imageBase64) { res.status(400).json({ error: 'Missing imageBase64' }); return; }
  if (imageBase64.length > 4_000_000) { res.status(413).json({ error: 'Image too large' }); return; }

  const defaultPrompt = `Analyse cette photo de frigo ou d'aliments. Liste tous les aliments visibles.
Réponds UNIQUEMENT en JSON valide sans balises markdown:
{"aliments":[{"nom":"Lait","emoji":"🥛","quantite":"1 litre","categorie":"laitage"},{"nom":"Tomates","emoji":"🍅","quantite":"4","categorie":"légumes"}]}`;

  const promptText = prompt || defaultPrompt;

  // ── 1. Essayer Gemini ───────────────────────────────────
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (GEMINI_KEY) {
    // Modèles dans l'ordre de préférence — noms exacts de l'API v1beta
    const MODELS = [
      'gemini-2.0-flash-latest',
      'gemini-flash-latest',
      'gemini-2.0-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
    ];
    for (const model of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
        console.log(`[vision] Trying Gemini ${model}...`);
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: promptText }
            ]}],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048,
              // Désactive le "thinking" (raisonnement interne) sur les modèles
              // 2.0/2.5 qui l'activent par défaut. Sans ceci, les tokens de
              // raisonnement sont comptés dans maxOutputTokens et peuvent
              // épuiser tout le budget avant que le modèle n'écrive la vraie
              // réponse JSON — d'où des réponses tronquées à 1 seul élément.
              thinkingConfig: { thinkingBudget: 0 },
            }
          })
        });
        const data = await r.json();
        const part = data.candidates?.[0]?.content?.parts?.find(p => p.text && !p.thought);
        if (r.ok && part?.text) {
          console.log(`[vision] ✅ Gemini ${model} OK`);
          return res.status(200).json({ text: part.text, model });
        }
        const err = data?.error?.message || '';
        console.warn(`[vision] Gemini ${model} failed (${r.status}): ${err}`);
        // Réponse coupée par manque de tokens (thinking résiduel ou image complexe)
        if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          console.warn(`[vision] Gemini ${model} MAX_TOKENS atteint — tentative modèle suivant`);
          continue;
        }
        // Quota/billing dépassé → passer directement à Claude
        if (r.status === 429 || err.includes('quota') || err.includes('billing') || err.includes('exceeded')) {
          console.log('[vision] Quota Gemini dépassé → fallback Claude');
          break;
        }
        // Modèle non trouvé (404) → essayer le suivant
        if (r.status === 404 || err.includes('not found')) continue;
        // Autre erreur → arrêter Gemini
        break;
      } catch (e) {
        console.warn(`[vision] Gemini ${model} exception: ${e.message}`);
      }
    }
  } else {
    console.warn('[vision] GEMINI_API_KEY not set');
  }

  // ── 2. Fallback → Claude Vision ────────────────────────
  const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
  if (CLAUDE_KEY) {
    try {
      console.log('[vision] Trying Claude Vision fallback...');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
              { type: 'text', text: promptText }
            ]
          }]
        })
      });
      const data = await r.json();
      if (r.ok && data.content?.[0]?.text) {
        console.log('[vision] ✅ Claude Vision OK');
        return res.status(200).json({ text: data.content[0].text, model: 'claude-haiku' });
      }
      console.warn('[vision] Claude failed:', data?.error?.message);
      return res.status(502).json({ error: 'Claude vision failed', details: data?.error?.message });
    } catch (e) {
      console.warn('[vision] Claude exception:', e.message);
    }
  } else {
    console.warn('[vision] CLAUDE_API_KEY not set');
  }

  res.status(502).json({
    error: 'Vision non disponible',
    hint: 'Vérifiez GEMINI_API_KEY et CLAUDE_API_KEY dans Vercel → Settings → Environment Variables'
  });
}

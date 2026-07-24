// api/mistral-correct.js — Correction de noms de produits OCR via Mistral AI
import { applyPrivateCors, requireUser } from './_auth.js';
// La clé API reste côté serveur (variable d'environnement Vercel), jamais
// exposée dans le code front — contrairement à l'ancienne implémentation où
// MISTRAL_KEY était en clair dans scan.js et visible par quiconque inspecte
// le code source.
export default async function handler(req, res) {
  applyPrivateCors(req, res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!await requireUser(req, res)) return;

  const { lines } = req.body || {};
  if (!Array.isArray(lines) || !lines.length) {
    res.status(400).json({ error: 'Missing or invalid "lines" array' });
    return;
  }
  if (lines.length > 150 || JSON.stringify(lines).length > 30000) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
  if (!MISTRAL_KEY) {
    console.warn('[mistral] MISTRAL_API_KEY not set');
    // Pas de clé configurée : renvoyer les lignes telles quelles plutôt
    // que de faire planter le scan de ticket (dégradation gracieuse).
    return res.status(200).json({ results: lines, fallback: true });
  }

  const prompt = `Tu es expert en tickets de caisse français (Carrefour, Leclerc, Lidl, etc.).

Corrige ces noms de produits issus d'un OCR (souvent déformés, tronqués, en majuscules ou avec des erreurs) en noms de produits courants et lisibles en français.

${JSON.stringify(lines)}

Règles STRICTES :
- Corrige les fautes et abréviations OCR
- Garde les noms courts et naturels (ex: "LAIT 1/2 ECR 1L" → "Lait demi-écrémé")
- NE PAS inclure les quantités (ex: "2x", "x3", "1 X") dans le nom — ce sont des multiplicateurs de ligne, pas le nom du produit
- NE PAS inclure les volumes ou poids dans le nom sauf si ça fait partie du nom commercial (ex: "Coca 1,5L" → "Coca-Cola")
- Si tu ne reconnais pas, retourne le nom nettoyé sans chiffres parasites
- Réponds UNIQUEMENT en JSON tableau de strings, même ordre, même longueur, sans texte autour`;

  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + MISTRAL_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();

    if (!r.ok) {
      console.warn('[mistral] API error:', data?.error?.message || r.status);
      return res.status(200).json({ results: lines, fallback: true });
    }

    let results;
    try {
      const raw = data.choices[0].message.content;
      results = JSON.parse(raw.replace(/```json|```/g, '').trim());
      if (!Array.isArray(results) || results.length !== lines.length) {
        throw new Error('Réponse Mistral invalide (longueur/format)');
      }
    } catch (e) {
      console.warn('[mistral] Parse error:', e.message);
      results = lines; // dégradation gracieuse : renvoyer les lignes brutes
    }

    return res.status(200).json({ results });
  } catch (e) {
    console.warn('[mistral] Exception:', e.message);
    return res.status(200).json({ results: lines, fallback: true });
  }
}

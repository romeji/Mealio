// api/claude.js — Claude → OpenAI → Mistral (fallbacks automatiques)
import { applyPrivateCors, requireUser } from './_auth.js';
export default async function handler(req, res) {
  applyPrivateCors(req, res);
  if(req.method === 'OPTIONS') { res.status(200).end(); return; }
  if(req.method !== 'POST')    { res.status(405).json({error:'Method not allowed'}); return; }
  if(!await requireUser(req, res)) return;

  const body = req.body || {};
  body.max_tokens = Math.min(Math.max(Number(body.max_tokens) || 1024, 64), 2500);
  if(JSON.stringify(body).length > 60000) return res.status(413).json({error:'Payload too large'});

  const CLAUDE_KEY  = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API;
  const OPENAI_KEY  = process.env.OPENAI_API_KEY || process.env.OPENAI_API;
  const MISTRAL_KEY = process.env.MISTRAL_API_KEY || process.env.MISTRAL_API;

  console.log('Keys — Claude:', !!CLAUDE_KEY, '| OpenAI:', !!OPENAI_KEY, '| Mistral:', !!MISTRAL_KEY);

  // ── Helper: est-ce une erreur de crédit/quota ? ──────────
  function isCreditError(status, msg='') {
    return status === 402 || status === 429 ||
      msg.includes('credit') || msg.includes('balance') ||
      msg.includes('quota') || msg.includes('billing');
  }

  // ── 1. Claude ────────────────────────────────────────────
  if(CLAUDE_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ ...body, model: body.model || 'claude-3-5-haiku-20241022' }),
      });
      const data = await r.json();
      if(r.ok) { console.log('✅ Claude OK'); return res.status(200).json(data); }
      const msg = data?.error?.message || '';
      console.warn('Claude error:', r.status, msg);
      if(!isCreditError(r.status, msg)) return res.status(r.status).json(data);
      console.log('Claude credit exhausted → trying OpenAI');
    } catch(e) { console.warn('Claude fetch error:', e.message); }
  }

  // ── Convertir messages Anthropic → OpenAI/Mistral ───────
  function toOpenAIMessages(body) {
    const msgs = [];
    if(body.system) msgs.push({ role: 'system', content: body.system });
    (body.messages || []).forEach(m => msgs.push({ role: m.role, content: m.content }));
    return msgs;
  }

  // ── 2. OpenAI GPT-4o-mini ────────────────────────────────
  if(OPENAI_KEY) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: toOpenAIMessages(body),
          max_tokens: body.max_tokens,
          temperature: 0.3,
        }),
      });
      const data = await r.json();
      if(r.ok) {
        const text = data.choices?.[0]?.message?.content || '';
        console.log('✅ OpenAI OK');
        return res.status(200).json({ content: [{ type:'text', text }], model:'gpt-4o-mini', _provider:'openai' });
      }
      const msg = data?.error?.message || '';
      console.warn('OpenAI error:', r.status, msg);
      if(!isCreditError(r.status, msg)) return res.status(r.status).json({ error: msg });
      console.log('OpenAI quota exceeded → trying Mistral');
    } catch(e) { console.warn('OpenAI fetch error:', e.message); }
  }

  // ── 3. Mistral AI (dernier recours) ──────────────────────
  if(MISTRAL_KEY) {
    try {
      const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MISTRAL_KEY },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: toOpenAIMessages(body),
          max_tokens: body.max_tokens,
          temperature: 0.3,
        }),
      });
      const data = await r.json();
      if(r.ok) {
        const text = data.choices?.[0]?.message?.content || '';
        console.log('✅ Mistral OK');
        return res.status(200).json({ content: [{ type:'text', text }], model:'mistral-small', _provider:'mistral' });
      }
      console.error('Mistral error:', r.status, data?.message || '');
      return res.status(r.status).json({ error: data?.message || 'Mistral error' });
    } catch(e) {
      console.error('Mistral fetch error:', e.message);
      return res.status(500).json({ error: 'Mistral: ' + e.message });
    }
  }

  // ── Aucune clé disponible ─────────────────────────────────
  return res.status(500).json({
    error: 'Aucune API disponible. Configurez CLAUDE_API, OPENAI_API ou MISTRAL_API dans Vercel.'
  });
}

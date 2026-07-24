const FIELDS = [
  'product_name', 'brands', 'image_url', 'nutriscore_grade', 'ecoscore_grade',
  'nova_group', 'nutriments', 'allergens_tags', 'labels_tags', 'additives_tags',
  'categories_tags', 'quantity', 'ingredients_text_fr',
].join(',');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const barcode = String(req.query?.barcode || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(barcode.length)) {
    return res.status(400).json({ error: 'Invalid barcode' });
  }
  try {
    const upstream = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?fields=${FIELDS}`,
      { headers: { 'User-Agent': process.env.OFF_USER_AGENT || 'Mealio/3.0 (contact@votre-domaine.fr)' } },
    );
    const data = await upstream.json();
    return res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (error) {
    return res.status(502).json({ error: 'Open Food Facts unavailable' });
  }
}

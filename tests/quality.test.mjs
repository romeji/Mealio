import assert from 'node:assert/strict';
import '../mealio-quality.js';

const q = globalThis.MealioQuality;

assert.equal(q.canonicalFoodKey('4 tomates fraîches'), 'tomate');
assert.equal(q.foodMatches('Œufs bio', '2 oeufs'), true);
assert.equal(q.foodMatches('lait', 'chocolat'), false);
assert.equal(q.mergeDetectedFoods([
  { nom: 'Tomates', confiance: .8 },
  { nom: 'tomate fraîche', confiance: .9 },
]).length, 1);

const score = q.scoreRecipeForFridge(
  { ingredients: ['2 œufs', 'tomates', 'fromage', 'farine'] },
  [{ name: 'Oeufs bio' }, { name: '3 tomates' }, { name: 'fromage râpé' }],
);
assert.equal(score.matchCount, 3);
assert.equal(score.missing.length, 1);
assert.equal(score.canCook, true);

assert.equal(q.isValidBarcode('3017620422003'), true);
assert.equal(q.isValidBarcode('3017620422004'), false);
assert.equal(q.escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');

console.log('Tests qualité Mealio : OK');

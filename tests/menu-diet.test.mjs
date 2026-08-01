import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function _recipeMatchesDiet');
const end = html.indexOf('function _rankRecipesForProfile', start);
assert.ok(start >= 0 && end > start, 'Le filtre de régime doit rester disponible dans index.html');

const source = html.slice(start, end).trim();
const recipeMatchesDiet = Function(`return (${source})`)();

assert.equal(recipeMatchesDiet({ diet:'veg', ingredients:[] }, 'veg'), true);
assert.equal(recipeMatchesDiet({ diet:'vegan', ingredients:[] }, 'veg'), true);
assert.equal(recipeMatchesDiet({ diet:'veg', ingredients:[] }, 'vegan'), false);
assert.equal(recipeMatchesDiet({ diet:'vegan', ingredients:[] }, 'vegan'), true);
assert.equal(recipeMatchesDiet({ diet:'veg', ingredients:[] }, 'pesc'), true);
assert.equal(recipeMatchesDiet({ diet:'pesc', ingredients:[] }, 'pesc'), true);
assert.equal(recipeMatchesDiet({ eatingHabits:{ glutenFree:true }, ingredients:[] }, 'gluten'), true);
assert.equal(recipeMatchesDiet({ ingredients:[{name:'Farine de blé'}] }, 'gluten'), false);
assert.equal(recipeMatchesDiet({ ingredients:[{name:'Jambon cru'}] }, 'halal'), false);
assert.equal(recipeMatchesDiet({ ingredients:[{name:'Poulet rôti'}] }, 'halal'), true);
assert.equal(recipeMatchesDiet({ carb:18, ingredients:[] }, 'keto'), true);
assert.equal(recipeMatchesDiet({ carb:42, ingredients:[] }, 'keto'), false);

assert.match(html, /incompatible\.length/);
assert.match(html, /state\.weekMenuDiet = data\.diet/);
assert.match(html, /function continueMenuJourney\([\s\S]*?generateAIMenuFull\(\)/);

console.log('Tests régimes Menu Mealio : OK');

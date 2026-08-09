import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadProduct(state) {
  const window = { addEventListener() {}, lucide:null };
  const context = vm.createContext({
    window, state, console, Date,
    document:{ getElementById(){ return null; }, querySelectorAll(){ return []; } }
  });
  vm.runInContext(fs.readFileSync(new URL('../mealio-product.js', import.meta.url), 'utf8'), context);
  return window.MealioProduct;
}

test('le résumé de semaine déduplique les ingrédients et distingue le frigo', () => {
  const product = loadProduct({
    profile:{diet:'veg'},
    fridge:[{id:'f1',name:'Tomates cerises',qty:2,addedAt:Date.now()}],
    weekMenu:{
      1:{l:'Salade',lData:{recipeId:'r1',kcal:420,ingredients:[{name:'Tomates cerises',quantity:'200',unit:'g'},{name:'Feta'}]}},
      2:{d:'Pâtes',dData:{recipeId:'r2',kcal:610,ingredients:[{name:'Tomates cerises'},{name:'Pâtes'}]}}
    }
  });
  const summary = product.summary();
  assert.equal(summary.meals.length, 2);
  assert.equal(summary.uniqueRecipes, 2);
  assert.equal(summary.totalKcal, 1030);
  assert.equal(summary.ingredients.length, 3);
  assert.equal([...summary.available].map(item => item.name).join('|'), 'Tomates cerises');
  assert.equal([...summary.missing].map(item => item.name).join('|'), 'Feta|Pâtes');
});

test('la conservation estimée est plus courte pour le poisson que pour l’épicerie', () => {
  const product = loadProduct({profile:{},fridge:[],weekMenu:{}});
  const addedAt = Date.now();
  const fish = product.estimatedExpiry({name:'Saumon frais',cat:'Poisson',addedAt});
  const rice = product.estimatedExpiry({name:'Riz basmati',cat:'Épicerie',addedAt});
  assert.ok(fish > addedAt);
  assert.ok(rice > fish);
});

test('les garde-fous UX empêchent le retour des régressions bloquantes', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /#menuPanelWeek>\.menu-week-workspace-v4>\.card\.mb14\{display:none!important\}/);
  assert.match(html, /#menuPanelWeek>\.menu-week-workspace-v4>#menuPlannerCardV6\.open\{display:flex!important\}/);
  assert.match(html, /id="profileBackBarV6"/);
  assert.match(html, /#vFrigo \.rc-img-wrap\{position:static!important/);
  assert.match(html, /\.recipe-unified-card>img\{position:static!important/);
});

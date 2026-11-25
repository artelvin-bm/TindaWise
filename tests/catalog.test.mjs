import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priced, makeBasket, normalizePriceInput, rankMatches, validatePriceRecord } from '../engine.mjs';
const products = JSON.parse(readFileSync(new URL('../products.json', import.meta.url),'utf8'));
test('catalog has 66 unique IDs and named products',()=>{
 assert.equal(products.length,66);
 assert.equal(new Set(products.map(p=>p.id)).size,66);
 assert.ok(products.every(p=>p.id && p.category && p.name));
});
test('no speculative selling price is presented as verified',()=>{
 assert.ok(products.every(p=>!p.verified && p.price===null));
 assert.ok(products.every(p=>priced(p,false)===null));
});
test('poster SRP appears only in preview and stays labeled',()=>{
 const sample=products.find(p=>p.srp===10);
 assert.equal(priced(sample,false),null);
 assert.deepEqual(priced(sample,true),{value:10,kind:'SRP'});
});
test('verified owner-entered price supersedes poster SRP',()=>{
 const p={...products[0],price:14,verified:true};
 assert.deepEqual(priced(p,true),{value:14,kind:'confirmed'});
});

test('an unverified store price takes precedence over a poster SRP and counts toward the budget', () => {
  const product = { ...products.find(p => p.srp === 10), price: 14, verified: false };
  const matches = [{ p: product }];
  const expected = { value: 14, kind: 'unverified' };

  assert.deepEqual(priced(product, true), expected);
  assert.deepEqual(priced(product, false), expected);
  assert.deepEqual(makeBasket(matches, 14)[0].pr, expected);
  assert.deepEqual(makeBasket(matches, 13.99, true), []);
});
test('basket never overspends and limits item count',()=>{
 const ranked=products.map(p=>({p,score:1}));
 const basket=makeBasket(ranked,50,true);
 assert.ok(basket.reduce((sum,x)=>sum+x.pr.value,0)<=50);
 assert.ok(basket.length<=6);
 assert.equal(makeBasket(ranked,50,false).length,0);
 assert.equal(makeBasket(ranked,-1,true).length,0);
});
test('invalid imported prices are rejected',()=>{
 assert.equal(normalizePriceInput(''),null);
 assert.ok(Number.isNaN(normalizePriceInput('-4')));
 assert.equal(validatePriceRecord({id:'LS-001',price:null,verified:true}),false);
 assert.equal(validatePriceRecord({id:'LS-001',price:24,verified:true}),true);
 assert.equal(validatePriceRecord({id:'wrong',price:24,verified:true}),false);
});

test('burger and dinner matches never use unrelated dessert prices to fill a basket', () => {
  const similarities = products.map(p => p.category === 'Frozen desserts' ? 0.7 : 0.5);
  const requests = [
    ['I need ingredients for burgers and sandwiches', 'LS-058'],
    ['Affordable canned food and rice for dinner', 'LS-034'],
  ];

  for (const [request, expectedId] of requests) {
    for (const scores of [[], similarities]) {
      const matches = rankMatches(request, products, scores);
      assert.ok(matches.some(({ p }) => p.id === expectedId));
      assert.ok(matches.every(({ p }) => p.category !== 'Frozen desserts'));
      assert.deepEqual(makeBasket(matches, 100, true), []);
    }
  }
});

test('keyword fallback matches a Taglish dessert request and rejects unrelated words', () => {
  const matches = rankMatches('Malamig at matamis na merienda', products);
  assert.ok(matches.length > 0);
  assert.ok(matches.every(({ p }) => p.category === 'Frozen desserts'));
  assert.ok(makeBasket(matches, 30, true).length > 0);
  assert.deepEqual(rankMatches('plumbing tools', products), []);
});

test('semantic-only matches require a meaningful similarity', () => {
  const request = 'a chilled confection';
  assert.deepEqual(rankMatches(request, products), []);
  assert.deepEqual(rankMatches(request, products, products.map(() => 0.23)), []);

  const similarities = products.map(p => p.id === 'LS-001' ? 0.49 : 0.23);
  assert.deepEqual(rankMatches(request, products, similarities).map(({ p }) => p.id), ['LS-001']);
});

test('basket respects the exact cent limit and skips fractional-cent prices', () => {
  const matches = [10.01, 20.02, 0.334].map(price => ({ p: { price, verified: true } }));
  assert.equal(makeBasket(matches, 30.03).length, 2);
  assert.equal(makeBasket(matches, 30.02).length, 1);
  assert.ok(Number.isNaN(normalizePriceInput('0.334')));
  assert.equal(validatePriceRecord({ id: 'LS-001', price: 0.334, verified: true }), false);
});

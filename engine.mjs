/** Catalog matching, pricing, and basket logic shared by the app and tests. */
const categoryTags = {
  'Frozen desserts': 'ice cream ice pop popsicle cold sweet snack dessert merienda',
  'Instant noodles': 'instant noodle pancit canton mami easy meal dinner ulam',
  'Canned goods': 'canned food budget meal ulam dinner fish protein sardines tuna pang hapunan',
  'Household cleaning': 'laundry cleaning bleach household panlinis damit',
  Laundry: 'laundry fabric conditioner washing clothes damit panlaba',
  'Beverages and breakfast': 'coffee drink milk breakfast almusal inumin kape cereal',
  'Personal care': 'shampoo conditioner hair care personal buhok',
  'Rice and grains': 'rice bigas kanin meal dinner ulam',
  'Frozen foods': 'burger sandwich hotdog fries frozen lunch dinner',
  Bakery: 'bread burger buns hotdog buns sandwich tinapay breakfast',
  Eggs: 'eggs itlog protein breakfast dinner meal',
  Packaging: 'cups disposable party drink cup plastic baso',
};

const translations = {
  merienda: 'snack', meryenda: 'snack', matamis: 'sweet', malamig: 'cold', pagkain: 'food',
  hapunan: 'dinner', ulam: 'meal', almusal: 'breakfast', kanin: 'rice', bigas: 'rice',
  itlog: 'eggs', tinapay: 'bread', panlaba: 'laundry', panlinis: 'cleaning', kape: 'coffee',
  inumin: 'drink', pang: 'for', gusto: 'want', ako: 'i', para: 'for', tatlo: 'three',
  dalawa: 'two', bata: 'children', mura: 'affordable', masarap: 'tasty',
};

const fillerWords = new Set([
  'affordable', 'budget', 'children', 'cost', 'find', 'for', 'from', 'good', 'have',
  'ingredient', 'looking', 'need', 'people', 'peso', 'php', 'please', 'some', 'something',
  'that', 'the', 'three', 'two', 'under', 'want', 'with', 'and',
]);

const minimumSimilarity = 0.42;

export function displayName(product) {
  return [product.brand, product.name, product.variant].filter(Boolean).join(' · ');
}

export function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function enrich(text) {
  return normalize(text).split(' ').map(word => Object.hasOwn(translations, word) ? translations[word] : word).join(' ');
}

export function searchDescription(product) {
  return [displayName(product), product.category, product.unit, categoryTags[product.category]].filter(Boolean).join(' ');
}

function searchWords(value) {
  return new Set(enrich(value).split(' ').map(word => word
    .replace(/(.{2})ies$/, '$1y')
    .replace(/(ch|sh|ss|x|z)es$/, '$1')
    .replace(/(.{2}[^s])s$/, '$1'))
    .filter(word => /^\p{L}{3,}$/u.test(word) && !fillerWords.has(word)));
}

const categoryWords = new Map(Object.entries(categoryTags).map(([category, tags]) => [
  category, searchWords(`${category} ${tags}`),
]));

export function rankMatches(query, products, similarities = []) {
  const terms = [...searchWords(query)];
  if (!terms.length) return [];

  const taggedTerms = new Set(terms.filter(term => [...categoryWords.values()].some(words => words.has(term))));
  const ranked = products.map((p, index) => {
    const category = categoryWords.get(p.category);
    const identity = searchWords(displayName(p));
    const identityMatches = terms.filter(term => identity.has(term));
    let support = 0;
    for (const term of terms) {
      // A lone word such as “sandwich” in a dessert name cannot stand in for sandwich ingredients.
      if (identity.has(term) && (!taggedTerms.has(term) || category?.has(term) || identityMatches.length > 1)) {
        support += 1;
      } else if (category?.has(term)) {
        support += 0.75;
      }
    }
    const lexical = support / terms.length;
    const semantic = similarities[index] ?? 0;
    const score = similarities.length ? 0.3 * lexical + 0.7 * semantic : lexical;
    return { p, lexical, semantic, score };
  });

  const lexicalMatches = ranked.filter(result => result.lexical > 0);
  if (lexicalMatches.length) return lexicalMatches.sort((a, b) => b.score - a.score);

  const bestSimilarity = Math.max(...ranked.map(result => result.semantic));
  const cutoff = Math.max(minimumSimilarity, bestSimilarity - 0.1);
  return ranked.filter(result => result.semantic >= cutoff).sort((a, b) => b.score - a.score);
}

function currencyCents(value) {
  if (!Number.isFinite(value)) return NaN;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && cents / 100 === value ? cents : NaN;
}

export function priced(product, allowSRP = false) {
  if (currencyCents(product.price) > 0) {
    return { value: product.price, kind: product.verified === true ? 'confirmed' : 'unverified' };
  }
  if (allowSRP && currencyCents(product.srp) > 0) return { value: product.srp, kind: 'SRP' };
  return null;
}
export function makeBasket(ranked, budget, allowSRP = false, maxItems = 6) {
  let remaining = currencyCents(budget);
  if (!(remaining > 0)) return [];
  const selected = [];
  for (const result of ranked) {
    if (selected.length >= maxItems) break;
    const price = priced(result.p, allowSRP);
    if (!price) continue;
    const cost = currencyCents(price.value);
    if (cost <= remaining) {
      selected.push({ ...result, pr: price });
      remaining -= cost;
    }
  }
  return selected;
}
export function normalizePriceInput(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const price = Number(value);
  return currencyCents(price) > 0 ? price : NaN;
}
export function validatePriceRecord(record) {
  if (!record || typeof record.id !== 'string' || !/^LS-\d{3}$/.test(record.id)) return false;
  const price = normalizePriceInput(record.price);
  return !Number.isNaN(price) && (!record.verified || price !== null);
}

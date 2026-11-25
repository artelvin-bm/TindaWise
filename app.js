import {
  displayName, enrich, makeBasket, normalize, normalizePriceInput,
  priced, rankMatches, searchDescription as desc, validatePriceRecord,
} from './engine.mjs';
const $=id=>document.getElementById(id);
let products = [];
let model;
let catalogEmbeddings;
let lastSearch;
let toastTimeout;
const catalogPrices = new Map();
const STORAGE='tindawise-lily-price-overrides-v1';
const emoji={'Frozen desserts':'🍦','Instant noodles':'🍜','Canned goods':'🥫','Household cleaning':'🧼','Laundry':'🧺','Beverages and breakfast':'☕','Personal care':'🧴','Rice and grains':'🍚','Frozen foods':'🍔','Bakery':'🍞','Eggs':'🥚','Packaging':'🥤'};
const priceLabels = {
  confirmed: 'Confirmed store price',
  unverified: 'Unverified store price',
  SRP: 'Poster SRP only',
};
let overrides={};
try{overrides=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{}}catch{overrides={}}
function safe(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(message) {
  const notice = $('toast');
  notice.textContent = message;
  notice.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    notice.classList.remove('show');
    notice.textContent = '';
  }, 3300);
}
function money(v){return '₱'+Number(v).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}
function status(text,cls=''){$('aiStatus').textContent=text;$('aiStatus').className='status '+cls}

async function loadModel() {
  if (model) return;
  status('Loading free AI model…', 'loading');
  const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
  model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
}

function embed(input) {
  return model(input, { pooling: 'mean', normalize: true });
}

async function scoreProducts(query) {
  if (!catalogEmbeddings) {
    const vectors = [];
    const batchSize = 12;
    for (let offset = 0; offset < products.length; offset += batchSize) {
      const descriptions = products.slice(offset, offset + batchSize).map(p => enrich(desc(p)));
      const { data, dims: [, width] } = await embed(descriptions);
      for (let row = 0; row < descriptions.length; row++) {
        vectors.push(data.slice(row * width, (row + 1) * width));
      }
    }
    catalogEmbeddings = vectors;
  }

  const { data: requestVector } = await embed(enrich(query));
  // The model normalizes each vector, so their dot product is cosine similarity.
  return catalogEmbeddings.map(vector => vector.reduce((dot, value, i) => dot + value * requestVector[i], 0));
}

function renderPriceLabel(price) {
  const kind = price?.kind.toLowerCase() ?? 'missing';
  return `<span class="price-caption ${kind}">${price ? priceLabels[price.kind] : 'Price unavailable'}</span>`;
}

function renderResultRow({ p, pr }) {
  const note = !pr && !p.srp && p.notes ? `<small class="product-note">${safe(p.notes)}</small>` : '';
  return `<div class="result-row">
    <div class="product-avatar" aria-hidden="true">${emoji[p.category] || '🛍️'}</div>
    <div class="result-details">
      <strong>${safe(displayName(p))}</strong>
      <small>${safe(p.category)}${p.unit ? ' · ' + safe(p.unit) : ''}</small>
      ${note}
    </div>
    <div class="result-cost">${pr ? money(pr.value) : ''}
      ${renderPriceLabel(pr)}
    </div>
  </div>`;
}

function renderResults({ query, ranked, budget, aiUsed }) {
  const allowSRP = $('previewSRP').checked;
  const selected = makeBasket(ranked, budget, allowSRP);
  const selectedIds = new Set(selected.map(({ p }) => p.id));
  const otherMatches = ranked.filter(({ p }) => !selectedIds.has(p.id)).map(({ p }) => ({ p, pr: priced(p, allowSRP) }));
  const mode = $('resultMode');
  mode.textContent = aiUsed ? (ranked.length ? 'AI MATCHED' : 'AI SEARCH') : 'BASIC MATCH';
  mode.classList.toggle('basic', !aiUsed);
  mode.hidden = false;
  $('resultContext').textContent = `“${query}” · Budget ${money(budget)}`;
  $('resultContext').hidden = false;
  $('editSearch').hidden = false;

  let title;
  let html;
  if (selected.length) {
    title = 'Your suggested basket';
    const totalCents = selected.reduce((sum, { pr }) => sum + Math.round(pr.value * 100), 0);
    const budgetCents = Math.round(budget * 100);
    const budgetLeft = (budgetCents - totalCents) / 100;
    const estimate = selected.some(({ pr }) => pr.kind !== 'confirmed');
    const totalLabel = estimate ? 'Estimated basket total' : 'Basket total';
    const remainingLabel = estimate ? 'Estimated budget left' : 'Budget left';
    const itemLabel = selected.length === 1 ? 'item' : 'items';
    html = `<div class="summary">
      <div class="summaryline"><span>${totalLabel} (${selected.length} ${itemLabel})</span><strong>${money(totalCents / 100)}</strong></div>
      <progress class="budget-meter" max="${budgetCents}" value="${totalCents}" aria-label="Portion of budget used"></progress>
      <div class="summaryline"><span>${remainingLabel}</span><b>${money(budgetLeft)}</b></div>
    </div><div class="result-list basket-items">${selected.map(renderResultRow).join('')}</div>`;
    if (otherMatches.length) html += '<h3 class="other-heading">Other matching products</h3>';
  } else if (otherMatches.length) {
    title = 'Matching products';
    const notice = otherMatches.some(({ pr }) => pr)
      ? `The listed prices exceed your ${money(budget)} maximum budget.`
      : 'Prices are unavailable for these matches. Ask the store for their selling prices.';
    html = `<p class="warning">${notice}</p>`;
  } else {
    title = 'No matching products';
    html = '<div class="empty"><span class="emptyicon" aria-hidden="true">🔎</span><p>Try a product name, category, or a more specific description.</p></div>';
  }

  if (otherMatches.length) {
    html += `<div class="result-list matching-products">${otherMatches.map(renderResultRow).join('')}</div>`;
  }
  $('resultTitle').textContent = title;
  $('results').className = '';
  $('results').innerHTML = html;
  const announcement = ranked.length === 1 ? '1 matching product.' : `${ranked.length} matching products.`;
  if ($('resultAnnouncement').textContent !== announcement) $('resultAnnouncement').textContent = announcement;
}

function refreshResults() {
  if (lastSearch) renderResults(lastSearch);
}

async function suggest(event) {
  event.preventDefault();
  const query = $('request').value.trim();
  const budget = $('budget').valueAsNumber;
  if (!query || !Number.isFinite(budget) || budget <= 0) {
    toast('Enter a request and a positive budget.');
    return;
  }
  if (!products.length) {
    toast('The product catalog is unavailable. Reload the app and try again.');
    return;
  }

  const button = $('suggestButton');
  const resultPanel = $('resultPanel');
  button.disabled = true;
  $('suggestLabel').textContent = 'Finding matches…';
  resultPanel.setAttribute('aria-busy', 'true');
  try {
    let similarities = [];
    try {
      await loadModel();
      status('Matching your request…', 'loading');
      similarities = await scoreProducts(query);
      status('✦ AI model ready', 'loaded');
    } catch (error) {
      console.warn('AI matching failed', error);
      status(model ? 'Basic matching (AI error)' : 'Basic matching (AI unavailable)');
    }
    lastSearch = {
      query,
      ranked: rankMatches(query, products, similarities),
      budget,
      aiUsed: similarities.length > 0,
    };
    refreshResults();
  } finally {
    button.disabled = false;
    $('suggestLabel').textContent = 'Find matches';
    resultPanel.removeAttribute('aria-busy');
  }

  const focused = document.activeElement;
  if (!$('view-shop').hidden && (focused === button || focused === document.body)) {
    $('resultTitle').focus({ preventScroll: true });
    const top = resultPanel.getBoundingClientRect().top;
    if (window.matchMedia('(max-width: 760px)').matches || top < 0 || top > window.innerHeight - 120) {
      resultPanel.scrollIntoView({ block: 'start' });
    }
  }
}
function renderCatalog() {
  const query = normalize($('catalogSearch').value);
  const category = $('categoryFilter').value;
  const priceFilter = $('priceFilter').value;
  const allowSRP = $('previewSRP').checked;
  const matches = products.filter(p => (!query || normalize(desc(p)).includes(query)) && (!category || p.category === category))
    .map(p => ({ p, pr: priced(p, allowSRP) }))
    .filter(({ pr }) => !priceFilter || (priceFilter === 'priced' ? pr !== null : pr === null));
  $('catalogCount').textContent = `${matches.length} ${matches.length === 1 ? 'product' : 'products'}`;
  $('catalogGrid').innerHTML = matches.map(({ p, pr }) => `<article class="product-card">
    <div class="product-avatar" aria-hidden="true">${emoji[p.category] || '🛍️'}</div>
    <strong>${safe(displayName(p))}</strong>
    <small>${safe(p.category)}${p.unit ? ' · ' + safe(p.unit) : ''}</small>
    <div class="product-price">${pr ? money(pr.value) : ''}${renderPriceLabel(pr)}</div>
  </article>`).join('') || '<p class="panel empty">No products match your filters.</p>';
}

function updateVerifiedCount() {
  const count = products.filter(p => p.verified && priced(p)).length;
  $('verifiedCount').textContent = `${count} ${count === 1 ? 'price' : 'prices'} confirmed`;
}

function renderOwner() {
  const query = normalize($('ownerSearch').value);
  const matches = products.filter(p => !query || normalize(`${p.id} ${desc(p)}`).includes(query));
  updateVerifiedCount();
  $('ownerCount').textContent = `Showing ${matches.length} of ${products.length} products`;
  $('ownerTable').hidden = matches.length === 0;
  $('ownerEmpty').hidden = matches.length > 0;
  $('ownerRows').innerHTML = matches.map(p => {
    const id = safe(p.id);
    const name = safe(displayName(p));
    const detail = safe([p.id, p.category, p.unit].filter(Boolean).join(' · '));
    return `<tr role="row">
      <th scope="row" role="rowheader" class="owner-product">${name}<small>${detail}</small></th>
      <td role="cell"><span class="mobile-cell-label">Poster SRP</span>${p.srp ? money(p.srp) : '—'}</td>
      <td role="cell">
        <label class="mobile-cell-label" for="price-${id}">Store price (₱)</label>
        <input id="price-${id}" type="number" min="0.01" step="0.01" inputmode="decimal" class="edit-price" data-id="${id}" value="${safe(p.price)}" placeholder="No price" aria-label="Store price in pesos for ${name}">
      </td>
      <td role="cell" class="owner-verification">
        <label><input type="checkbox" class="edit-confirm" data-id="${id}" ${p.verified ? 'checked' : ''} aria-label="Verify price for ${name}"><span class="mobile-cell-label">Verified</span></label>
      </td>
      <td role="cell"><button type="button" class="secondary save" data-id="${id}" aria-label="Save price for ${name}">Save</button></td>
    </tr>`;
  }).join('');
}

function saveRow(button) {
  const product = products.find(p => p.id === button.dataset.id);
  const row = button.closest('tr');
  const input = row.querySelector('.edit-price');
  const price = normalizePriceInput(input.value);
  const verified = row.querySelector('.edit-confirm').checked;
  if (Number.isNaN(price)) {
    toast('Enter a positive price with up to two decimal places.');
    input.focus();
    return;
  }
  if (verified && price === null) {
    toast('Enter the selling price before confirming it.');
    input.focus();
    return;
  }

  const nextOverrides = { ...overrides, [product.id]: { price, verified } };
  try {
    localStorage.setItem(STORAGE, JSON.stringify(nextOverrides));
  } catch (error) {
    toast('This browser could not save the price.');
    return;
  }
  Object.assign(product, { price, verified });
  overrides = nextOverrides;
  input.value = price ?? '';
  updateVerifiedCount();
  renderCatalog();
  toast(`${displayName(product)} updated locally.`);
}

function switchView(view) {
  const activeView = $(`view-${view}`);
  document.querySelectorAll('.view').forEach(section => section.hidden = section !== activeView);
  document.querySelectorAll('.navitem').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (view === 'shop') refreshResults();
  activeView.querySelector('h1').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}
function downloadBlob(name,body){let a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type:'application/json;charset=utf-8'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function init() {
  try {
    const response = await fetch('products.json');
    if (!response.ok) throw new Error('Product data missing');
    products = await response.json();
    for (const product of products) {
      catalogPrices.set(product.id, { price: product.price, verified: product.verified });
      const override = overrides[product.id];
      if (!override || !Object.hasOwn(override, 'price')) continue;
      const price = normalizePriceInput(override.price);
      if (Number.isNaN(price)) continue;
      product.price = price;
      product.verified = override.verified === true && price !== null;
    }
    const categories = [...new Set(products.map(p => p.category))].sort();
    const options = categories.map(category => `<option value="${safe(category)}">${safe(category)}</option>`);
    $('categoryFilter').insertAdjacentHTML('beforeend', options.join(''));
    renderCatalog();
    renderOwner();
  } catch (error) {
    $('results').innerHTML = '<p>Could not load products. Open this application through a local HTTP server instead of double-clicking index.html.</p>';
    toast('Could not load product data. Use a web server.');
  }
}

document.querySelectorAll('.navitem').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
$('brandLink').addEventListener('click', event => {
  event.preventDefault();
  switchView('shop');
});
document.querySelectorAll('.example').forEach(button => button.addEventListener('click', () => $('request').value = button.dataset.prompt));
$('shopForm').addEventListener('submit', suggest);
const previewControls = [$('previewSRP'), $('catalogPreviewSRP')];
for (const control of previewControls) {
  control.addEventListener('change', () => {
    for (const checkbox of previewControls) checkbox.checked = control.checked;
    renderCatalog();
    refreshResults();
  });
}
['catalogSearch', 'categoryFilter', 'priceFilter'].forEach(id => $(id).addEventListener('input', renderCatalog));
$('ownerSearch').addEventListener('input', renderOwner);
$('ownerRows').addEventListener('click', event => {
  const button = event.target.closest('.save');
  if (button) saveRow(button);
});
$('openImport').addEventListener('click', () => $('importJson').click());
$('exportJson').addEventListener('click', () => {
  const data = {
    store: "Lily's Store",
    updated: new Date().toISOString(),
    products: products.map(({ id, price, verified }) => ({ id, price, verified })),
  };
  downloadBlob('Lilys_Store_Prices.json', JSON.stringify(data, null, 2));
});
$('importJson').addEventListener('change', async event => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.products)) throw new Error('Invalid inventory JSON');
    let count = 0;
    for (const row of data.products) {
      if (!validatePriceRecord(row)) continue;
      const product = products.find(p => p.id === row.id);
      if (!product) continue;
      const price = normalizePriceInput(row.price);
      const verified = row.verified === true && price !== null;
      Object.assign(product, { price, verified });
      overrides[product.id] = { price, verified };
      count++;
    }
    localStorage.setItem(STORAGE, JSON.stringify(overrides));
    renderOwner();
    renderCatalog();
    toast(`Imported ${count} price records.`);
  } catch (error) {
    toast(`Import failed: ${error.message}`);
  } finally {
    input.value = '';
  }
});
$('resetPrices').addEventListener('click', () => {
  if (!confirm('Delete all price edits saved on this browser?')) return;
  localStorage.removeItem(STORAGE);
  overrides = {};
  for (const product of products) Object.assign(product, catalogPrices.get(product.id));
  renderOwner();
  renderCatalog();
  toast('Local price edits reset.');
});
init();

# TindaWise — Lily's Store

A static, mobile-responsive academic prototype for PTF50. Built from the 29 supplied store photographs and the 66-entry preliminary inventory.

## Run locally

From this directory:

```bash
python -m http.server 8000
```

Visit http://localhost:8000/ (opening `index.html` directly using `file://` will not load `products.json`).

## AI feature

The assistant loads `@xenova/transformers` v2.17.2 from jsDelivr and runs the quantized `Xenova/all-MiniLM-L6-v2` feature-extraction model **in the browser**. It compares the request embedding with all product descriptions using cosine similarity and keeps the product embeddings in memory for subsequent searches. Whole-word matches define the candidate set when the app recognizes product or category terms. Otherwise, it looks for sufficiently similar model results. The first search needs internet for the library and model. If loading or inference fails, the app switches to keyword results labeled **BASIC MATCH**.

After matching, JavaScript builds a basket within the amount in the **Maximum budget (₱)** field. Relevant products also appear outside the basket when their price is missing, they are over budget, or the basket already has enough items. Changing poster SRP preview refreshes the basket and matches for the last search.

## IMPORTANT price and stock limitations

- `products.json` uses the **Store price (PHP)** and **Poster SRP (PHP)** columns from `Documents/Lilys_Store_TindaWise_Product_Inventory.xlsx`, matched by SKU. The supplied workbook has 21 poster SRPs and blank store-price cells for all 66 products.
- A listed store price can be used whether or not it is verified. The app labels unverified prices and poster SRPs, and marks the total as an estimate when it uses either. Poster SRP preview is enabled by default and applies when a store price is unavailable.
- Products without a usable amount show **Price unavailable** and appear outside the basket. The handwritten rice amounts appear as a workbook note because their selling units and variants are unclear.
- Poster-only products and shelf products are combined in this preliminary catalog. The store must confirm current stock and selling units before real use.
- All owner-entered prices are stored in this device's browser localStorage; export the JSON file for backup and import it on another device. This is **not a secure owner-management backend**.
- The recommendation selects one unit of each matching product for an illustrative basket. It does not guarantee a balanced meal, nutritional suitability, or stock availability.

## Owner workflow

1. Open **Owner tools**, search a product.
2. Enter a listed selling-unit price and click **Save**. Check **Verified** once the store confirms the price and selling unit.
3. Optionally use **Export JSON** to back up owner updates. Imported JSON must be trusted.
4. Return to **Shop assistant** and disable SRP preview to use listed store prices only. **Reset local edits** restores the bundled catalog values.

## Deploy

Push all application files (`index.html`, `styles.css`, `app.js`, `engine.mjs`, `products.json`, and the `assets/` folder) to a GitHub repo and activate GitHub Pages or deploy as a static project to Netlify / Vercel. The application needs HTTPS for reliable browser access; internet is needed for the first model download.

## Honest project status

A runnable academic prototype, not an authenticated production store app. User testing (3–5 people), business confirmation, published deployment link, and owner price verification remain to be completed. Record real results only after testing.

## Automated tests

Run `node --test tests/*.test.mjs` in the project folder. These tests check catalog consistency, relevance filtering, the semantic eligibility threshold, price validation, and exact-cent basket limits. The course also calls for browser and user testing.

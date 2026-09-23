# DSA Desk

Bank master + DSA code lookup + case-to-lender matching, built for Noamaan Consultancy.
Pure static site — no backend, no build step.

**Live:** https://noamaanzakinoamaan-max.github.io/noamaan-dsa/
**[→ Full tutorial](TUTORIAL.md)**

The lender data in this repo is **AES-256-GCM encrypted** (PBKDF2-SHA256, 250k iterations).
The site asks for a passphrase and decrypts in the browser. The plaintext master and the
source payout PDF are git-ignored and have never been committed.

## What it does

**Search** — type any fragment of a bank name, DSA code, product, city or contact and get
the matching lenders instantly. Typo-tolerant (`hdf`, `bajj`, `kotk` all work) and it
searches every per-product code too, so pasting `352617` or `PUNE00041` finds the lender.
Click a card for the full record: every product, its own DSA code, its payout, and which
MYSP entity it bills under.

**Match a Case** — enter (or auto-extract from documents) the applicant's CIBIL, income,
EMIs, loan amount, property value, profile, city, vintage. The engine computes FOIR and LTV,
runs every lender's rules, and returns a ranked list:

- **Strong fit** — all norms met
- **Possible with deviation** — close, with the exact gap spelled out
- **Not eligible** — with the reason

Ranking also weighs your payout %, the ROI to the client and the TAT, so the top suggestion
is a commercially sensible one, not just a technically eligible one. Estimated payout in ₹
is shown per lender. Print/PDF the shortlist for the client.

**Document upload** — drop salary slips, ITR, CIBIL reports, bank statements. Text PDFs are
read in the browser (pdf.js) and scanned for CIBIL, net pay, EMIs, DOB, PAN, ITR/GST markers.
Add an API key in **Settings** and scanned images and messy layouts get read properly by AI.
The key stays in your browser's localStorage and is never committed.

**Manage / Import / Export** — add and edit banks by hand, or import the whole master from
CSV, TSV, TXT, JSON or a text-based PDF. The importer auto-detects your column headers and
lets you correct the mapping before committing. Export back to JSON or CSV any time.

## The loaded data

`data/banks.json` is generated from **Payout Sept 2026.pdf** (effective 01.07.2026) by
`extract.py`:

- **98 lenders**, **331 product offerings**, **88 lenders with a DSA code**
- Products: Home Loan/BT, LAP/LRD, Personal, Business, Education, MSME, New &
  Used Car, Commercial Vehicle/CE, Machinery, Gold, School Funding, CASA, FD, Credit Card
- A lender's DSA code **varies per product** — IDBI is `CDSAAPNAR` for home loans but
  `CDSAELARPL` for car and education loans. The app shows the right code for the product
  you filtered on, and the detail view lists every one.
- Invoice-share deals ("85% of the invoice value") are kept as text rather than a fake
  percentage, so they never distort the ranking.
- Slab grids (HDFC/ICICI/Axis/Bajaj car loans etc.) are stored as their rate-vs-payout rows —
  click the **"N slabs"** chip in a bank's detail view to see the grid.
- Each offering records which MYSP entity it is billed under (Apnarupee Fin India, SP
  Enterprises, SP Financial Services).

### Re-running the extraction when a new payout sheet arrives

```bash
pip install pdfplumber
python3 extract.py          # reads uploads/Payout Sept 2026 (1).pdf -> data/banks.json
```

Edit `SRC` at the top of `extract.py` to point at the new PDF.

## Importing other lists

1. Open the **Import** tab.
2. Drop a PDF/CSV (or paste the table straight out of Excel).
3. Check the column mapping — the dropdown above each column says which field it is. Set at
   least one to `name`.
4. **Import & merge** (keeps existing) or **replace all**.
5. **Manage Banks → Export JSON**, save over `data/banks.json`, commit.

Scanned (image-only) PDFs have no text layer. Either paste the rows manually, or run the PDF
through OCR first.

### Amount shorthand understood by the importer
`45L`, `2.5 Cr`, `50k`, `₹12,00,000` all parse correctly. Payout can be a single number
(`1.25`) or per-product (`Home Loan:0.85; LAP:1.1`). Yes/No fields accept `y`, `yes`, `1`.

## Deploying to GitHub Pages

```bash
cd dsa-desk
git init && git add . && git commit -m "DSA Desk"
git branch -M main
git remote add origin https://github.com/<you>/dsa-desk.git
git push -u origin main
```

Then **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
Live in a minute at `https://<you>.github.io/dsa-desk/`.

### Publishing data changes

```bash
# Manage Banks -> Export JSON -> save over data/banks.json
python3 encrypt_data.py "your passphrase"
git add -A && git commit -m "Updated lender data" && git push
```

Never commit `data/banks.json` — `.gitignore` blocks it. Only `data/banks.enc.json` ships.

## Files

```
index.html        UI
extract.py        PDF -> banks.json extractor
encrypt_data.py   banks.json -> encrypted banks.enc.json
js/crypto.js      browser-side unlock (WebCrypto)
styles.css        dark theme
data/banks.enc.json  encrypted bank master (the only data file committed)
js/store.js       data model, normalisation, persistence
js/search.js      fuzzy search
js/match.js       eligibility + scoring engine
js/docs.js        PDF/image reading, offline + AI extraction
js/importer.js    CSV/PDF parsing, column mapping, CSV export
```

## Tuning the matcher

All the scoring lives in `js/match.js` → `evaluate()`. The weights are plain numbers —
raise the payout weight if you want commission to dominate, or lower the ROI weight.
Nothing else needs to change.

## Disclaimer

Suggestions are indicative, based on the norms you enter. Always confirm against the
lender's current policy before committing to a client.

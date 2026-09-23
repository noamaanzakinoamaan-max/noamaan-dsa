# DSA Desk — How to use it

**Live site:** https://noamaanzakinoamaan-max.github.io/noamaan-dsa/
**Passphrase:** `quartz-granite-quartz-summit`

Works on your laptop and your phone. Add it to your home screen and it behaves like an app.

---

## 1. Unlocking

Open the link. You get a lock screen. Type the passphrase → **Unlock**.

- "Stay unlocked in this tab" keeps you in until you close the tab.
- After the first unlock the data is stored in that browser, so next time it opens straight up.
- **Settings → Lock & sign out** wipes the data from that device. Use this if you lose a phone
  or lend a laptop.

Anyone who opens the link without the passphrase sees only the lock screen. The file sitting
on GitHub is scrambled — no codes, no rates, nothing readable.

---

## 2. Search — the everyday screen

This is the one you'll live in. Type anything:

| You type | You get |
|---|---|
| `hdfc` | HDFC Bank |
| `hdf` | works too — partial is fine |
| `bajj` | Bajaj Finance — typos are forgiven |
| `352617` | searches **DSA codes**, finds HDFC |
| `CDSAELARPL` | finds IDBI (its car/education code) |
| `education` | every lender doing education loans |
| `saraswat` | Saraswat Bank |

Press `/` anywhere to jump into the search box.

**The product chips** under the search bar (All products, LAP / LRD, Home Loan / BT…) filter
the list. This matters more than it looks — see the next section.

**Each card shows:** lender name, category, the DSA code, its products, and the payout.

Click a card to open the full record.

---

## 3. The thing to understand about DSA codes

**A lender does not have one code. The code changes per product.**

Real examples from your sheet:

- **IDBI Bank** → `CDSAAPNAR` for home loans, but `CDSAELARPL` for car and education loans
- **Bank of India** → four different MSME codes, one per zone (Pune, Nashik, Solapur, Kanpur)
- **ICICI** → `327107` for home/LAP/car, `372417` for education

So: **pick the product chip first, then read the code off the card.** The card shows you the
code for the product you've filtered on. If you don't filter, it shows the lender's most-used
code, which may not be the one you need.

When you open a lender, the **Products, codes & payout** table lists every single one —
product, its own code, its payout, and which of your firms it bills under (Apnarupee Fin
India / SP Enterprises / SP Financial Services). That table is the authoritative view.

**"N slabs" chip** — car loan payouts (HDFC, ICICI, Axis, Bajaj, Poonawalla) aren't one
number, they're a rate-vs-payout grid. Click the chip to see the whole grid.

**"85% of the invoice value"** stays as text rather than a number, because it's a share of
the bank's invoice, not a rate on the loan amount. Those lenders show the wording as-is.

---

## 4. Match a Case — which bank should I go with

Three steps on one screen.

### Step 1 — Upload documents (optional)
Drag in salary slips, ITR, CIBIL report, bank statement. Hit **Read documents & fill form**.
It pulls out CIBIL, net salary, existing EMIs, date of birth, PAN and fills the form.

It reads **text PDFs** on its own. **Photos and scans need an API key** (Settings tab) —
without one it can't read an image. If it can't find something it leaves the field blank and
tells you what it did find. Always eyeball what it filled before trusting it.

### Step 2 — Case details
Fill what you know — blank fields are simply not used as filters. The most useful ones:
product, profile, CIBIL, monthly income, existing EMI, loan required, property value.

As you type, the line under the buttons shows **estimated EMI, FOIR and LTV** live.

### Step 3 — Find best banks
You get every lender ranked into three buckets:

- **Strong fit** (green) — meets all recorded norms
- **Possible with deviation** (amber) — close, and it tells you the exact gap:
  *"CIBIL 705 is 15 below norm 720 — deviation needed"*
- **Not eligible** (red) — with the reason

Each row shows the **product-specific DSA code**, the payout %, and your **estimated payout
in ₹** on that loan amount. **Print / PDF** gives you a clean shortlist for the client.

The ranking isn't just eligibility — it weighs your payout, the client's ROI and the TAT, so
the top suggestion is one worth actually doing.

### ⚠️ Green vs amber — the most important thing on this screen

Two very different grades of data sit side by side:

| | Source | Trust |
|---|---|---|
| **DSA codes, payouts, products, billing entity** | Your own payout sheet | **Reliable** — use directly |
| **CIBIL, FOIR, LTV, income, age, profiles** | Indicative market norms | **Verify before quoting** |

Every eligibility field seeded from public data carries an amber **UNVERIFIED** badge. Why
they're only indicative — I checked, and the public sources genuinely disagree:

- HDFC minimum income: HDFC's own FAQ says **₹10,000**; aggregators say **₹25,000**
- HDFC minimum CIBIL: quoted anywhere from **650 to 750** depending on the site
- Bajaj LAP CIBIL: Bajaj's *own website* says **650** on one page and **700** on another
- FOIR caps and employer-category grids are **never published** — internal credit policy

Only the **RBI LTV slabs** (90% up to ₹30L, 80% ₹30–75L, 75% above ₹75L) were identical
across every source, because they're regulatory.

**Because of this, unverified norms never hard-reject a lender.** They produce an amber
warning with the reason. A case only shows "Not eligible" on a fact from your own sheet —
e.g. the lender doesn't offer that product at all.

**Turning amber into green:** open a lender in **Manage Banks**, change an eligibility field
to what your RM actually confirmed, and save. That field flips to a green **VERIFIED** badge
and starts behaving as a hard rule. Re-running the seeder will never overwrite it.

Do your top 15–20 lenders and this screen becomes genuinely decision-grade.

---

## 5. Manage Banks — keeping it current

Table of all 98 lenders. **Edit** on any row to change anything. **+ Add bank** for a new one.

Fields worth filling (these power the matcher):
Min CIBIL · Max FOIR % · Max LTV % · Min monthly income · Min/Max loan · Profiles
(Salaried, Self Employed Professional, Self Employed Non-Professional) · Min vintage ·
Cities · ROI from · TAT days · Contact person and phone.

Payout accepts per-product form: `Home Loan / BT:0.85, LAP / LRD:1.1`

**Export JSON / Export CSV** — take a backup any time. Do this before big edits.

---

## 6. Publishing your changes

Edits live in your browser. To push them to the live site so every device gets them:

```bash
cd dsa-desk
# 1. Manage Banks → Export JSON → save it over data/banks.json
python3 encrypt_data.py "quartz-granite-quartz-summit"
git add -A && git commit -m "Updated lender data" && git push
```

Live in about a minute. **Never `git add data/banks.json`** — `.gitignore` blocks it, leave
that alone. Only the encrypted `banks.enc.json` should ever be pushed.

### When October's payout sheet arrives

```bash
cd dsa-desk
# drop the new PDF in, edit SRC at the top of extract.py to match its filename
pip install pdfplumber
python3 extract.py
python3 encrypt_data.py "quartz-granite-quartz-summit"
git add -A && git commit -m "October 2026 payout structure" && git push
```

Then in the app: **Settings → Reload from published data**.

### Changing the passphrase
Re-run `encrypt_data.py` with a new one, commit, push. Everyone re-unlocks with the new one.

---

## 7. Security — read this once

- The repo is **public** (GitHub Pages needs that on a free account) but the lender data is
  **AES-256-GCM encrypted**, with the key stretched via 250,000 rounds of PBKDF2. Someone who
  downloads the raw file gets noise.
- The plaintext `banks.json` and the source PDF are **git-ignored and were never committed** —
  not in any commit, so not recoverable from history.
- Decryption happens **in your browser**. The passphrase never goes over the network.
- **Treat the passphrase like the data itself.** Anyone with the link *and* the passphrase has
  your full payout book. Share it by a different channel than the link, and only with people
  who should have it.
- **Revoke the GitHub token you pasted into our chat** — it's visible in the conversation and
  has full repo scope: https://github.com/settings/tokens → delete it. Nothing here needs it
  any more; your local `git push` uses the copy already saved in the repo's remote.
- The optional AI key for reading scans is stored in your browser only and is never committed.

---

## Quick reference

| I want to… | Do this |
|---|---|
| Find a DSA code | Search tab → pick product chip → type bank name |
| See all of a bank's codes | Click the card → *Products, codes & payout* |
| See a car-loan payout grid | Open the bank → click the **N slabs** chip |
| Pick a lender for a client | Match a Case → fill details → Find best banks |
| Give a client a shortlist | Match a Case → **Print / PDF** |
| Fix wrong data | Manage Banks → Edit |
| Confirm a norm with your RM | Manage Banks → Edit the field → saves as **verified** |
| Back it up | Manage Banks → Export JSON |
| Push changes live | Export JSON → `encrypt_data.py` → commit → push |
| Wipe data off a device | Settings → Lock & sign out |

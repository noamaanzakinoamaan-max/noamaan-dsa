#!/usr/bin/env python3
"""Seed MARKET-REFERENCE eligibility norms into data/banks.json.

IMPORTANT — what this is and is not
-----------------------------------
These are *indicative market norms*, not the lenders' credit policies:

  * RBI LTV slabs are regulatory and reliable (90% up to Rs 30L, 80% Rs 30-75L,
    75% above Rs 75L for home loans). Verified across multiple sources.
  * Everything else is a CATEGORY-LEVEL typical, derived from published
    aggregator data. Public sources disagree badly on per-lender numbers
    (HDFC min income is quoted as both Rs 10k and Rs 25k; Bajaj LAP CIBIL as
    both 650 and 700 on Bajaj's own site). So we do NOT pretend to know each
    lender's exact cutoff.

Every field written here is tagged source="market-reference" and the app shows
it in amber as UNVERIFIED. Anything you type yourself is tagged "desk-verified"
and this script will NEVER overwrite it.

Usage:
    python3 seed_eligibility.py            # fill blanks only (safe, default)
    python3 seed_eligibility.py --reset    # re-seed all market-reference rows
"""
import json, re, sys

SRC = OUT = "data/banks.json"

# ---------------------------------------------------------------- profiles
# (minCibil, minIncome, maxFoir, minAge, maxAge, profiles, vintage)
SAL = "Salaried"
SEP = "Self Employed Professional"
SENP = "Self Employed Non-Professional"
ALL3 = [SAL, SEP, SENP]

BANDS = {
    "PSU Bank":      dict(minCibil=700, minMonthlyIncome=15000, maxFoirPct=60,
                          minAgeYears=21, maxAgeYears=70, profiles=ALL3, minVintageYears=3),
    "Private Bank":  dict(minCibil=720, minMonthlyIncome=25000, maxFoirPct=55,
                          minAgeYears=21, maxAgeYears=65, profiles=ALL3, minVintageYears=3),
    "Bank":          dict(minCibil=710, minMonthlyIncome=20000, maxFoirPct=58,
                          minAgeYears=21, maxAgeYears=65, profiles=ALL3, minVintageYears=3),
    "NBFC / HFC":    dict(minCibil=685, minMonthlyIncome=20000, maxFoirPct=65,
                          minAgeYears=23, maxAgeYears=70, profiles=ALL3, minVintageYears=3),
    "Lender":        dict(minCibil=700, minMonthlyIncome=20000, maxFoirPct=60,
                          minAgeYears=21, maxAgeYears=65, profiles=ALL3, minVintageYears=3),
}

# LTV by product family. Home loan = RBI slab (we store the mid/common 80).
# LAP = market practice, banks 60-70, NBFC/HFC 65-75.
def ltv_for(products, category):
    isnbfc = "NBFC" in category or "HFC" in category
    if any("Home Loan" in p for p in products):
        return 80          # RBI: 90 up to 30L / 80 up to 75L / 75 above
    if any("LAP" in p for p in products):
        return 70 if isnbfc else 65
    return None

# Personal / business loans are unsecured -> no LTV, tighter FOIR, higher CIBIL
UNSECURED = ("Personal Loan", "Business Loan", "MSME Loan")

CITIES = ["Pune", "Mumbai", "Thane", "Navi Mumbai", "Nashik", "Maharashtra"]


def main():
    reset = "--reset" in sys.argv
    doc = json.load(open(SRC))
    banks = doc["banks"]

    filled = skipped = 0
    for b in banks:
        e = b.setdefault("eligibility", {})
        prov = b.setdefault("provenance", {})

        # never touch anything the desk has verified
        desk = {k for k, v in prov.items() if v == "desk-verified"}
        if desk and not reset:
            pass  # still fill the OTHER fields below

        cat = b.get("category", "Lender")
        band = dict(BANDS.get(cat, BANDS["Lender"]))
        prods = b.get("products", [])

        only_unsecured = prods and all(
            any(u in p for u in UNSECURED) for p in prods)
        if only_unsecured:
            band["minCibil"] = max(band["minCibil"], 700)
            band["maxFoirPct"] = min(band["maxFoirPct"], 55)
            band["minMonthlyIncome"] = max(band["minMonthlyIncome"], 25000)

        band["maxLtvPct"] = None if only_unsecured else ltv_for(prods, cat)
        band["cities"] = CITIES

        for key, val in band.items():
            if val is None:
                continue
            cur = e.get(key)
            is_blank = cur in (None, "", []) or (isinstance(cur, list) and not cur)
            if prov.get(key) == "desk-verified":
                skipped += 1
                continue
            if is_blank or (reset and prov.get(key) == "market-reference"):
                e[key] = val
                prov[key] = "market-reference"
                filled += 1

    doc["meta"]["eligibilitySeeded"] = True
    doc["meta"]["eligibilityNote"] = (
        "Eligibility values tagged 'market-reference' are INDICATIVE category-level "
        "norms compiled from public sources (RBI LTV slabs are regulatory; the rest "
        "are typicals). They are NOT the lender's credit policy. Public sources "
        "disagree materially on per-lender cutoffs. Verify against your RM before "
        "committing to a client, then mark the field desk-verified by editing it "
        "in Manage Banks."
    )
    json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"filled {filled} fields across {len(banks)} banks "
          f"({skipped} desk-verified fields left untouched)")
    print("All seeded values are tagged market-reference and show as UNVERIFIED in the app.")


if __name__ == "__main__":
    main()

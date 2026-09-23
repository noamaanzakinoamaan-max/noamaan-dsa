/* match.js — rule-based bank recommendation engine */

const has = (v) => v !== null && v !== undefined && v !== "";
const ci = (arr, v) => arr.some((x) => String(x).toLowerCase() === String(v).toLowerCase());
const ciLoose = (arr, v) =>
  arr.some((x) => {
    const a = String(x).toLowerCase(), b = String(v).toLowerCase();
    return a.includes(b) || b.includes(a) || a === "all india" || a === "pan india" || a === "all";
  });

/* case: {product, profile, cibil, monthlyIncome, existingEmi, loanAmount,
          propertyValue, age, city, employerCategory, businessVintage,
          itrAvailable, bankingOnly} */

export function evaluate(bank, c) {
  const e = bank.eligibility;
  const prov = bank.provenance || {};
  const unverified = (k) => prov[k] === "market-reference";
  const fails = [], warns = [], plus = [];
  let score = 22;

  // product
  if (has(c.product)) {
    if (bank.products.length && !offersProduct(bank, c.product)) {
      fails.push(`Does not offer ${c.product}`);
    } else if (bank.products.length) {
      score += 10;
    }
  }

  // cibil
  if (has(c.cibil) && has(e.minCibil)) {
    const gap = c.cibil - e.minCibil;
    const tag = unverified("minCibil") ? " (indicative)" : "";
    if (gap < -30 && !unverified("minCibil")) fails.push(`CIBIL ${c.cibil} vs required ${e.minCibil}`);
    else if (gap < -30) warns.push(`CIBIL ${c.cibil} well below typical ${e.minCibil}${tag}`), score -= 30;
    else if (gap < 0) warns.push(`CIBIL ${c.cibil} is ${-gap} below norm ${e.minCibil}${tag} — deviation needed`), score -= 18;
    else { score += Math.min(20, gap / 5); plus.push(`CIBIL comfortably above ${e.minCibil}`); }
  }

  // age
  if (has(c.age)) {
    const ageSoft = unverified("minAgeYears") || unverified("maxAgeYears");
    if (has(e.minAgeYears) && c.age < e.minAgeYears)
      ageSoft ? (warns.push(`Age ${c.age} below typical ${e.minAgeYears} (indicative)`), score -= 15)
              : fails.push(`Age ${c.age} below min ${e.minAgeYears}`);
    if (has(e.maxAgeYears) && c.age > e.maxAgeYears)
      ageSoft ? (warns.push(`Age ${c.age} above typical ${e.maxAgeYears} (indicative)`), score -= 15)
              : fails.push(`Age ${c.age} above max ${e.maxAgeYears}`);
  }

  // profile
  if (has(c.profile) && e.profiles.length) {
    if (!ci(e.profiles, c.profile) && !unverified("profiles")) fails.push(`${c.profile} profile not accepted`);
    else if (!ci(e.profiles, c.profile)) warns.push(`${c.profile} may not be accepted (indicative)`), score -= 15;
    else score += 8;
  }

  // income
  if (has(c.monthlyIncome) && has(e.minMonthlyIncome)) {
    if (c.monthlyIncome < e.minMonthlyIncome * 0.85 && !unverified("minMonthlyIncome"))
      fails.push(`Income ₹${fmt(c.monthlyIncome)} below min ₹${fmt(e.minMonthlyIncome)}`);
    else if (c.monthlyIncome < e.minMonthlyIncome * 0.85)
      warns.push(`Income ₹${fmt(c.monthlyIncome)} below typical ₹${fmt(e.minMonthlyIncome)} (indicative)`), score -= 20;
    else if (c.monthlyIncome < e.minMonthlyIncome) warns.push(`Income marginally below min ₹${fmt(e.minMonthlyIncome)}`), score -= 10;
    else score += 8;
  }

  // loan amount band
  if (has(c.loanAmount)) {
    if (has(e.minLoanAmount) && c.loanAmount < e.minLoanAmount) fails.push(`Below min ticket ₹${fmt(e.minLoanAmount)}`);
    if (has(e.maxLoanAmount) && c.loanAmount > e.maxLoanAmount) fails.push(`Above max ticket ₹${fmt(e.maxLoanAmount)}`);
  }

  // FOIR
  const foir = computeFoir(c);
  if (foir !== null && has(e.maxFoirPct)) {
    if (foir > e.maxFoirPct + 8 && !unverified("maxFoirPct")) fails.push(`FOIR ${foir.toFixed(0)}% vs cap ${e.maxFoirPct}%`);
    else if (foir > e.maxFoirPct + 8) warns.push(`FOIR ${foir.toFixed(0)}% over typical ${e.maxFoirPct}% (indicative)`), score -= 22;
    else if (foir > e.maxFoirPct) warns.push(`FOIR ${foir.toFixed(0)}% slightly over cap ${e.maxFoirPct}%`), score -= 12;
    else { score += 10; plus.push(`FOIR ${foir.toFixed(0)}% within ${e.maxFoirPct}% cap`); }
  }

  // LTV
  const ltv = computeLtv(c);
  if (ltv !== null && has(e.maxLtvPct) && e.maxLtvPct > 0) {
    if (ltv > e.maxLtvPct + 5 && !unverified("maxLtvPct")) fails.push(`LTV ${ltv.toFixed(0)}% vs cap ${e.maxLtvPct}%`);
    else if (ltv > e.maxLtvPct + 5) warns.push(`LTV ${ltv.toFixed(0)}% over typical ${e.maxLtvPct}% (indicative)`), score -= 22;
    else if (ltv > e.maxLtvPct) warns.push(`LTV ${ltv.toFixed(0)}% marginally over ${e.maxLtvPct}%`), score -= 10;
    else { score += 8; plus.push(`LTV ${ltv.toFixed(0)}% OK (cap ${e.maxLtvPct}%)`); }
  }

  // employer category
  if (has(c.employerCategory) && e.employerCategory.length) {
    if (!ci(e.employerCategory, c.employerCategory)) fails.push(`Employer cat ${c.employerCategory} not in list`);
    else score += 5;
  }

  // vintage
  if (has(c.businessVintage) && has(e.minVintageYears)) {
    if (c.businessVintage < e.minVintageYears) warns.push(`Vintage ${c.businessVintage}y vs ${e.minVintageYears}y required`), score -= 14;
    else score += 5;
  }

  // documents
  if (c.itrAvailable === false && e.acceptsItrOnly === true && e.acceptsBankingProgram !== true) {
    warns.push("No ITR — this lender is ITR-driven"); score -= 15;
  }
  if (c.bankingOnly === true) {
    if (e.acceptsBankingProgram === true) { score += 14; plus.push("Runs a banking/turnover program"); }
    else if (e.acceptsBankingProgram === false) fails.push("No banking-surrogate program");
  }

  // city
  if (has(c.city) && e.cities.length) {
    if (!ciLoose(e.cities, c.city)) warns.push(`${c.city} may be outside footprint`), score -= 8;
    else score += 6;
  }

  // commercials — payout to you, ROI/TAT to client
  const payout = payoutFor(bank, c.product);
  if (payout !== null) score += Math.min(14, payout * 5);
  if (has(bank.ops.roiFrom)) score += Math.max(-8, (11 - bank.ops.roiFrom) * 2);
  if (has(bank.ops.tatDays)) score += Math.max(-8, (10 - bank.ops.tatDays) * 0.6);

  const verdict = fails.length ? "Not eligible" : warns.length ? "Possible with deviation" : "Strong fit";
  if (fails.length) score = Math.max(0, score - 100 - fails.length * 5);
  score -= warns.length * 2;

  // completeness: a lender with no rules recorded shouldn't outrank a fully-vetted one
  const known = [e.minCibil, e.minMonthlyIncome, e.maxFoirPct, e.maxLtvPct, e.minAgeYears,
                 e.minLoanAmount, e.maxLoanAmount].filter(has).length
              + (e.profiles.length ? 1 : 0) + (e.cities.length ? 1 : 0);
  score += known * 1.2;

  const offering = (bank.offerings || []).find((o) => {
    if (!c.product) return false;
    const keys = productKeys(c.product);
    const bp = String(o.baseProduct || o.product || "").toLowerCase();
    return keys.some((k) => bp === k || bp.includes(k) || k.includes(bp));
  }) || null;

  return {
    bank, score: Math.round(Math.max(0, Math.min(100, score))),
    verdict, fails, warns, plus, foir, ltv, payout,
    code: codeFor(bank, c.product), offering,
    unverifiedCount: Object.values(prov).filter((v) => v === "market-reference").length,
    hasVerified: Object.values(prov).some((v) => v === "desk-verified"),
    estPayoutAmount: payout !== null && has(c.loanAmount) ? (c.loanAmount * payout) / 100 : null
  };
}

export function computeFoir(c) {
  if (!has(c.monthlyIncome) || c.monthlyIncome <= 0) return null;
  const emi = (c.existingEmi || 0) + estimateEmi(c);
  return (emi / c.monthlyIncome) * 100;
}

export function estimateEmi(c) {
  if (!has(c.loanAmount)) return 0;
  const r = (has(c.roi) ? c.roi : 9.5) / 1200;
  const n = (has(c.tenureYears) ? c.tenureYears : 20) * 12;
  if (r <= 0) return c.loanAmount / n;
  return (c.loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function computeLtv(c) {
  if (!has(c.loanAmount) || !has(c.propertyValue) || c.propertyValue <= 0) return null;
  return (c.loanAmount / c.propertyValue) * 100;
}

const PROD_ALIAS = {
  "home loan": ["home loan / bt", "home loan", "hl"],
  "home loan / bt": ["home loan / bt", "home loan"],
  "balance transfer": ["home loan / bt"],
  "lap": ["lap / lrd", "lap"],
  "lap / lrd": ["lap / lrd", "lap"],
  "business loan": ["business loan", "msme loan"],
  "msme loan": ["msme loan", "business loan"],
  "car loan": ["new car loan", "used car loan"],
  "new car loan": ["new car loan"],
  "used car loan": ["used car loan"]
};

export function productKeys(product) {
  const p = String(product || "").toLowerCase().trim();
  return PROD_ALIAS[p] || (p ? [p] : []);
}

export function offersProduct(bank, product) {
  if (!product) return true;
  const keys = productKeys(product);
  const own = (bank.products || []).map((x) => x.toLowerCase());
  return own.some((x) => keys.some((k) => x === k || x.includes(k) || k.includes(x)));
}

export function payoutFor(bank, product) {
  const p = bank.payout || {};
  const entries = Object.entries(p);
  if (product) {
    const keys = productKeys(product);
    const hits = entries.filter(([k]) => {
      const kk = k.toLowerCase();
      return keys.some((x) => kk === x || kk.includes(x) || x.includes(kk));
    }).map(([, v]) => v).filter((v) => typeof v === "number");
    if (hits.length) return Math.max(...hits);
    // product was specified but this lender has no numeric rate for it —
    // never borrow another product's payout, that would skew the ranking
    if (has(p.Default)) return p.Default;
    return null;
  }
  if (has(p.Default)) return p.Default;
  const vals = entries.map(([, v]) => v).filter((v) => typeof v === "number");
  return vals.length ? Math.max(...vals) : null;
}

/** the specific DSA code to use for this product, falling back to the bank's primary */
export function codeFor(bank, product) {
  const offs = bank.offerings || [];
  if (product) {
    const keys = productKeys(product);
    const hit = offs.find((o) => {
      const bp = String(o.baseProduct || o.product || "").toLowerCase();
      return o.dsaCode && keys.some((k) => bp === k || bp.includes(k) || k.includes(bp));
    });
    if (hit) return hit.dsaCode;
  }
  return bank.dsaCode || (offs.find((o) => o.dsaCode) || {}).dsaCode || "";
}

export function rank(banks, c) {
  return banks.map((b) => evaluate(b, c)).sort((a, z) => {
    const order = { "Strong fit": 0, "Possible with deviation": 1, "Not eligible": 2 };
    return order[a.verdict] - order[z.verdict] || z.score - a.score;
  });
}

export function fmt(n) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  if (n >= 1e7) return (n / 1e7).toFixed(2).replace(/\.00$/, "") + " Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(2).replace(/\.00$/, "") + " L";
  return Math.round(n).toLocaleString("en-IN");
}

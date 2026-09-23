/* store.js — bank master data: load, persist, normalise */

export const PRODUCTS = [
  "Home Loan / BT", "LAP / LRD", "Personal Loan", "Business Loan",
  "Education Loan", "MSME Loan", "New Car Loan", "Used Car Loan",
  "Commercial Vehicle / CE", "Machinery Loan", "Gold Loan",
  "School Funding", "CASA Account", "Fixed Deposit", "Credit Card"
];

export const PROFILES = [
  "Salaried", "Self Employed Professional", "Self Employed Non-Professional"
];

const KEY = "dsadesk.banks.v1";
const SETTINGS_KEY = "dsadesk.settings.v1";

export const blankBank = () => ({
  id: "", name: "", category: "", products: [], dsaCode: "", channelCode: "",
  payout: {}, offerings: [],
  eligibility: {
    minCibil: null, minAgeYears: null, maxAgeYears: null, minMonthlyIncome: null,
    minLoanAmount: null, maxLoanAmount: null, maxFoirPct: null, maxLtvPct: null,
    profiles: [], employerCategory: [], minVintageYears: null,
    acceptsItrOnly: null, acceptsBankingProgram: null, cities: []
  },
  contact: { person: "", phone: "", email: "", region: "" },
  ops: { loginMode: "", tatDays: null, processingFeePct: null, roiFrom: null },
  notes: ""
});

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).toLowerCase().replace(/[, ₹]/g, "").trim();
  if (!s || s === "-" || s === "na" || s === "n/a") return null;
  let mult = 1;
  let body = s;
  if (/(cr|crore)s?$/.test(s)) { mult = 1e7; body = s.replace(/(cr|crore)s?$/, ""); }
  else if (/(l|lac|lakh|lakhs|lacs)$/.test(s)) { mult = 1e5; body = s.replace(/(l|lac|lakh|lakhs|lacs)$/, ""); }
  else if (/k$/.test(s)) { mult = 1e3; body = s.replace(/k$/, ""); }
  const m = parseFloat(body.replace(/[^0-9.\-]/g, ""));
  return isFinite(m) ? m * mult : null;
};

const bool = (v) => {
  if (v === true || v === false) return v;
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (["y", "yes", "true", "1", "allowed", "accepted"].includes(s)) return true;
  if (["n", "no", "false", "0", "not allowed", "na"].includes(s)) return false;
  return null;
};

const list = (v) => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v === null || v === undefined || v === "") return [];
  return String(v).split(/[,;|/]+/).map((x) => x.trim()).filter(Boolean);
};

export const slug = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export function normaliseBank(raw, i = 0) {
  const b = blankBank();
  const e = raw.eligibility || {};
  const c = raw.contact || {};
  const o = raw.ops || {};
  b.name = String(raw.name || raw.bank || raw.bankName || "").trim();
  b.id = raw.id || slug(b.name) || `bank-${i}`;
  b.category = String(raw.category || raw.type || "").trim();
  b.products = list(raw.products || raw.product);
  b.dsaCode = String(raw.dsaCode || raw.dsa || raw.code || "").trim();
  b.channelCode = String(raw.channelCode || raw.channel || "").trim();
  b.notes = String(raw.notes || raw.remarks || "").trim();
  b.offerings = Array.isArray(raw.offerings) ? raw.offerings.map((o) => ({
    product: String(o.product || ""),
    baseProduct: String(o.baseProduct || o.product || "").split(" — ")[0],
    variant: String(o.variant || ""),
    dsaCode: String(o.dsaCode || ""),
    payout: o.payout === null || o.payout === undefined ? null : Number(o.payout),
    payoutText: String(o.payoutText || ""),
    entity: String(o.entity || ""),
    section: String(o.section || ""),
    page: o.page ?? null,
    slabs: Array.isArray(o.slabs) ? o.slabs : []
  })) : [];

  if (raw.payout && typeof raw.payout === "object") {
    for (const [k, v] of Object.entries(raw.payout)) {
      const n = num(v); if (n !== null) b.payout[k] = n;
    }
  } else {
    const src = raw.payout ?? raw.payoutPct ?? raw.commission;
    const s = src === null || src === undefined ? "" : String(src);
    if (s.includes(":")) {
      s.split(/[;,|]+/).forEach((part) => {
        const [k, v] = part.split(":");
        const n2 = num(v);
        if (k && n2 !== null) b.payout[k.trim()] = n2;
      });
    } else {
      const n = num(src);
      if (n !== null) b.payout["Default"] = n;
    }
  }

  b.eligibility = {
    minCibil: num(e.minCibil ?? raw.minCibil ?? raw.cibil),
    minAgeYears: num(e.minAgeYears ?? raw.minAgeYears ?? raw.minAge),
    maxAgeYears: num(e.maxAgeYears ?? raw.maxAgeYears ?? raw.maxAge),
    minMonthlyIncome: num(e.minMonthlyIncome ?? raw.minMonthlyIncome ?? raw.minIncome),
    minLoanAmount: num(e.minLoanAmount ?? raw.minLoanAmount ?? raw.minLoan),
    maxLoanAmount: num(e.maxLoanAmount ?? raw.maxLoanAmount ?? raw.maxLoan),
    maxFoirPct: num(e.maxFoirPct ?? raw.maxFoirPct ?? raw.maxFoir ?? raw.foir),
    maxLtvPct: num(e.maxLtvPct ?? raw.maxLtvPct ?? raw.maxLtv ?? raw.ltv),
    profiles: list(e.profiles ?? raw.profiles ?? raw.profile),
    employerCategory: list(e.employerCategory ?? raw.employerCategory ?? raw.category_emp),
    minVintageYears: num(e.minVintageYears ?? raw.minVintageYears ?? raw.vintage),
    acceptsItrOnly: bool(e.acceptsItrOnly ?? raw.acceptsItrOnly ?? raw.itrOnly),
    acceptsBankingProgram: bool(e.acceptsBankingProgram ?? raw.acceptsBankingProgram ?? raw.bankingProgram),
    cities: list(e.cities ?? raw.cities ?? raw.city ?? raw.location)
  };
  b.contact = {
    person: String(c.person ?? raw.contactPerson ?? raw.spoc ?? "").trim(),
    phone: String(c.phone ?? raw.phone ?? raw.mobile ?? "").trim(),
    email: String(c.email ?? raw.email ?? "").trim(),
    region: String(c.region ?? raw.region ?? "").trim()
  };
  b.ops = {
    loginMode: String(o.loginMode ?? raw.loginMode ?? raw.login ?? "").trim(),
    tatDays: num(o.tatDays ?? raw.tat ?? raw.tatDays),
    processingFeePct: num(o.processingFeePct ?? raw.pf ?? raw.processingFee),
    roiFrom: num(o.roiFrom ?? raw.roi ?? raw.rate)
  };
  return b;
}

export const Store = {
  banks: [],
  settings: { apiKey: "", model: "gpt-4o-mini", endpoint: "https://api.openai.com/v1/chat/completions" },

  /** seed from an already-decrypted document */
  loadSeed(doc) {
    const rows = doc.banks || doc;
    this.banks = rows.map(normaliseBank);
    this.save();
    return this.banks;
  },

  async init(seedUrl = "data/banks.json") {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      try { this.banks = JSON.parse(saved).map(normaliseBank); } catch { this.banks = []; }
    }
    if (!this.banks.length && seedUrl) {
      try {
        const r = await fetch(seedUrl, { cache: "no-store" });
        const j = await r.json();
        this.banks = (j.banks || j).map(normaliseBank);
      } catch { this.banks = []; }
    }
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch {}
    return this.banks;
  },

  clearAll() {
    localStorage.removeItem(KEY);
    this.banks = [];
  },

  save() {
    localStorage.setItem(KEY, JSON.stringify(this.banks));
  },
  saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  },
  replaceAll(rows) {
    this.banks = rows.map(normaliseBank);
    this.save();
  },
  merge(rows) {
    const map = new Map(this.banks.map((b) => [b.id, b]));
    rows.map(normaliseBank).forEach((b) => map.set(b.id, b));
    this.banks = [...map.values()];
    this.save();
  },
  upsert(bank) {
    const b = normaliseBank(bank);
    const i = this.banks.findIndex((x) => x.id === b.id);
    if (i >= 0) this.banks[i] = b; else this.banks.push(b);
    this.save();
    return b;
  },
  remove(id) {
    this.banks = this.banks.filter((b) => b.id !== id);
    this.save();
  },
  allProducts() {
    const s = new Set();
    this.banks.forEach((b) => b.products.forEach((p) => s.add(p)));
    return [...s].sort();
  },
  allCities() {
    const s = new Set();
    this.banks.forEach((b) => b.eligibility.cities.forEach((c) => s.add(c)));
    return [...s].sort();
  }
};

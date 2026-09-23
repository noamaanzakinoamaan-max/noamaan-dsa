/* importer.js — CSV / TSV / JSON / pasted-PDF-text ingestion with column mapping */

export function parseDelimited(text) {
  const delim = detectDelim(text);
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

function detectDelim(text) {
  const head = text.split("\n").slice(0, 5).join("\n");
  const counts = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  for (const ch of head) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/* Header autodetect → canonical field */
const FIELD_HINTS = [
  ["name", /^(bank|bank\s*name|lender|financier|name|institution|nbfc)$/i],
  ["dsaCode", /(dsa|agent|partner|broker).*(code|id|no)|^code$|^dsa$/i],
  ["channelCode", /(channel|branch|login|sourcing).*(code|id)/i],
  ["category", /^(category|type|segment|bank\s*type)$/i],
  ["products", /^(product|products|loan\s*type|offerings?)$/i],
  ["payout", /(payout|commission|brokerage|pay\s*out|%)/i],
  ["minCibil", /(cibil|credit\s*score|bureau).*(min|cut|req)?|^cibil$/i],
  ["minMonthlyIncome", /(min).*(income|salary)|^income$|^salary$/i],
  ["minLoanAmount", /(min).*(loan|ticket|amount)/i],
  ["maxLoanAmount", /(max).*(loan|ticket|amount)/i],
  ["maxFoirPct", /foir|dbr|obligation/i],
  ["maxLtvPct", /ltv|loan\s*to\s*value/i],
  ["minAge", /(min).*age|^age\s*from$/i],
  ["maxAge", /(max).*age|^age\s*to$/i],
  ["profiles", /profile|salaried|self\s*employed|applicant\s*type/i],
  ["employerCategory", /employer|company\s*cat|cat\s*a/i],
  ["vintage", /vintage|years?\s*in\s*business|business\s*age/i],
  ["cities", /city|cities|location|geograph|footprint|state/i],
  ["contactPerson", /(contact|spoc|rm|manager|person)/i],
  ["phone", /(phone|mobile|contact\s*no|number)/i],
  ["email", /e-?mail/i],
  ["region", /region|zone/i],
  ["loginMode", /login|mode|process/i],
  ["tat", /tat|turn\s*around|days/i],
  ["processingFee", /processing|^pf$|fee/i],
  ["roi", /roi|rate\s*of\s*interest|interest/i],
  ["notes", /note|remark|comment|condition/i]
];

export const CANON_FIELDS = [
  "", "name", "dsaCode", "channelCode", "category", "products", "payout",
  "minCibil", "minMonthlyIncome", "minLoanAmount", "maxLoanAmount", "maxFoirPct",
  "maxLtvPct", "minAge", "maxAge", "profiles", "employerCategory", "vintage",
  "cities", "contactPerson", "phone", "email", "region", "loginMode", "tat",
  "processingFee", "roi", "notes"
];

export function guessMapping(headers) {
  const used = new Set();
  return headers.map((h) => {
    const clean = String(h || "").trim();
    for (const [field, re] of FIELD_HINTS) {
      if (used.has(field)) continue;
      if (re.test(clean)) { used.add(field); return field; }
    }
    return "";
  });
}

export function rowsToBanks(rows, mapping, hasHeader = true) {
  const body = hasHeader ? rows.slice(1) : rows;
  const out = [];
  for (const r of body) {
    const o = {};
    mapping.forEach((f, i) => { if (f && r[i] !== undefined && String(r[i]).trim() !== "") o[f] = String(r[i]).trim(); });
    if (!o.name) continue;
    out.push(o);
  }
  return out;
}

/* Turn raw PDF text into rough rows: split lines, then on 2+ spaces / tabs */
export function pdfTextToRows(text) {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3)
    .map((l) => l.split(/\t|\s{2,}|\s*\|\s*/).map((c) => c.trim()).filter((c) => c !== ""))
    .filter((r) => r.length >= 2);
}

export function toCsv(banks) {
  const head = ["name","category","products","dsaCode","channelCode","payout","minCibil","minMonthlyIncome","minLoanAmount","maxLoanAmount","maxFoirPct","maxLtvPct","minAge","maxAge","profiles","employerCategory","vintage","cities","contactPerson","phone","email","region","loginMode","tat","processingFee","roi","notes"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.join(",")];
  for (const b of banks) {
    const e = b.eligibility, c = b.contact, o = b.ops;
    const pay = Object.entries(b.payout).map(([k, v]) => `${k}:${v}`).join("; ");
    lines.push([b.name, b.category, b.products.join("; "), b.dsaCode, b.channelCode, pay,
      e.minCibil, e.minMonthlyIncome, e.minLoanAmount, e.maxLoanAmount, e.maxFoirPct, e.maxLtvPct,
      e.minAgeYears, e.maxAgeYears, e.profiles.join("; "), e.employerCategory.join("; "),
      e.minVintageYears, e.cities.join("; "), c.person, c.phone, c.email, c.region,
      o.loginMode, o.tatDays, o.processingFeePct, o.roiFrom, b.notes].map(esc).join(","));
  }
  return lines.join("\n");
}

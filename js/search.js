/* search.js — fuzzy, typo-tolerant search across every field */

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function haystack(b) {
  const e = b.eligibility;
  return norm([
    b.name, b.category, b.dsaCode, b.channelCode, b.notes,
    b.products.join(" "), e.cities.join(" "), e.profiles.join(" "),
    b.contact.person, b.contact.region, b.contact.phone, b.contact.email,
    b.ops.loginMode, Object.keys(b.payout).join(" "),
    (b.offerings || []).map((o) => o.dsaCode + " " + o.product + " " + o.entity).join(" ")
  ].join(" "));
}

/* subsequence match: "hdf" matches "hdfc", "axs" matches "axis" */
function subseq(needle, hay) {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

function tokenScore(tok, b, hay) {
  const name = norm(b.name);
  const code = norm(b.dsaCode + " " + b.channelCode + " " +
    (b.offerings || []).map((o) => o.dsaCode).join(" "));
  if (code.includes(tok)) return 120;
  if (name === tok) return 110;
  if (name.startsWith(tok)) return 95;
  if (name.split(" ").some((w) => w.startsWith(tok))) return 80;
  if (name.includes(tok)) return 70;
  if (hay.includes(tok)) return 45;
  if (subseq(tok, name)) return 35;
  if (tok.length >= 4 && name.split(" ").some((w) => lev(tok, w) <= 1)) return 30;
  return 0;
}

export function search(banks, query, limit = 500) {
  const q = norm(query);
  if (!q) return banks.map((b) => ({ bank: b, score: 0 }));
  const toks = q.split(" ");
  const out = [];
  for (const b of banks) {
    const hay = haystack(b);
    let total = 0, ok = true;
    for (const t of toks) {
      const s = tokenScore(t, b, hay);
      if (!s) { ok = false; break; }
      total += s;
    }
    if (ok) out.push({ bank: b, score: total });
  }
  out.sort((a, z) => z.score - a.score || a.bank.name.localeCompare(z.bank.name));
  return out.slice(0, limit);
}

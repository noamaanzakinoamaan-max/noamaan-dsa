/* docs.js — read uploaded documents and turn them into a case profile */

export async function fileToText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return await pdfText(file);
  if (/\.(png|jpg|jpeg|webp)$/.test(name)) return { text: "", image: await toDataUrl(file) };
  return { text: await file.text(), image: null };
}

export function toDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = res; s.onerror = () => rej(new Error("pdf.js failed to load (offline?)"));
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}

export async function pdfText(file) {
  const lib = await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    out += tc.items.map((i) => i.str).join(" ") + "\n\n";
  }
  return { text: out, image: null };
}

/* ---------- offline heuristic extraction ---------- */

const rx = {
  cibil: /\b(?:cibil|credit\s*score|score)\D{0,20}(\d{3})\b/i,
  pan: /\b([A-Z]{5}\d{4}[A-Z])\b/,
  netpay: /(?:net\s*(?:pay|salary)|take\s*home|amount\s*payable|net\s*amount)\D{0,25}([\d,]+(?:\.\d+)?)/i,
  gross: /(?:gross\s*(?:pay|salary|earnings)|total\s*earnings)\D{0,25}([\d,]+(?:\.\d+)?)/i,
  emi: /(?:emi|instal?ment)\D{0,20}([\d,]+(?:\.\d+)?)/i,
  income: /(?:gross\s*total\s*income|total\s*income)\D{0,25}([\d,]+(?:\.\d+)?)/i,
  dob: /\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b/,
  loan: /(?:loan\s*(?:amount|required|sought)|requirement)\D{0,20}([\d,]+(?:\.\d+)?)/i
};

const n = (s) => (s ? parseFloat(String(s).replace(/,/g, "")) : null);

export function heuristicExtract(text) {
  const t = text.replace(/\s+/g, " ");
  const out = { _source: "offline text scan", _confidence: "low" };
  let m;
  if ((m = t.match(rx.cibil))) { const v = +m[1]; if (v >= 300 && v <= 900) out.cibil = v; }
  if ((m = t.match(rx.pan))) out.pan = m[1];
  if ((m = t.match(rx.netpay))) out.monthlyIncome = n(m[1]);
  if (!out.monthlyIncome && (m = t.match(rx.gross))) out.monthlyIncome = n(m[1]);
  if (!out.monthlyIncome && (m = t.match(rx.income))) out.monthlyIncome = Math.round(n(m[1]) / 12);
  if ((m = t.match(rx.emi))) out.existingEmi = n(m[1]);
  if ((m = t.match(rx.loan))) out.loanAmount = n(m[1]);
  if ((m = t.match(rx.dob))) {
    const y = +m[3];
    if (y > 1930 && y < 2012) out.age = new Date().getFullYear() - y;
  }
  if (/itr|income tax return|form\s*16/i.test(t)) out.itrAvailable = true;
  if (/salary\s*slip|payslip|pay slip|salary certificate/i.test(t)) out.profile = "Salaried";
  else if (/gstin|gst\s*no|balance sheet|profit\s*(?:&|and)\s*loss/i.test(t)) out.profile = "Self Employed Non-Professional";
  return out;
}

/* ---------- AI extraction (optional, needs key) ---------- */

const SCHEMA = `Return ONLY JSON, no prose, with any of these keys you can confirm:
{"applicantName":string,"pan":string,"profile":"Salaried"|"Self Employed Professional"|"Self Employed Non-Professional",
"cibil":number,"age":number,"monthlyIncome":number,"existingEmi":number,"loanAmount":number,"propertyValue":number,
"city":string,"employerName":string,"employerCategory":"A"|"B"|"C"|"D","businessVintage":number,
"itrAvailable":boolean,"bankingOnly":boolean,"documentTypes":[string],"redFlags":[string],"notes":string}
Amounts in rupees (monthly figures monthly). Omit keys you cannot determine. Never invent values.`;

export async function aiExtract(settings, payload) {
  if (!settings.apiKey) throw new Error("No API key set — open Settings.");
  const content = [{ type: "text", text: SCHEMA + "\n\nDOCUMENTS:\n" + (payload.text || "").slice(0, 60000) }];
  (payload.images || []).slice(0, 4).forEach((url) =>
    content.push({ type: "image_url", image_url: { url } })
  );
  const r = await fetch(settings.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: "You are a loan file underwriter's assistant. Extract structured facts from Indian loan documents." },
        { role: "user", content }
      ],
      temperature: 0
    })
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content || "{}";
  const match = txt.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : "{}");
  parsed._source = "AI extraction";
  parsed._confidence = "high";
  return parsed;
}

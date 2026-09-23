import { Store, PRODUCTS, PROFILES, blankBank, slug } from "./store.js";
import { search } from "./search.js";
import { rank, evaluate, fmt, computeFoir, computeLtv, estimateEmi, payoutFor, codeFor, offersProduct } from "./match.js";
import { fileToText, heuristicExtract, aiExtract } from "./docs.js";
import { parseDelimited, guessMapping, rowsToBanks, pdfTextToRows, CANON_FIELDS, toCsv } from "./importer.js";
import { decryptBundle, remember, recall, forget } from "./crypto.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function toast(msg, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------------- nav ---------------- */
$$("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    $$("nav button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    $$(".view").forEach((v) => v.classList.remove("on"));
    $("#v-" + b.dataset.view).classList.add("on");
    if (b.dataset.view === "manage") renderManage();
  })
);

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
    e.preventDefault();
    $$("nav button")[0].click(); $("#q").focus();
  }
});

/* ---------------- search ---------------- */
let productFilter = "";

function renderChips() {
  const prods = Store.allProducts();
  $("#prodChips").innerHTML =
    `<span class="chip ${productFilter ? "" : "on"}" data-p="">All products</span>` +
    prods.map((p) => `<span class="chip ${productFilter === p ? "on" : ""}" data-p="${esc(p)}">${esc(p)}</span>`).join("");
  $$("#prodChips .chip").forEach((c) =>
    c.addEventListener("click", () => { productFilter = c.dataset.p; renderChips(); renderSearch(); })
  );
}

function bankCard(b) {
  const code = productFilter ? codeFor(b, productFilter) : b.dsaCode;
  const pay = Object.entries(b.payout);
  const shown = productFilter
    ? pay.filter(([k]) => k.toLowerCase().includes(productFilter.toLowerCase().split(" /")[0]))
    : pay;
  const payTxt = (shown.length ? shown : pay).slice(0, 3)
    .map(([k, v]) => `${v}%${shown.length === 1 || pay.length === 1 ? "" : " " + k.split(" /")[0]}`).join(" · ") || "—";
  const nOff = (b.offerings || []).length;
  return `<div class="bank" data-id="${esc(b.id)}">
    <div class="top">
      <div><h4>${esc(b.name)}</h4><div class="cat">${esc(b.category || "—")}${b.contact.region ? " · " + esc(b.contact.region) : ""}</div></div>
      <div class="code">${esc(code || "no code")}</div>
    </div>
    <div class="tags">${b.products.slice(0, 5).map((p) => `<span class="tag">${esc(p)}</span>`).join("")}
      ${b.products.length > 5 ? `<span class="tag">+${b.products.length - 5}</span>` : ""}</div>
    <div class="metrics">
      <span>Payout <b>${payTxt}</b></span>
      ${nOff ? `<span>Schemes <b>${nOff}</b></span>` : ""}
      ${b.eligibility.minCibil ? `<span>CIBIL <b>${b.eligibility.minCibil}</b></span>` : ""}
      ${b.ops.roiFrom ? `<span>ROI <b>${b.ops.roiFrom}%</b></span>` : ""}
    </div>
  </div>`;
}

function renderSearch() {
  let pool = Store.banks;
  if (productFilter) pool = pool.filter((b) => offersProduct(b, productFilter));
  const res = search(pool, $("#q").value);
  $("#results").innerHTML = res.length
    ? res.map((r) => bankCard(r.bank)).join("")
    : `<div class="empty">No bank matches that. Try a shorter query, or import your master in the <b>Import</b> tab.</div>`;
  $$("#results .bank").forEach((el) => el.addEventListener("click", () => openBank(el.dataset.id)));
  $("#count").textContent = `${Store.banks.length} banks`;
}
$("#q").addEventListener("input", renderSearch);

/* ---------------- bank detail ---------------- */
function openBank(id) {
  const b = Store.banks.find((x) => x.id === id);
  if (!b) return;
  const e = b.eligibility, c = b.contact, o = b.ops;
  const kv = (k, v) => `<dt>${k}</dt><dd>${v === null || v === undefined || v === "" ? "—" : esc(v)}</dd>`;
  $("#dlgTitle").textContent = b.name;
  $("#dlgBody").innerHTML = `
    <div class="card" style="margin:0 0 14px">
      <h3>Codes</h3>
      <dl class="kv">${kv("DSA code", b.dsaCode)}${kv("Channel / branch code", b.channelCode)}${kv("Category", b.category)}${kv("Products", b.products.join(", "))}</dl>
    </div>
    ${(b.offerings || []).length ? `<div class="card" style="margin:0 0 14px">
      <h3>Products, codes &amp; payout</h3>
      <div class="scroll" style="max-height:340px"><table><thead><tr>
        <th>Product</th><th>DSA code</th><th>Payout</th><th>Billed under</th></tr></thead><tbody>
        ${b.offerings.map((o) => `<tr>
          <td>${esc(o.product)}${o.slabs && o.slabs.length ? ` <span class="tag" style="cursor:pointer" data-slab="${esc(o.product)}">${o.slabs.length} slabs</span>` : ""}</td>
          <td>${o.dsaCode ? `<span class="code">${esc(o.dsaCode)}</span>` : "—"}</td>
          <td>${esc(o.payoutText || (o.payout !== null ? o.payout + "%" : "—"))}</td>
          <td style="font-size:11px;color:var(--dim)">${esc(o.entity || "—")}</td></tr>`).join("")}
      </tbody></table></div>
      <div id="slabBox"></div></div>`
    : `<div class="card" style="margin:0 0 14px"><h3>Payout</h3>
      <dl class="kv">${Object.entries(b.payout).map(([k, v]) => kv(k, v + " %")).join("") || kv("Payout", "")}</dl></div>`}
    <div class="card" style="margin:0 0 14px"><h3>Eligibility</h3><dl class="kv">
      ${kv("Min CIBIL", e.minCibil)}${kv("Age", (e.minAgeYears ?? "—") + " – " + (e.maxAgeYears ?? "—"))}
      ${kv("Min monthly income", e.minMonthlyIncome ? "₹" + fmt(e.minMonthlyIncome) : "")}
      ${kv("Ticket size", (e.minLoanAmount ? "₹" + fmt(e.minLoanAmount) : "—") + " – " + (e.maxLoanAmount ? "₹" + fmt(e.maxLoanAmount) : "—"))}
      ${kv("Max FOIR", e.maxFoirPct ? e.maxFoirPct + " %" : "")}${kv("Max LTV", e.maxLtvPct ? e.maxLtvPct + " %" : "")}
      ${kv("Profiles", e.profiles.join(", "))}${kv("Employer cat", e.employerCategory.join(", "))}
      ${kv("Min vintage", e.minVintageYears ? e.minVintageYears + " yrs" : "")}
      ${kv("ITR-based", e.acceptsItrOnly === null ? "" : e.acceptsItrOnly ? "Yes" : "No")}
      ${kv("Banking program", e.acceptsBankingProgram === null ? "" : e.acceptsBankingProgram ? "Yes" : "No")}
      ${kv("Cities", e.cities.join(", "))}</dl></div>
    <div class="card" style="margin:0 0 14px"><h3>Ops &amp; contact</h3><dl class="kv">
      ${kv("Login mode", o.loginMode)}${kv("TAT", o.tatDays ? o.tatDays + " days" : "")}
      ${kv("Processing fee", o.processingFeePct ? o.processingFeePct + " %" : "")}${kv("ROI from", o.roiFrom ? o.roiFrom + " %" : "")}
      ${kv("Contact", c.person)}${kv("Phone", c.phone)}${kv("Email", c.email)}${kv("Region", c.region)}</dl></div>
    ${b.notes ? `<div class="card" style="margin:0 0 14px"><h3>Notes</h3><div>${esc(b.notes)}</div></div>` : ""}
    <div class="btns">
      <button class="btn sec" id="copyCode">Copy DSA code</button>
      <button class="btn sec" id="editBank">Edit</button>
    </div>`;
  $("#dlg").showModal();
  $("#copyCode").onclick = () => { navigator.clipboard?.writeText(b.dsaCode || ""); toast("DSA code copied"); };
  $$("#dlgBody [data-slab]").forEach((el) => el.onclick = (ev) => {
    ev.stopPropagation();
    const off = b.offerings.find((o) => o.product === el.dataset.slab);
    if (!off) return;
    $("#slabBox").innerHTML = `<div style="margin-top:12px">
      <div class="cat" style="margin-bottom:6px">${esc(off.product)} — rate / payout slabs (page ${off.page})</div>
      <div class="scroll" style="max-height:260px"><table><thead><tr><th>Slab</th><th>Rate</th><th>Payout</th></tr></thead>
      <tbody>${off.slabs.map((sl) => `<tr><td style="font-size:12px">${esc(sl.label || "—")}</td>
        <td>${esc(sl.rate || "—")}</td><td>${sl.payout}%</td></tr>`).join("")}</tbody></table></div></div>`;
  });
  $("#editBank").onclick = () => { $("#dlg").close(); editBank(b.id); };
}
$("#dlgX").onclick = () => $("#dlg").close();

/* ---------------- edit / add bank ---------------- */
function editBank(id) {
  const b = id ? structuredClone(Store.banks.find((x) => x.id === id)) : blankBank();
  const e = b.eligibility, c = b.contact, o = b.ops;
  const f = (lbl, key, val, type = "text") =>
    `<div><label class="f">${lbl}</label><input type="${type}" data-k="${key}" value="${esc(val ?? "")}"></div>`;
  $("#dlgTitle").textContent = id ? "Edit " + b.name : "Add bank";
  $("#dlgBody").innerHTML = `<div class="row">
    ${f("Bank name *", "name", b.name)}${f("Category", "category", b.category)}
    ${f("DSA code", "dsaCode", b.dsaCode)}${f("Channel code", "channelCode", b.channelCode)}
    ${f("Products (comma sep)", "products", b.products.join(", "))}
    ${f("Payout (Home Loan:0.8, LAP:1)", "payout", Object.entries(b.payout).map(([k, v]) => k + ":" + v).join(", "))}
    ${f("Min CIBIL", "minCibil", e.minCibil, "number")}${f("Min age", "minAge", e.minAgeYears, "number")}
    ${f("Max age", "maxAge", e.maxAgeYears, "number")}${f("Min monthly income", "minMonthlyIncome", e.minMonthlyIncome, "number")}
    ${f("Min loan", "minLoanAmount", e.minLoanAmount, "number")}${f("Max loan", "maxLoanAmount", e.maxLoanAmount, "number")}
    ${f("Max FOIR %", "maxFoirPct", e.maxFoirPct, "number")}${f("Max LTV %", "maxLtvPct", e.maxLtvPct, "number")}
    ${f("Profiles (comma sep)", "profiles", e.profiles.join(", "))}
    ${f("Employer cat (A,B,C)", "employerCategory", e.employerCategory.join(", "))}
    ${f("Min vintage yrs", "vintage", e.minVintageYears, "number")}
    ${f("Cities (comma sep)", "cities", e.cities.join(", "))}
    ${f("ITR based (y/n)", "itrOnly", e.acceptsItrOnly === null ? "" : e.acceptsItrOnly ? "y" : "n")}
    ${f("Banking program (y/n)", "bankingProgram", e.acceptsBankingProgram === null ? "" : e.acceptsBankingProgram ? "y" : "n")}
    ${f("Contact person", "contactPerson", c.person)}${f("Phone", "phone", c.phone)}
    ${f("Email", "email", c.email)}${f("Region", "region", c.region)}
    ${f("Login mode", "loginMode", o.loginMode)}${f("TAT days", "tat", o.tatDays, "number")}
    ${f("Processing fee %", "processingFee", o.processingFeePct, "number")}${f("ROI from %", "roi", o.roiFrom, "number")}
    </div>
    <div style="margin-top:10px"><label class="f">Notes</label><textarea data-k="notes" style="font-family:inherit;font-size:14px">${esc(b.notes)}</textarea></div>
    <div class="btns"><button class="btn" id="saveBank">Save</button>
    ${id ? '<button class="btn danger" id="delBank">Delete</button>' : ""}</div>`;
  $("#dlg").showModal();
  $("#saveBank").onclick = () => {
    const o2 = { id: id || "" };
    $$("#dlgBody [data-k]").forEach((el) => { if (el.value !== "") o2[el.dataset.k] = el.value; });
    if (!o2.name) return toast("Bank name is required");
    if (!id) o2.id = slug(o2.name) + "-" + Math.random().toString(36).slice(2, 5);
    Store.upsert(o2);
    $("#dlg").close(); renderAll(); toast("Saved");
  };
  if (id) $("#delBank").onclick = () => {
    if (confirm("Delete " + b.name + "?")) { Store.remove(id); $("#dlg").close(); renderAll(); toast("Deleted"); }
  };
}
$("#btnNewBank").onclick = () => editBank(null);

/* ---------------- manage table ---------------- */
function renderManage() {
  const q = $("#mq").value;
  const rows = search(Store.banks, q).map((r) => r.bank);
  $("#mbody").innerHTML = rows.map((b) => `<tr>
    <td><b>${esc(b.name)}</b><div class="cat" style="font-size:11px;color:var(--dim)">${esc(b.category)}</div></td>
    <td><span class="code">${esc(b.dsaCode || "—")}</span></td>
    <td style="font-size:12px">${esc(b.products.join(", ") || "—")}</td>
    <td>${b.eligibility.minCibil ?? "—"}</td>
    <td>${Object.entries(b.payout).map(([k, v]) => v + "%").slice(0,4).join(" / ") || "—"}</td>
    <td>${b.ops.roiFrom ?? "—"}</td>
    <td>${b.ops.tatDays ?? "—"}</td>
    <td><button class="btn sec" style="padding:4px 10px" data-edit="${esc(b.id)}">Edit</button></td></tr>`).join("")
    || `<tr><td colspan="8" class="empty">Nothing yet — import your list.</td></tr>`;
  $$("#mbody [data-edit]").forEach((b) => b.onclick = () => editBank(b.dataset.edit));
}
$("#mq").addEventListener("input", renderManage);

$("#btnExportJson").onclick = $("#btnExportJson2").onclick = () => {
  download("banks.json", JSON.stringify({ meta: { version: 1, updated: new Date().toISOString().slice(0, 10) }, banks: Store.banks }, null, 2), "application/json");
};
$("#btnExportCsv").onclick = () => download("banks.csv", toCsv(Store.banks), "text/csv");
$("#btnWipe").onclick = () => { if (confirm("Delete ALL banks from this browser?")) { Store.replaceAll([]); renderAll(); } };
$("#btnReseed").onclick = async () => {
  try {
    const doc = await loadPublished(recall() || "");
    Store.replaceAll(doc.banks || doc); renderAll(); toast("Reloaded from published data");
  } catch (e) { toast(e.message); }
};
$("#btnLock").onclick = () => {
  if (!confirm("Lock the app and remove the lender data from this browser?")) return;
  forget(); Store.clearAll(); location.reload();
};

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------------- case form ---------------- */
function fillSelects() {
  const prods = [...new Set([...Store.allProducts(), ...PRODUCTS])].sort();
  $("#c_product").innerHTML = `<option value="">Any</option>` + prods.map((p) => `<option>${esc(p)}</option>`).join("");
  $("#c_profile").innerHTML = `<option value="">Any</option>` + PROFILES.map((p) => `<option>${esc(p)}</option>`).join("");
}

const nv = (id) => { const v = $(id).value; return v === "" ? null : parseFloat(v); };
const bv = (id) => { const v = $(id).value; return v === "" ? null : v === "true"; };

function readCase() {
  return {
    product: $("#c_product").value, profile: $("#c_profile").value,
    cibil: nv("#c_cibil"), age: nv("#c_age"), monthlyIncome: nv("#c_income"),
    existingEmi: nv("#c_emi"), loanAmount: nv("#c_loan"), propertyValue: nv("#c_prop"),
    tenureYears: nv("#c_tenure"), roi: nv("#c_roi"), city: $("#c_city").value.trim(),
    employerCategory: $("#c_empcat").value, businessVintage: nv("#c_vintage"),
    itrAvailable: bv("#c_itr"), bankingOnly: bv("#c_banking")
  };
}

function applyExtract(d) {
  const set = (id, v) => { if (v !== undefined && v !== null && v !== "") $(id).value = v; };
  set("#c_cibil", d.cibil); set("#c_age", d.age); set("#c_income", d.monthlyIncome);
  set("#c_emi", d.existingEmi); set("#c_loan", d.loanAmount); set("#c_prop", d.propertyValue);
  set("#c_city", d.city); set("#c_vintage", d.businessVintage);
  if (d.profile) $("#c_profile").value = d.profile;
  if (d.employerCategory) $("#c_empcat").value = d.employerCategory;
  if (typeof d.itrAvailable === "boolean") $("#c_itr").value = String(d.itrAvailable);
  if (typeof d.bankingOnly === "boolean" && d.bankingOnly) $("#c_banking").value = "true";
  updateCalc();
}

function updateCalc() {
  const c = readCase();
  const foir = computeFoir(c), ltv = computeLtv(c), emi = estimateEmi(c);
  const parts = [];
  if (emi) parts.push(`Estimated EMI ₹${fmt(emi)}`);
  if (foir !== null) parts.push(`FOIR ${foir.toFixed(0)}%`);
  if (ltv !== null) parts.push(`LTV ${ltv.toFixed(0)}%`);
  $("#calcNote").textContent = parts.join("  ·  ");
}
$$("#v-match input, #v-match select").forEach((el) => el.addEventListener("input", updateCalc));

$("#btnResetCase").onclick = () => {
  $$("#v-match input").forEach((i) => { if (i.type !== "file") i.value = ""; });
  $$("#v-match select").forEach((s) => s.value = "");
  $("#c_tenure").value = 20; $("#matchResults").innerHTML = ""; $("#calcNote").textContent = "";
};
$("#btnPrint").onclick = () => window.print();

/* ---------------- matching ---------------- */
$("#btnMatch").onclick = () => {
  const c = readCase();
  if (!Store.banks.length) return toast("Import your bank list first");
  const ranked = rank(Store.banks, c);
  const eligible = ranked.filter((r) => r.verdict !== "Not eligible");
  const top = ranked.slice(0, 40);
  $("#matchResults").innerHTML = `<div class="card"><h3>Recommendation</h3>
      <div>${eligible.length} of ${ranked.length} lenders can take this file. ${
        eligible.length ? `Best fit: <b>${esc(eligible[0].bank.name)}</b> — ${esc(eligible[0].bank.dsaCode || "no code")}.` : "None clear on current rules — consider a deviation or banking-program lender."
      }</div></div>` + top.map((r, i) => resultCard(r, i)).join("");
  $$("#matchResults .result").forEach((el) => el.addEventListener("click", () => openBank(el.dataset.id)));
  $("#matchResults").scrollIntoView({ behavior: "smooth", block: "start" });
};

function resultCard(r, i) {
  const cls = r.verdict === "Strong fit" ? "good" : r.verdict === "Possible with deviation" ? "mid" : "bad";
  const b = r.bank;
  return `<div class="result ${cls}" data-id="${esc(b.id)}">
    <div class="head">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div class="rank">${i + 1}</div>
        <div><b style="font-size:15px">${esc(b.name)}</b>
          <div style="font-size:12px;color:var(--dim);margin-top:2px">
            <span class="code">${esc(r.code || b.dsaCode || "no code")}</span>
            ${b.ops.roiFrom ? " · ROI from " + b.ops.roiFrom + "%" : ""}
            ${b.ops.tatDays ? " · TAT " + b.ops.tatDays + "d" : ""}
            ${r.payout !== null ? " · payout " + r.payout + "%" : (r.offering && r.offering.payoutText ? " · " + esc(r.offering.payoutText) : "")}
            ${r.estPayoutAmount ? " ≈ ₹" + fmt(r.estPayoutAmount) : ""}
          </div></div>
      </div>
      <div style="text-align:right">
        <span class="verdict ${cls}">${r.verdict}</span>
        <div class="score" style="margin-top:6px">${r.score}</div>
      </div>
    </div>
    <div class="bar"><i style="width:${r.score}%"></i></div>
    <div class="reasons">
      ${r.fails.map((x) => `<div class="r-bad">${esc(x)}</div>`).join("")}
      ${r.warns.map((x) => `<div class="r-warn">${esc(x)}</div>`).join("")}
      ${r.plus.slice(0, 3).map((x) => `<div class="r-ok">${esc(x)}</div>`).join("")}
    </div></div>`;
}

/* ---------------- document upload ---------------- */
let docFiles = [];
const drop = $("#drop");
drop.onclick = () => $("#files").click();
["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
$("#files").addEventListener("change", (e) => addFiles(e.target.files));
$("#btnClearFiles").onclick = () => { docFiles = []; renderFiles(); $("#readStatus").textContent = ""; };

function addFiles(list) { docFiles.push(...list); renderFiles(); }
function renderFiles() {
  $("#filelist").innerHTML = docFiles.map((f, i) =>
    `<div class="fileitem"><span>${esc(f.name)}</span><span style="color:var(--dim)">${(f.size / 1024).toFixed(0)} KB</span></div>`).join("");
}

$("#btnRead").onclick = async () => {
  if (!docFiles.length) return toast("Add a document first");
  $("#btnRead").disabled = true;
  $("#readStatus").textContent = "Reading…";
  try {
    let text = "", images = [];
    for (const f of docFiles) {
      const r = await fileToText(f);
      if (r.text) text += `\n--- ${f.name} ---\n${r.text}`;
      if (r.image) images.push(r.image);
    }
    let data;
    if (Store.settings.apiKey) {
      try { data = await aiExtract(Store.settings, { text, images }); }
      catch (err) { data = heuristicExtract(text); data._note = "AI failed (" + err.message + ") — used offline scan"; }
    } else {
      data = heuristicExtract(text);
      if (images.length && !text) data._note = "Image-only upload: add an API key in Settings to read scans.";
    }
    applyExtract(data);
    const found = Object.keys(data).filter((k) => !k.startsWith("_"));
    $("#readStatus").textContent = (data._note ? data._note + " · " : "") +
      (found.length ? `Filled: ${found.join(", ")}` : "Couldn't read anything — fill the form manually.");
  } catch (err) {
    $("#readStatus").textContent = "Error: " + err.message;
  } finally { $("#btnRead").disabled = false; }
};

/* ---------------- importer ---------------- */
let parsedRows = [], mapping = [];
const idrop = $("#idrop");
idrop.onclick = () => $("#ifile").click();
["dragover", "dragenter"].forEach((ev) => idrop.addEventListener(ev, (e) => { e.preventDefault(); idrop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => idrop.addEventListener(ev, () => idrop.classList.remove("over")));
idrop.addEventListener("drop", (e) => { e.preventDefault(); handleImportFile(e.dataTransfer.files[0]); });
$("#ifile").addEventListener("change", (e) => handleImportFile(e.target.files[0]));

async function handleImportFile(file) {
  if (!file) return;
  $("#iStatus").textContent = "Reading " + file.name + "…";
  try {
    if (file.name.toLowerCase().endsWith(".json")) {
      const j = JSON.parse(await file.text());
      Store.merge(j.banks || j);
      renderAll(); $("#iStatus").textContent = `Imported ${(j.banks || j).length} banks.`;
      return;
    }
    const r = await fileToText(file);
    if (!r.text) { $("#iStatus").textContent = "No text found (scanned PDF?). Paste the table manually."; return; }
    parsedRows = file.name.toLowerCase().endsWith(".pdf") ? pdfTextToRows(r.text) : parseDelimited(r.text);
    $("#ipaste").value = r.text.slice(0, 20000);
    showMapping();
  } catch (err) { $("#iStatus").textContent = "Error: " + err.message; }
}

$("#btnParse").onclick = () => {
  const t = $("#ipaste").value;
  if (!t.trim()) return toast("Paste something first");
  parsedRows = parseDelimited(t);
  if (parsedRows.every((r) => r.length < 2)) parsedRows = pdfTextToRows(t);
  showMapping();
};

function showMapping() {
  if (!parsedRows.length) { $("#iStatus").textContent = "Nothing parsed."; return; }
  const cols = Math.max(...parsedRows.slice(0, 50).map((r) => r.length));
  const headers = parsedRows[0];
  mapping = guessMapping(Array.from({ length: cols }, (_, i) => headers[i] || ""));
  $("#iStatus").textContent = `${parsedRows.length} rows × ${cols} columns parsed.`;
  $("#mapCard").style.display = "";
  const sel = (i) => `<select data-col="${i}">` +
    CANON_FIELDS.map((f) => `<option value="${f}" ${mapping[i] === f ? "selected" : ""}>${f || "— ignore —"}</option>`).join("") + "</select>";
  const preview = parsedRows.slice(0, 8);
  $("#mapTable").innerHTML =
    `<thead><tr>${Array.from({ length: cols }, (_, i) => `<th>${sel(i)}</th>`).join("")}</tr></thead>
     <tbody>${preview.map((r) => `<tr>${Array.from({ length: cols }, (_, i) => `<td style="font-size:12px">${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>`;
  $$("#mapTable select").forEach((s) => s.onchange = () => mapping[+s.dataset.col] = s.value);
}

function doImport(replace) {
  if (!mapping.includes("name")) return toast('Map one column to "name" first');
  const banks = rowsToBanks(parsedRows, mapping, $("#hasHeader").checked);
  if (!banks.length) return toast("No rows had a bank name");
  replace ? Store.replaceAll(banks) : Store.merge(banks);
  renderAll();
  $("#mapStatus").textContent = `${banks.length} banks imported. Now Export JSON and commit it to GitHub.`;
  toast(banks.length + " banks imported");
}
$("#btnImportMerge").onclick = () => doImport(false);
$("#btnImportReplace").onclick = () => doImport(true);

/* ---------------- settings ---------------- */
$("#btnSaveSettings").onclick = () => {
  Store.settings.apiKey = $("#s_key").value.trim();
  Store.settings.model = $("#s_model").value.trim() || "gpt-4o-mini";
  Store.settings.endpoint = $("#s_endpoint").value.trim() || "https://api.openai.com/v1/chat/completions";
  Store.saveSettings();
  $("#sStatus").textContent = "Saved to this browser.";
};

/* ---------------- boot ---------------- */
function renderAll() { fillSelects(); renderChips(); renderSearch(); renderManage(); }

/** fetch the published master, decrypting if it is the encrypted bundle */
async function loadPublished(pass) {
  let r = await fetch("data/banks.enc.json?" + Date.now(), { cache: "no-store" });
  if (r.ok) {
    const doc = await r.json();
    if (doc.format === "dsadesk-enc-v1") return await decryptBundle(doc, pass);
    return doc;
  }
  r = await fetch("data/banks.json?" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("No published data found.");
  return await r.json();
}

async function startApp() {
  $("#lock").style.display = "none";
  $("#app").style.display = "";
  await Store.init(null);
  $("#s_key").value = Store.settings.apiKey;
  $("#s_model").value = Store.settings.model;
  $("#s_endpoint").value = Store.settings.endpoint;
  renderAll();
}

async function unlock(pass, silent) {
  const msg = $("#lockMsg");
  if (!silent) msg.textContent = "Unlocking…", msg.style.color = "#8b97a6";
  try {
    const doc = await loadPublished(pass);
    if (!Store.banks.length) Store.loadSeed(doc);
    if ($("#lockRemember").checked) remember(pass);
    await startApp();
    return true;
  } catch (e) {
    if (!silent) { msg.style.color = "#f87171"; msg.textContent = e.message; }
    return false;
  }
}

(async function boot() {
  // is the published data encrypted at all?
  let encrypted = false;
  try {
    const r = await fetch("data/banks.enc.json", { cache: "no-store" });
    encrypted = r.ok && (await r.json()).format === "dsadesk-enc-v1";
  } catch {}

  await Store.init(null);   // any data already unlocked in this browser

  if (!encrypted) {
    if (!Store.banks.length) {
      try { Store.loadSeed(await loadPublished("")); } catch {}
    }
    return startApp();
  }
  if (Store.banks.length) return startApp();          // already unlocked before
  const saved = recall();
  if (saved && await unlock(saved, true)) return;     // same tab, still unlocked

  $("#lock").style.display = "grid";
  $("#lockPass").focus();
  $("#lockGo").onclick = () => unlock($("#lockPass").value, false);
  $("#lockPass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") unlock($("#lockPass").value, false);
  });
})();

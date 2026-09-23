#!/usr/bin/env python3
"""Extract the MYSP 'Payout Sept 2026' PDF into dsa-desk/data/banks.json.

The PDF holds two kinds of tables:
  A) ROSTER tables  — Sr No | Bank | DSA Code | payout col(s) | entity
  B) GRID tables    — one bank's rate/payout slab grid, bank + code in a banner row
Both are handled; grids collapse to a payout range plus the slab rows kept as detail.
"""
import pdfplumber, json, re
from collections import OrderedDict

SRC = "uploads/Payout Sept 2026 (1).pdf"
OUT = "dsa-desk/data/banks.json"

CLEAN = lambda s: re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()

# ---------------------------------------------------------------- sections
SECTION_KEYS = [
    ("Government Banks",                     "PSU Bank",     ["Home Loan / BT", "LAP / LRD"]),
    ("Private Banks",                        "Private Bank", ["Home Loan / BT", "LAP / LRD"]),
    ("Affordable/Prime/LAP",                 "NBFC / HFC",   ["Home Loan / BT", "LAP / LRD"]),
    ("Affordable & Grampanchyat",            "NBFC / HFC",   ["Home Loan / BT", "LAP / LRD"]),
    ("New Car Loan Payout Structure",        "",             ["New Car Loan"]),
    ("Used Car Loan Payout Structure",       "",             ["Used Car Loan"]),
    ("Commerical Vehicle Loan",              "",             ["Commercial Vehicle / CE"]),
    ("Machinery Loan Payout structure",      "",             ["Machinery Loan"]),
    ("Gold Loan",                            "",             ["Gold Loan"]),
    ("CASA Account Payout Structure",        "",             ["CASA Account"]),
    ("Fixed Deposit Payout Structure",       "",             ["Fixed Deposit"]),
    ("Education Loan",                       "",             ["Education Loan"]),
    ("School Funding",                       "",             ["School Funding"]),
    ("Personal Loan",                        "",             ["Personal Loan"]),
    ("Business Loan",                        "",             ["Business Loan"]),
    ("MSME Bank",                            "",             ["MSME Loan"]),
    ("Credit Card Payout Structure",         "",             ["Credit Card"]),
]

INVOICE_RX = re.compile(r"(of\s+(the\s+)?invoice|on\s+receivable|invoice\s+value)", re.I)
NOPAY_RX   = re.compile(r"^\s*(n/?a|na|-|nil|)\s*$", re.I)

def parse_payout(txt):
    """-> (numeric pct or None, display text). Invoice-share deals stay textual."""
    t = CLEAN(txt)
    if NOPAY_RX.match(t):
        return None, ""
    if INVOICE_RX.search(t):
        return None, t
    if re.search(r"(disbursement|min\s*\d+%\s*&|as per the|casewise|per annum|"
                 r"as per slab|insurance)", t, re.I):
        pc = re.findall(r"(\d+(?:\.\d+)?)\s*%", t)
        if re.search(r"(disbursement|as per the|casewise|as per slab)", t, re.I):
            return None, t
    pcts = re.findall(r"(\d+(?:\.\d+)?)\s*%", t)
    if pcts:
        if re.search(r"\+\s*insurance", t, re.I):
            return float(pcts[0]), t
        return max(float(p) for p in pcts), t
    if re.fullmatch(r"0\.\d+", t):
        return round(float(t) * 100, 3), t
    if re.match(r"^Rs\.?\s*[\d,]+", t, re.I):
        return None, t
    return None, t

# ---------------------------------------------------------------- names
ACRONYMS = {"CSB","DCB","AU","HDFC","ICICI","SBI","IDBI","IDFC","AU","UCO","PNB","UBI","SVC","RBL","LIC","HFL",
            "HFC","NBFC","IIFL","GIC","HDB","MSME","OD","BT","HL","LAP","CV","CE","SENP","BL",
            "SMFG","UGRO","AG","EV","CASA","LRD","TL","MBL","SBL","STUL","L&T","PCSL","AFI",
            "NIP","FTU","FTB","JCB","SCV","LCV","HCV","ICV","MLCV","ALDD","ALPA","APL","STP",
            "NTC","CMR","MLB","HFCL","LTD","PVT","CO","OP","HOU","AFL","KIA","MUV","SUV"}

FIXUP = {
    "BHAGINI NEVEDITA BANK": "Bhagini Nivedita Bank",
    "CHOLAMANDLAM": "Cholamandalam", "CHOLAMANDALA": "Cholamandalam",
    "CHOLAM ANDALA M INV & FIN CO LTD": "Cholamandalam Inv & Fin Co Ltd",
    "CHOLAM ANDALA": "Cholamandalam",
    "POONA WALA FINCORP": "Poonawalla Fincorp",
    "POONAWALA FINCORP": "Poonawalla Fincorp",
    "IDFC FRIST BANK": "IDFC First Bank",
    "LNT FINNANCE": "L&T Finance",
    "FULLOTRON": "Fullerton",
    "Bandan Bank Ltd": "Bandhan Bank Ltd",
    "NIDDO HOUSING FINANCE": "Niddo Housing Finance",
}

def title(n):
    n = CLEAN(n)
    for k, v in FIXUP.items():
        if n.upper() == k.upper():
            return v
    out = []
    for w in n.split(" "):
        core = re.sub(r"[^A-Za-z&]", "", w)
        if not core:
            out.append(w)
        elif core.upper() in ACRONYMS:
            out.append(w.upper())
        elif w.isupper():
            out.append(w.capitalize())
        else:
            out.append(w)
    return re.sub(r"\s+", " ", " ".join(out)).strip()

VARIANT_RX = re.compile(r"^(.*?)\s*[\(\[]\s*(.+?)\s*[\)\]]\s*$")
def split_variant(name):
    """'Bajaj Finance Ltd ( Prime )' -> ('Bajaj Finance Ltd', 'Prime')"""
    n = CLEAN(name)
    if n.count("(") > n.count(")"):
        i = n.rfind("(")
        base, var = n[:i].strip(" -–"), n[i+1:].strip(" .)")
        if len(base) >= 3:
            return base, var
    m = VARIANT_RX.match(n)
    if not m:
        return n, ""
    base, var = m.group(1).strip(" -–"), m.group(2).strip(" .")
    if not base or len(base) < 3:
        return n, ""
    # geography qualifiers belong to the bank identity, not the product
    if re.fullmatch(r"(only\s+)?(mumbai|maharashtra|pune|all\s+india|only\s+mh\s*&\s*goa|"
                    r"pune and rest of maharashtra|only\s*\w+\s*zone)", var, re.I):
        return base, ""
    return base, var

TRAIL_RX = re.compile(r"\s*[-–]\s*(TL|OD|BL|LAP|Prof\.?|Professional|Top\s*Up|Prime|Flexi)\s*$", re.I)

ALIASES = {
    "KOTAK":"KOTAKMAHINDRABANK", "KOTAKBANK":"KOTAKMAHINDRABANK",
    "CHOLA":"CHOLAMANDALAM", "CHOLAMANDALAMINV&FIN":"CHOLAMANDALAM",
    "CHOLAMANDALAMINV&FINCO":"CHOLAMANDALAM",
    "INDUSIND":"INDUSINDBANK", "INDUSINDINSTANT":"INDUSINDBANK",
    "PIRAMAL":"PIRAMALCAPITAL&HOUSING", "PIRAMALCAPITAL&HOUSINGFINANCE":"PIRAMALCAPITAL&HOUSING",
    "PIRAMALHOUSING":"PIRAMALCAPITAL&HOUSING",
    "ADITYABIRLA":"ADITYABIRLACAPITAL", "ADITYABIRLAOD":"ADITYABIRLACAPITAL",
    "ADITYABIRLAFINANCE":"ADITYABIRLACAPITAL", "ADITYABIRLAHOUSING":"ADITYABIRLACAPITAL",
    "IDFCCAPITAL":"IDFCFIRSTBANK", "IDFCBANK":"IDFCFIRSTBANK",
    "IDFCFIRSTBANKINTERNATIONAL":"IDFCFIRSTBANK", "IDFCFRISTBANK":"IDFCFIRSTBANK",
    "POONAWALLA":"POONAWALLAFINCORP", "POONAWALA":"POONAWALLAFINCORP",
    "INCREDFINANCE":"INCRED", "EARLYSALARY":"EARLYSALARYFIBE",
    "GODREJCAPITAL":"GODREJFINANCE", "GODREJHOUSING":"GODREJFINANCE",
    "AXISFINANCE":"AXISFINANCE", "AXIS":"AXISBANK",
    "CREDITSAISON":"CREDITSAISON", "GROWTHSOURCE":"GROWTHSOURCEPROTIUM",
    "TATACAPITAL":"TATACAPITAL", "TYGERCAPITAL":"TYGER", "TYGERHOUSING":"TYGER",
    "BAJAJFINANCE":"BAJAJFINANCE", "BAJAJFINANCEGROWTH":"BAJAJFINANCE",
    "BAJAJFINNSERV":"BAJAJFINANCE", "BAJAJHOUSINGFINANCE":"BAJAJHOUSINGFINANCE",
    "L&TFINANCE":"L&TFINANCE", "LNTFINNANCE":"L&TFINANCE",
    "SHRIRAMFINANCE":"SHRIRAMFINANCE", "SHRIRAM":"SHRIRAMFINANCE",
    "UBISERVICES":"UNIONBANKOFUBISERVICES",
    "SVCCOOPERATIVEBANK":"SVCBANK", "SARASWATBANK":"SARASWATBANK",
    "HDFCBANKFIXEDDEPOSITS":"HDFCBANK", "HDFCCREDILA":"HDFCCREDILA",
    "NIDDOHOUSINGFINANCESTHL":"NIDDOHOUSINGFINANCE",
    "CENTBANKHOMEFINANCE":"CENTBANKHOMEFINANCE",
    "COSMOSCOOPBANK":"COSMOSBANK", "COSMOSCOOPERATIVEBANK":"COSMOSBANK",
    "FULLOTRON":"FULLERTON",
    "CLIX":"CLIXCAPITAL", "CLIXCAPITALTOPUP":"CLIXCAPITAL",
    "COSMOSCOOPBANK":"COSMOSBANK", "COSMOSCOOP":"COSMOSBANK",
    "DEUTSCHEBANKAG":"DEUTSCHEBANK",
    "AUXILOFINSERVEPRIVATE":"AUXILO", "AUXILOFINSERVE":"AUXILO",
    "AVANSEFINANCIALSERVICES":"AVANSE",
    "CHOLAMANDLAMHOMELOAN":"CHOLAMANDALAM", "CHOLAMANDLAMLAP":"CHOLAMANDALAM",
    "CHOLAMANDLAM":"CHOLAMANDALAM", "CHOLAMANDLAMHOME":"CHOLAMANDALAM",
    "CHOLAMANDALAMHOMELOAN":"CHOLAMANDALAM", "CHOLAMANDALAMLAP":"CHOLAMANDALAM",
    "GODREJHOUSINGFINANCE":"GODREJFINANCE",
    "SUNDARAMHOU":"SUNDARAMFINANCE", "SHRIRAMHOU":"SHRIRAMFINANCE",
    "STARH":"STARHOUSINGFINANCE", "WESTENDHOU":"WESTENDHOUSINGFINANCE",
    "MAHINDRAHOME":"MAHINDRAHOMEFINANCE",
    "UTKARSHSMALLFINACE":"UTKARSHSMALLFINANCE",
    "AUSMALLBANK":"AUSMALLFINANCEBANK", "AUSMALLFINANCE":"AUSMALLFINANCEBANK",
    "ICICIHFC":"ICICIHFC", "PNBHFL":"PNBHFL",
    "PNBCARDANDSERVICES":"PNBCARD&SERVICES", "PNBCARD&SERVICES":"PNBCARD&SERVICES",
    "SAMMAANCAPITAL":"SAMMAANCAPITAL", "MOTILALOSWAL":"MOTILALOSWAL",
}

def canon(name):
    """Merge key — strips legal suffixes so 'HDFC Bank' == 'HDFC BANK LTD'."""
    n = name.upper()
    n = re.sub(r"\([^)]*\)", " ", n)
    n = re.sub(r"\b(HFL|HFC|HOU|HOUSING FINANCE|FIN SERVICES|FINANCIAL SERVICES)\b", " ", n)
    n = re.sub(r"[^A-Z0-9& ]", " ", n)
    n = re.sub(r"\b(LTD|LIMITED|PVT|PRIVATE|CO|COMPANY|INDIA|THE)\b", " ", n)
    for a, b in [("CHOLAMANDLAM","CHOLAMANDALAM"),("CHOLAMANDALA","CHOLAMANDALAM"),
                 ("POONAWALA","POONAWALLA"),("NEVEDITA","NIVEDITA"),("FRIST","FIRST"),
                 ("LNT","L&T"),("BANDAN","BANDHAN"),("FINNANCE","FINANCE")]:
        n = n.replace(a, b)
    n = re.sub(r"\s+", "", n)
    for _ in range(3):
        m = ALIASES.get(n)
        if not m or m == n:
            break
        n = m
    n = re.sub(r"(M)\1+$", r"\1", n)   # 'CHOLAMANDALAMM' -> 'CHOLAMANDALAM'
    return ALIASES.get(n, n)

# ---------------------------------------------------------------- grid banners
BANNER_RXS = [
    re.compile(r"BANK\s*NAME\s*[-:]?\s*(.+?)\s*DSA\s*CODE\s*[-:]?\s*([A-Za-z0-9/\-]+)", re.I),
    re.compile(r"DSA\s*CODE\s*[-:]?\s*([A-Za-z0-9/\-]+)\s*[-–]\s*(.+?)(?:\s*[-–]\s*DSA\s*NAME.*)?$", re.I),
    re.compile(r"^(.+?)\s*[-–]\s*(?:NEW|USED)\s*CAR\s*LOAN\s*[-–]\s*([A-Za-z0-9]+)", re.I),
    re.compile(r"DSA\s*CODE\s*[-:]?\s*([A-Za-z0-9]+)\s*DSA\s*CODE\s*NAME", re.I),
]

def read_banner(txt):
    """-> (bank name or None, dsa code or None)"""
    t = CLEAN(txt)
    if "DSA CODE" not in t.upper() and "BANK NAME" not in t.upper():
        return None, None
    m = BANNER_RXS[0].search(t)
    if m:
        return m.group(1), m.group(2)
    m = BANNER_RXS[2].search(t)
    if m:
        return m.group(1), m.group(2)
    m = BANNER_RXS[1].search(t)
    if m:
        code, name = m.group(1), m.group(2)
        name = re.sub(r"\(.*?\)", "", name).strip(" -–")
        name = re.sub(r"DSA\s*NAME.*$", "", name, flags=re.I).strip(" -–")
        if name and not re.fullmatch(r"[\d\s]+", name):
            return name, code
    m = re.search(r"\(\s*DSA\s*([A-Za-z0-9]+)\s*\)", t)
    if m:
        nm = BANNER_RXS[0].sub("", t)
        return None, m.group(1)
    return None, None

# ---------------------------------------------------------------- main
def run():
    pdf = pdfplumber.open(SRC)
    offerings = []

    # ordered stream of (page, top, kind, payload)
    events = []
    for pno, page in enumerate(pdf.pages, 1):
        words = page.extract_words() or []
        lines = {}
        for w in words:
            lines.setdefault(round(w["top"] / 3), []).append(w)
        for k, ws in lines.items():
            ws.sort(key=lambda w: w["x0"])
            txt = " ".join(w["text"] for w in ws)
            for key, cat, prods in SECTION_KEYS:
                if key.lower() in txt.lower():
                    events.append((pno, ws[0]["top"], "sec", (key, cat, prods)))
        for tf in page.find_tables():
            events.append((pno, tf.bbox[1], "tbl", tf.extract()))
    events.sort(key=lambda e: (e[0], e[1]))

    section, cat, prods = "Government Banks", "PSU Bank", ["Home Loan / BT", "LAP / LRD"]
    grid_bank, grid_code = None, None
    last_layout = None

    for pno, top, kind, payload in events:
        if kind == "sec":
            section, cat, prods = payload
            grid_bank, grid_code = None, None
            continue

        rows = [r for r in payload if r and any(CLEAN(x) for x in r)]
        if not rows:
            continue

        # a table may carry its own section title in the first cell
        head0 = CLEAN(rows[0][0]) if rows[0] else ""
        if head0 and all(not CLEAN(x) for x in rows[0][1:]):
            for key, c, pr in SECTION_KEYS:
                if key.lower() in head0.lower():
                    section, cat, prods = key, c, pr
                    grid_bank = grid_code = None
                    rows = rows[1:]
                    break
            if not rows:
                continue

        # ---- banner? (grid table for a single bank)
        banner_name, banner_code = None, None
        for r in rows[:2]:
            first = CLEAN(r[0])
            rest_empty = all(not CLEAN(x) for x in r[1:])
            if first and (rest_empty or len(r) == 1):
                bn, bc = read_banner(first)
                if bn or bc:
                    banner_name, banner_code = bn, bc
                    break
        if banner_name or banner_code:
            if banner_name and re.search(r"[A-Za-z]{3}", banner_name) and \
               not re.search(r"(lac|lakh|applicable|purchase|refinance|profile|segment|cibil)",
                             banner_name, re.I):
                grid_bank = title(banner_name)
            grid_code = banner_code or grid_code

        # ---- locate header row (must be a real multi-column header, not a banner)
        hdr_i, hdr = None, []
        for i, r in enumerate(rows[:4]):
            cells = [CLEAN(x) for x in r]
            filled = [c for c in cells if c]
            if len(filled) < 3:
                continue
            joined = " ".join(cells).lower()
            if re.search(r"\bdsa\s*code\s*[-:]", joined):   # banner, not header
                continue
            name_col = any(re.search(r"^(bank|bank/hfc|bank name|bank / nbfc|product)\b", CLEAN(x).lower())
                           for x in cells)
            pay_col = any(("payout" in CLEAN(x).lower() or "only for" in CLEAN(x).lower()
                           or "rest of" in CLEAN(x).lower()) for x in cells)
            if name_col and pay_col:
                hdr_i, hdr = i, [CLEAN(x).lower() for x in r]
                break

        is_roster = hdr_i is not None and any("bank" in h or "product" in h for h in hdr)
        if not is_roster and last_layout and not (banner_name or banner_code):
            ncols = max(len(r) for r in rows)
            if last_layout["ncols"] == ncols and last_layout["section"] == section:
                hdr_i, hdr = -1, last_layout["hdr"]
                is_roster = True

        # ================= ROSTER =================
        if is_roster:
            grid_bank = grid_code = None

            def col(*keys):
                for i, h in enumerate(hdr):
                    if any(k in h for k in keys):
                        return i
                return None

            c_name = col("bank/hfc", "bank name", "bank / nbfc", "bank", "product")
            c_code = col("dsa code", "code")
            if c_code == c_name:
                c_code = None
            c_ent = None
            for i, h in enumerate(hdr):
                if "name in" in h or "dsa code name" in h:
                    c_ent = i
            if c_ent is None and len(hdr) >= 4 and "dsa code" in hdr[-1] and hdr[-1] != hdr[c_code or -1]:
                c_ent = len(hdr) - 1
            if c_ent is None and len(hdr) >= 5:
                c_ent = len(hdr) - 1

            pay_cols = [i for i, h in enumerate(hdr)
                        if ("payout" in h or "only for" in h or "rest of" in h)
                        and i != c_ent and i != c_code]
            if not pay_cols:
                lo = (c_code if c_code is not None else c_name) + 1
                hi = c_ent if c_ent is not None else len(hdr)
                pay_cols = [i for i in range(lo, hi)]

            last_layout = dict(ncols=max(len(r) for r in rows), hdr=hdr, section=section)
            last_name = None
            for r in rows[hdr_i + 1:]:
                cells = [CLEAN(x) for x in r]
                nm = cells[c_name] if c_name is not None and c_name < len(cells) else ""
                if re.fullmatch(r"\d+", nm):
                    nm = ""
                if not nm:
                    nm = last_name or ""
                if not nm or nm.lower() in ("sr no", "bank name", "bank/hfc", "product"):
                    continue
                if not re.search(r"[A-Za-z]{3}", nm):
                    continue
                if re.match(r"^(upto|above|below|<|>|=|\d)", nm.strip(), re.I) and \
                   re.search(r"(lac|lakh|cr|crore|month|%)", nm, re.I):
                    continue
                last_name = nm
                code = cells[c_code] if c_code is not None and c_code < len(cells) else ""
                ent  = cells[c_ent]  if c_ent  is not None and c_ent  < len(cells) else ""
                for j, pc in enumerate(pay_cols):
                    if pc >= len(cells):
                        continue
                    val, disp = parse_payout(cells[pc])
                    if not disp:
                        continue
                    if val is not None and val > 5:
                        val = None
                    if section in ("Personal Loan", "Business Loan"):
                        prod = section
                        if j > 0:
                            continue
                    else:
                        prod = prods[j] if j < len(prods) else prods[-1]
                    code_clean = re.sub(r"\s*[\(\[].*?[\)\]]\s*", " ", code).strip()
                    rejected = bool(re.search(
                        r"(enterprises|financial services|pvt|apnarupee|\bltd\b)", code_clean, re.I))
                    if "%" in code_clean or len(code_clean) > 26:
                        m_ = re.match(r"([A-Za-z0-9/\-]{3,20}?)(?=\d{4,}\.?\d*%)", code_clean)
                        code_clean = m_.group(1) if m_ else ""
                    if rejected or not re.search(r"[A-Za-z0-9]{3}", code_clean):
                        code_clean, rejected = "", True
                    final_code = "" if rejected else (code_clean or code)
                    offerings.append(dict(bank=nm, product=prod, dsaCode=final_code, payout=val,
                                          payoutText=disp, entity=ent, category=cat,
                                          section=section, page=pno, slab=""))
            continue

        # ================= GRID =================
        last_layout = None
        if not grid_bank and not grid_code:
            continue
        # find which columns are payout columns from any header-ish row
        pay_idx = set()
        for r in rows[:6]:
            for i, cx in enumerate(r):
                if "payout" in CLEAN(cx).lower():
                    pay_idx.add(i)
        pays, slabs = [], []
        for r in rows:
            cells = [CLEAN(x) for x in r]
            line_pays = []
            for i, cx in enumerate(cells):
                if pay_idx and i not in pay_idx:
                    continue
                v, d = parse_payout(cx)
                if v is not None and 0 < v <= 5 and "%" in d:
                    line_pays.append(v)
            if not line_pays:
                continue
            label = next((c for c in cells if c and not re.fullmatch(r"[\d.,%\s/-]*", c)), "")
            rates = [c for c in cells if re.fullmatch(r"\d{1,2}(\.\d+)?%?", c)]
            pays += line_pays
            slabs.append(dict(label=label[:70], rate=rates[0] if rates else "",
                              payout=max(line_pays)))
        if not pays:
            continue
        lo, hi = min(pays), max(pays)
        nm = grid_bank or f"Lender {grid_code}"
        offerings.append(dict(
            bank=nm, product=prods[0], dsaCode=grid_code or "", payout=hi,
            payoutText=(f"{lo}%" if lo == hi else f"{lo}% – {hi}% (slab-based)"),
            entity="", category=cat, section=section, page=pno,
            slab=json.dumps(slabs[:40])))

    # ---------------- merge into bank records ----------------
    banks = OrderedDict()
    for o in offerings:
        raw = TRAIL_RX.sub("", CLEAN(o["bank"]))
        base, variant = split_variant(raw)
        nm = title(base)
        if variant:
            o = dict(o, product=f"{o['product']} — {title(variant)}", variant=title(variant))
        key = canon(nm)
        if not key:
            continue
        b = banks.setdefault(key, dict(name=nm, category=o["category"],
                                       offerings=[], entities=set(), codes=OrderedDict()))
        if len(nm) < len(b["name"]):
            b["name"] = nm
        if not b["category"] and o["category"]:
            b["category"] = o["category"]
        b["offerings"].append(o)
        if o["entity"]:
            b["entities"].add(CLEAN(o["entity"]))
        if o["dsaCode"]:
            b["codes"][o["dsaCode"]] = b["codes"].get(o["dsaCode"], 0) + 1

    def guess_cat(name, cat):
        if cat:
            return cat
        n = name.lower()
        if "bank" in n:
            return "Bank"
        if any(k in n for k in ("finance","fincorp","capital","hfc","hfl","housing","fin","credila")):
            return "NBFC / HFC"
        return "Lender"

    PREFERRED = {
        "KOTAKMAHINDRABANK":"Kotak Mahindra Bank", "CHOLAMANDALAM":"Cholamandalam",
        "ADITYABIRLACAPITAL":"Aditya Birla Capital", "POONAWALLAFINCORP":"Poonawalla Fincorp",
        "IDFCFIRSTBANK":"IDFC First Bank", "AXISBANK":"Axis Bank",
        "AXISFINANCE":"Axis Finance", "INDUSINDBANK":"IndusInd Bank",
        "PIRAMALCAPITAL&HOUSING":"Piramal Capital & Housing Finance",
        "GODREJFINANCE":"Godrej Finance", "BAJAJFINANCE":"Bajaj Finance",
        "BAJAJHOUSINGFINANCE":"Bajaj Housing Finance", "L&TFINANCE":"L&T Finance",
        "TATACAPITAL":"Tata Capital", "SHRIRAMFINANCE":"Shriram Finance",
        "GROWTHSOURCEPROTIUM":"Growth Source (Protium)", "EARLYSALARYFIBE":"Early Salary (Fibe)",
        "TYGER":"Tyger Capital", "SVCBANK":"SVC Bank", "COSMOSBANK":"Cosmos Bank",
        "HDFCBANK":"HDFC Bank", "ICICIBANK":"ICICI Bank", "FULLERTON":"Fullerton",
        "UNIONBANKOFUBISERVICES":"Union Bank of India / UBI Services",
        "STATEBANKOF":"State Bank of India", "CREDITSAISON":"Credit Saison",
        "INCRED":"InCred", "NIDDOHOUSINGFINANCE":"Niddo Housing Finance",
    }
    out = []
    for key, b in banks.items():
        seen, uniq = set(), []
        for o in b["offerings"]:
            sig = (o["product"], o["dsaCode"], o["payoutText"])
            if sig in seen:
                continue
            seen.add(sig)
            slabs = json.loads(o["slab"]) if o["slab"] else []
            uniq.append(dict(product=o["product"], dsaCode=o["dsaCode"], payout=o["payout"],
                             payoutText=o["payoutText"], entity=o["entity"],
                             section=o["section"], page=o["page"], slabs=slabs))
        base = lambda pr: pr.split(" — ")[0]
        products = sorted({base(o["product"]) for o in uniq})
        payout = {}
        for o in uniq:
            if o["payout"] is not None:
                k = base(o["product"])
                payout[k] = max(payout.get(k, 0), o["payout"])
        for o in uniq:
            o["variant"] = o["product"].split(" — ")[1] if " — " in o["product"] else ""
            o["baseProduct"] = base(o["product"])
        codes = list(b["codes"].keys())
        primary = max(codes, key=lambda c: b["codes"][c]) if codes else ""
        others = [c for c in codes if c != primary]
        textual = sorted({o["payoutText"] for o in uniq if o["payout"] is None and o["payoutText"]})
        disp = PREFERRED.get(key.upper(), b["name"])
        disp = re.sub(r"\s*[\(\[][^\)\]]*$", "", disp).strip(" -–,")
        out.append(dict(
            id=key.lower()[:48] or f"b{len(out)}",
            name=disp or b["name"],
            category=guess_cat(b["name"], b["category"]),
            products=products,
            dsaCode=primary,
            channelCode=", ".join(others)[:240],
            payout=payout,
            offerings=uniq,
            eligibility=dict(minCibil=None, minAgeYears=None, maxAgeYears=None,
                             minMonthlyIncome=None, minLoanAmount=None, maxLoanAmount=None,
                             maxFoirPct=None, maxLtvPct=None, profiles=[], employerCategory=[],
                             minVintageYears=None, acceptsItrOnly=None,
                             acceptsBankingProgram=None, cities=[]),
            contact=dict(person="", phone="", email="",
                         region=", ".join(sorted(b["entities"]))[:140]),
            ops=dict(loginMode="", tatDays=None, processingFeePct=None, roiFrom=None),
            notes="; ".join(textual)[:500],
        ))

    out.sort(key=lambda x: x["name"].lower())
    doc = dict(meta=dict(version=2, owner="Noamaan Consultancy",
                         source="Payout Sept 2026.pdf", effectiveFrom="2026-07-01",
                         updated="2026-09-23", banks=len(out),
                         note=("Auto-extracted from the MYSP payout structure PDF. "
                               "Payout and DSA codes are from the document; eligibility "
                               "fields are blank by design — fill them in Manage Banks "
                               "to sharpen the matcher.")),
               banks=out)
    json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)

    print(f"{len(offerings)} offerings -> {len(out)} banks")
    pc = {}
    for o in offerings:
        pc[o["product"]] = pc.get(o["product"], 0) + 1
    for k, v in sorted(pc.items(), key=lambda x: -x[1]):
        print(f"  {v:4d}  {k}")
    nocode = [b["name"] for b in out if not b["dsaCode"]]
    print(f"\nno DSA code ({len(nocode)}): {', '.join(nocode[:25])}")

if __name__ == "__main__":
    run()

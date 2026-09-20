#!/usr/bin/env python3
"""No. 10 Report Card — data pipeline (United Kingdom).

Fetches every automated figure from its official publisher, checks it, and writes:
  site/src/data/metrics.json   everything the website displays
  site/src/data/checks.json    the audit log for this run

Sources
  ONS        www.ons.gov.uk time series (JSON)          inflation, wages, jobs, GDP, productivity, public finances
  Bank of England  IADB CSV                              Bank Rate, mortgage rates
  Home Office  small boats time series (ODS)             small boat arrivals
  Home Office  immigration system statistics (XLSX)       asylum accommodation, returns and removals
  manual.json  hand-read figures that have no feed       Plan for Change milestones, net migration

Run: python3 pipeline/update.py
"""
import csv, datetime as dt, io, json, os, re, ssl, sys, urllib.error, urllib.request, zipfile
from xml.etree import ElementTree as ET


def _ssl_context():
    """Some Python builds (notably macOS) ship without a CA bundle; fall back to the system one."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    for path in ("/etc/ssl/cert.pem", "/usr/local/etc/openssl/cert.pem", "/etc/pki/tls/certs/ca-bundle.crt"):
        if os.path.exists(path):
            return ssl.create_default_context(cafile=path)
    return ssl.create_default_context()


SSL = _ssl_context()

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "site", "src", "data")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"}

ELECTION = "2024-07-04"       # general election: the government's mandate starts here
BASE_M = "2024-06-30"         # last full month before the election
BASE_Q = "2024-06-30"         # last full quarter before the election
NOW = dt.datetime.now(dt.timezone.utc)

CHECKS = []
SOURCES = {}


def log(metric, check, status, detail, critical=False):
    CHECKS.append({"metric": metric, "check": check, "status": status, "detail": detail, "critical": critical})
    print(f"  [{status:4}] {metric}: {check}: {detail}")


def get(url, key=None, binary=False):
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60, context=SSL) as r:
                raw = r.read()
            if key:
                SOURCES[key] = NOW.isoformat(timespec="seconds")
            return raw if binary else raw.decode("utf-8-sig", errors="replace")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 2:
                raise RuntimeError(f"could not fetch {url}: {e}")


# --------------------------------------------------------------------------- dates
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def month_end(y, m):
    return dt.date(y + (m == 12), 1 if m == 12 else m + 1, 1) - dt.timedelta(days=1)


def ons_date(label):
    """'2026 AUG' -> 2026-08-31, '2026 Q2' -> 2026-06-30, '2025' -> 2025-12-31."""
    s = label.strip().upper()
    if m := re.fullmatch(r"(\d{4})\s+([A-Z]{3})", s):
        return month_end(int(m.group(1)), MONTHS.index(m.group(2)) + 1).isoformat()
    if m := re.fullmatch(r"(\d{4})\s*Q(\d)", s):
        return month_end(int(m.group(1)), int(m.group(2)) * 3).isoformat()
    if re.fullmatch(r"\d{4}", s):
        return f"{s}-12-31"
    raise ValueError(f"unrecognised ONS period: {label!r}")


def fy_label(iso):
    d = dt.date.fromisoformat(iso)
    y = d.year if d.month > 3 else d.year - 1
    return f"{y}–{str(y + 1)[2:]}"


def period_label(iso, freq):
    d = dt.date.fromisoformat(iso)
    if freq == "q":
        return f"{['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][(d.month - 1) // 3]} {d.year}"
    if freq == "fy":
        return fy_label(iso)
    if freq == "y":
        return str(d.year)
    return f"{MONTHS[d.month - 1].title()} {d.year}"


# --------------------------------------------------------------------------- fetching
def ons(series, dataset, path, key=None, freq="months"):
    """One ONS time series as [[iso, value], …]. freq: months | quarters | years."""
    url = f"https://www.ons.gov.uk/{path}/timeseries/{series.lower()}/{dataset.lower()}/data"
    d = json.loads(get(url, key or f"ons_{series.lower()}"))
    rows = d.get(freq) or []
    if not rows:
        raise RuntimeError(f"ONS {series}/{dataset}: no {freq}")
    out = []
    for r in rows:
        v = r.get("value", "")
        if v not in ("", None, ".."):
            out.append([ons_date(r["date"]), float(v)])
    return sorted(out), d["description"]


def boe(code, key=None, start="01/Jan/2010"):
    url = ("https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes"
           f"&Datefrom={start}&Dateto=now&SeriesCodes={code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N")
    rows = list(csv.reader(io.StringIO(get(url, key or f"boe_{code.lower()}"))))
    out = []
    for r in rows[1:]:
        if len(r) >= 2 and r[1].strip():
            d = dt.datetime.strptime(r[0].strip(), "%d %b %Y").date()
            out.append([d.isoformat(), float(r[1])])
    if not out:
        raise RuntimeError(f"Bank of England {code}: no rows")
    return sorted(out)


def small_boats():
    """Daily Home Office small-boat arrivals, summed by calendar month."""
    page = get("https://www.gov.uk/government/publications/migrants-detected-crossing-the-english-channel-in-small-boats", "home_office_small_boats")
    m = re.search(r'https://assets\.publishing\.service\.gov\.uk/media/[^"]+?time[_ ]series\.ods', page, re.I)
    if not m:
        raise RuntimeError("could not find the small boats ODS link on gov.uk")
    ods = get(m.group(0), binary=True)
    ns = {"t": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
          "x": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
          "o": "urn:oasis:names:tc:opendocument:xmlns:office:1.0"}
    root = ET.fromstring(zipfile.ZipFile(io.BytesIO(ods)).read("content.xml"))
    daily = {}
    for table in root.iter(f"{{{ns['t']}}}table"):
        if table.get(f"{{{ns['t']}}}name") != "SB_01":
            continue
        for row in table.iter(f"{{{ns['t']}}}table-row"):
            cells = []
            for c in row.iter(f"{{{ns['t']}}}table-cell"):
                rep = min(int(c.get(f"{{{ns['t']}}}number-columns-repeated", 1) or 1), 3)
                val = c.get(f"{{{ns['o']}}}value")
                if val is None:
                    val = "".join(p.text or "" for p in c.iter(f"{{{ns['x']}}}p"))
                cells.extend([val] * rep)
            if len(cells) >= 2 and re.fullmatch(r"\d{2}/\d{2}/\d{4}", str(cells[0]).strip()):
                try:
                    daily[dt.datetime.strptime(cells[0].strip(), "%d/%m/%Y").date()] = int(float(cells[1]))
                except ValueError:
                    pass
    if not daily:
        raise RuntimeError("small boats: no daily rows parsed")
    last = max(daily)
    by_month = {}
    for day, n in daily.items():
        if (day.year, day.month) == (last.year, last.month):
            continue                                    # drop the part-month so no bar is misleadingly short
        by_month[month_end(day.year, day.month).isoformat()] = by_month.get(month_end(day.year, day.month).isoformat(), 0) + n
    return sorted(by_month.items()), last, m.group(0)


XL = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
XL_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def xlsx_rows(blob, sheet_name):
    """Read one sheet of an .xlsx as lists of strings. Stdlib only, so the pipeline keeps no dependencies."""
    z = zipfile.ZipFile(io.BytesIO(blob))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{XL}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{XL}t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = {s.get("name"): rels[s.get(f"{XL_R}id")].lstrip("/")
              for s in ET.fromstring(z.read("xl/workbook.xml")).iter(f"{XL}sheet")}
    if sheet_name not in sheets:
        raise RuntimeError(f"sheet {sheet_name!r} not in workbook: {sorted(sheets)}")
    path = sheets[sheet_name]
    path = path if path.startswith("xl/") else "xl/" + path
    for row in ET.fromstring(z.read(path)).iter(f"{XL}row"):
        cells = []
        for c in row.iter(f"{XL}c"):
            v = c.find(f"{XL}v")
            if v is None:
                cells.append("")
            elif c.get("t") == "s":
                cells.append(shared[int(v.text)])
            else:
                cells.append(v.text or "")
        yield cells


def home_office_table(pattern):
    """Find the newest Home Office immigration data file matching a filename pattern.

    The quarterly release moves to a new URL every time, but the statistical data-set page that lists the files
    does not, so the file is discovered from that stable page rather than hard-coded and left to rot."""
    page = get("https://www.gov.uk/api/content/government/statistical-data-sets/immigration-system-statistics-data-tables",
               "home_office_data_tables")
    urls = re.findall(r"https://assets\.publishing\.service\.gov\.uk/media/[A-Za-z0-9]+/" + pattern, page)
    if not urls:
        raise RuntimeError(f"no Home Office data file matched {pattern!r}")
    return urls[0]


# --------------------------------------------------------------------------- helpers
def at(series, iso):
    """The observation on or immediately before a date."""
    prior = [p for p in series if p[0] <= iso]
    if not prior:
        raise RuntimeError(f"no observation on or before {iso}")
    return prior[-1]


def since(series, iso):
    return [p for p in series if p[0] >= iso]


def latest(series):
    return series[-1]


def pct(a, b):
    return (b / a - 1) * 100


def rebase(series, iso):
    base = at(series, iso)[1]
    return [[d, round(v / base * 100, 2)] for d, v in series]


def fmt(v, n=1):
    return f"{v:,.{n}f}"


def signed(v, n=1):
    return ("+" if v > 0 else "−" if v < 0 else "") + f"{abs(v):,.{n}f}"


def check_fresh(metric, iso, max_days):
    age = (dt.date.today() - dt.date.fromisoformat(iso)).days
    log(metric, "freshness", "pass" if age <= max_days else "warn",
        f"latest observation {iso} ({age} days old)")


def check_range(metric, name, v, lo, hi):
    ok = lo <= v <= hi
    log(metric, "plausible range", "pass" if ok else "fail", f"{name} = {v} within [{lo}, {hi}]", critical=not ok)
    if not ok:
        raise RuntimeError(f"{metric}: {name} out of range")


def src_ons(title, page, series, data_url):
    return {"publisher": "Office for National Statistics", "title": title, "url": page,
            "data_url": data_url, "series": series, "retrieved_at": NOW.isoformat(timespec="seconds"), "automated": True}


def src_boe(title, page, series, data_url):
    return {"publisher": "Bank of England", "title": title, "url": page, "data_url": data_url,
            "series": series, "retrieved_at": NOW.isoformat(timespec="seconds"), "automated": True}


METRICS = []


def metric(fn):
    METRICS.append(fn)
    return fn


ONS_PAGES = {
    "mm23": ("Consumer price inflation, UK", "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/consumerpriceinflation/latest"),
    "lms": ("Labour market overview, UK", "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/uklabourmarket/latest"),
    "emp": ("Average weekly earnings in Great Britain", "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/averageweeklyearningsingreatbritain/latest"),
    "qna": ("GDP quarterly national accounts, UK", "https://www.ons.gov.uk/economy/grossdomesticproductgdp/bulletins/quarterlynationalaccounts/latest"),
    "prdy": ("Labour productivity, UK", "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/labourproductivity/bulletins/labourproductivity/latest"),
    "pusf": ("Public sector finances, UK", "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance/bulletins/publicsectorfinances/latest"),
}


def ons_source(dataset, series_ids, description):
    title, page = ONS_PAGES[dataset]
    ids = ", ".join(series_ids)
    return src_ons(title, page, [f"{description} ({ids})"],
                   f"https://www.ons.gov.uk/timeseries/{series_ids[0].lower()}/{dataset}")


# --------------------------------------------------------------------------- metrics
@metric
def inflation():
    mid = "inflation"
    cpi, desc = ons("D7G7", "MM23", "economy/inflationandpriceindices", "ons_cpi")
    d, v = latest(cpi)
    check_fresh(mid, d, 60)
    check_range(mid, "CPI annual rate", v, -5, 25)
    base = at(cpi, BASE_M)[1]
    idx, _ = ons("D7BT", "MM23", "economy/inflationandpriceindices", "ons_cpi_index")
    level_chg = pct(at(idx, BASE_M)[1], latest(idx)[1])
    return {
        "id": mid, "section": "cost", "title": "Inflation",
        "question": "Is inflation back to the Bank of England's 2% target?",
        "headline": {"value": v, "unit": "%", "decimals": 1, "period": period_label(d, "m"),
                     "caption": "annual CPI inflation, measured over the past 12 months"},
        "benchmark": {"label": "Bank of England target", "text": "2%"},
        "baseline": {"label": "June 2024", "value": base, "unit": "%"},
        "context": [
            f"Prices overall are {fmt(level_chg)}% higher than in June 2024, the last full month before the general election.",
            f"Inflation was {fmt(base)}% in June 2024 and is {fmt(v)}% now. The target is 2%.",
            "Falling inflation does not mean prices fall. It means they rise more slowly.",
        ],
        "chart": {"kind": "line", "unit": "%", "decimals": 1,
                  "series": [{"name": "CPI annual inflation", "role": "primary", "points": since(cpi, "2015-01-01")}],
                  "band": {"lo": 1, "hi": 3, "label": "Target 2% (±1)"}},
        "sources": [ons_source("mm23", ["D7G7", "D7BT"], "CPI annual rate and CPI index, all items")],
        "method": "The Consumer Prices Index annual rate published by the ONS, and the CPI index level used for the change since June 2024.",
        "explainer": {"what": "Inflation is how fast prices are rising. The figure is the change in the Consumer Prices Index over the past 12 months.",
                      "why": "The Bank of England is required to keep inflation at 2%. When pay rises more slowly than prices, households are worse off even though wages are going up."},
    }


@metric
def real_wages():
    mid = "real_wages"
    lvl, desc = ons("A3WX", "EMP", "employmentandlabourmarket/peopleinwork/earningsandworkinghours", "ons_awe_real")
    d, v = latest(lvl)
    check_fresh(mid, d, 90)
    check_range(mid, "real regular pay (£/week)", v, 300, 900)
    idx = rebase(lvl, BASE_M)
    chg = pct(at(lvl, BASE_M)[1], v)
    peak = max(p[1] for p in lvl)
    peak_date = [p[0] for p in lvl if p[1] == peak][0]
    return {
        "id": mid, "section": "cost", "title": "Real wages",
        "question": "Is pay keeping up with prices?",
        "headline": {"value": round(chg, 1), "unit": "%", "decimals": 1, "signed": True,
                     "period": f"{period_label(BASE_M, 'm')} → {period_label(d, 'm')}",
                     "caption": f"change in real regular pay since the election (now £{fmt(v, 0)} a week)"},
        "benchmark": {"label": "Level at the election", "text": f"£{fmt(at(lvl, BASE_M)[1], 0)} a week"},
        "baseline": {"label": "June 2024", "value": 100, "unit": "index"},
        "context": [
            f"Average regular pay is worth £{fmt(v, 0)} a week after inflation, against £{fmt(at(lvl, BASE_M)[1], 0)} in June 2024.",
            f"The highest this measure has ever reached is £{fmt(peak, 0)} a week, in {period_label(peak_date, 'm')}.",
            "Real pay is what your wage actually buys once prices are taken into account.",
        ],
        "chart": {"kind": "line", "unit": "index", "decimals": 1,
                  "series": [{"name": "Real regular pay", "role": "primary", "points": since(idx, "2015-01-01")}],
                  "ref": [{"value": 100, "label": "June 2024 = 100"}],
                  "note": "Average weekly regular pay in Great Britain, adjusted for inflation and seasonally adjusted, set to 100 in June 2024."},
        "sources": [ons_source("emp", ["A3WX"], "AWE whole economy, real terms level, regular pay, seasonally adjusted")],
        "method": "ONS Average Weekly Earnings, whole economy regular pay (excluding bonuses), in real terms and seasonally adjusted, indexed to June 2024.",
        "explainer": {"what": "Average weekly earnings adjusted for inflation, so the figures can be compared over time.",
                      "why": "This is the clearest measure of whether working people are better or worse off than they were."},
    }


@metric
def unemployment():
    mid = "unemployment"
    s, _ = ons("MGSX", "LMS", "employmentandlabourmarket/peoplenotinwork/unemployment", "ons_unemployment")
    emp, _ = ons("LF24", "LMS", "employmentandlabourmarket/peopleinwork/employmentandemployeetypes", "ons_employment_rate")
    inact, _ = ons("LF2S", "LMS", "employmentandlabourmarket/peoplenotinwork/economicinactivity", "ons_inactivity")
    d, v = latest(s)
    check_fresh(mid, d, 100)
    check_range(mid, "unemployment rate", v, 1, 20)
    base = at(s, BASE_M)[1]
    return {
        "id": mid, "section": "jobs", "title": "Unemployment",
        "question": "Are more people out of work than when the government took office?",
        "headline": {"value": v, "unit": "%", "decimals": 1, "period": period_label(d, "m"),
                     "caption": "unemployment rate, people aged 16 and over"},
        "benchmark": {"label": "At the election (June 2024)", "text": f"{fmt(base)}%"},
        "baseline": {"label": "June 2024", "value": base, "unit": "%"},
        "context": [
            f"The unemployment rate was {fmt(base)}% at the general election and is {fmt(v)}% now.",
            f"The employment rate for people aged 16 to 64 is {fmt(latest(emp)[1])}%, against {fmt(at(emp, BASE_M)[1])}% in June 2024.",
            f"{fmt(latest(inact)[1])}% of people aged 16 to 64 are economically inactive: neither working nor looking for work.",
        ],
        "chart": {"kind": "line", "unit": "%", "decimals": 1,
                  "series": [{"name": "Unemployment rate", "role": "primary", "points": since(s, "2015-01-01")}],
                  "ref": [{"value": base, "label": f"June 2024: {fmt(base)}%"}]},
        "sources": [ons_source("lms", ["MGSX", "LF24", "LF2S"], "Unemployment rate, employment rate and inactivity rate, seasonally adjusted")],
        "method": "ONS Labour Force Survey, seasonally adjusted, published in the monthly labour market overview. The ONS has warned that survey response rates make these estimates less reliable than usual.",
        "explainer": {"what": "The share of people in the labour force who are out of work and looking for a job.",
                      "why": "It is the clearest measure of whether the jobs market is getting easier or harder, though it misses people who have stopped looking."},
    }


@metric
def productivity():
    mid = "productivity"
    s, _ = ons("LZVB", "PRDY", "employmentandlabourmarket/peopleinwork/labourproductivity", "ons_productivity", freq="quarters")
    d, v = latest(s)
    check_fresh(mid, d, 200)
    base = at(s, BASE_Q)[1]
    chg = pct(base, v)
    return {
        "id": mid, "section": "economy", "title": "Productivity",
        "question": "Is the country producing more for each hour worked?",
        "headline": {"value": round(chg, 1), "unit": "%", "decimals": 1, "signed": True,
                     "period": f"{period_label(BASE_Q, 'q')} → {period_label(d, 'q')}",
                     "caption": "change in output per hour worked since the election"},
        "benchmark": {"label": "Level at the election", "text": "no change"},
        "baseline": {"label": "Apr–Jun 2024", "value": 100, "unit": "index"},
        "context": [
            "Productivity is output per hour worked. Over the long run it is what allows pay to rise without prices rising.",
            f"Output per hour is {signed(chg)}% compared with the quarter of the general election.",
        ],
        "chart": {"kind": "line", "unit": "index", "decimals": 1,
                  "series": [{"name": "Output per hour worked", "role": "primary", "points": since(rebase(s, BASE_Q), "2015-01-01")}],
                  "ref": [{"value": 100, "label": "Apr–Jun 2024 = 100"}]},
        "sources": [ons_source("prdy", ["LZVB"], "UK whole economy output per hour worked, seasonally adjusted")],
        "method": "ONS labour productivity: whole economy output per hour worked, seasonally adjusted, indexed to the June quarter of 2024.",
        "explainer": {"what": "How much the economy produces for each hour of work.",
                      "why": "Sustained pay rises and better public services ultimately depend on producing more per hour. UK productivity has grown slowly since the financial crisis."},
    }


@metric
def gdp_vs_capita():
    mid = "gdp_vs_capita"
    tot, _ = ons("ABMI", "QNA", "economy/grossdomesticproductgdp", "ons_gdp", freq="quarters")
    pc, _ = ons("IHXW", "QNA", "economy/grossdomesticproductgdp", "ons_gdp_per_head", freq="quarters")
    d, _ = latest(pc)
    check_fresh(mid, d, 200)
    if latest(tot)[0] != d:
        tot = [p for p in tot if p[0] <= d]
    pc_chg, tot_chg = pct(at(pc, BASE_Q)[1], latest(pc)[1]), pct(at(tot, BASE_Q)[1], latest(tot)[1])
    check_range(mid, "GDP per head change since the election", pc_chg, -15, 25)
    pop_chg = ((100 + tot_chg) / (100 + pc_chg) - 1) * 100
    return {
        "id": mid, "section": "economy", "title": "GDP per person vs total GDP",
        "question": "Is the economy growing for each person, or only because the population is growing?",
        "headline": {"value": round(pc_chg, 1), "unit": "%", "decimals": 1, "signed": True,
                     "period": f"{period_label(BASE_Q, 'q')} → {period_label(d, 'q')}",
                     "caption": f"change in GDP per person since the election, while total GDP grew {signed(tot_chg)}%"},
        "benchmark": {"label": "Total GDP, same period", "text": signed(tot_chg) + "%"},
        "baseline": {"label": "Apr–Jun 2024", "value": 100, "unit": "index"},
        "context": [
            f"Since the general election the economy as a whole has grown {signed(tot_chg)}%, while output per person has changed by {signed(pc_chg)}%.",
            f"The gap is population growth of about {fmt(pop_chg)}% over the same period.",
            f"GDP per person was £{fmt(latest(pc)[1], 0)} in {period_label(d, 'q')}, against £{fmt(at(pc, BASE_Q)[1], 0)} in the quarter of the election.",
        ],
        "chart": {"kind": "line", "unit": "index", "decimals": 1,
                  "series": [{"name": "GDP per person", "role": "primary", "points": since(rebase(pc, BASE_Q), "2015-01-01")},
                             {"name": "Total GDP", "role": "accent", "points": since(rebase(tot, BASE_Q), "2015-01-01")}],
                  "ref": [{"value": 100, "label": "Apr–Jun 2024 = 100"}],
                  "note": "Real (inflation-adjusted) GDP and GDP per person, seasonally adjusted, each set to 100 in the quarter of the general election. Where the total line rises faster than the per-person line, the difference is population growth."},
        "sources": [ons_source("qna", ["ABMI", "IHXW"], "Gross domestic product and GDP per head, chained volume measures, seasonally adjusted")],
        "method": "ONS quarterly national accounts: real GDP (ABMI) and real GDP per head (IHXW), both chained volume measures and seasonally adjusted, each indexed to the June quarter of 2024.",
        "explainer": {"what": "GDP is everything the economy produces. GDP per person divides that by the population.",
                      "why": "Total GDP can grow simply because there are more people. GDP per person is the better guide to living standards."},
    }


@metric
def debt():
    mid = "debt"
    s, _ = ons("HF6X", "PUSF", "economy/governmentpublicsectorandtaxes/publicsectorfinance", "ons_psnd")
    d, v = latest(s)
    check_fresh(mid, d, 70)
    check_range(mid, "public sector net debt (% of GDP)", v, 20, 200)
    base = at(s, BASE_M)[1]
    return {
        "id": mid, "section": "money", "title": "Government debt",
        "question": "How much does the state owe, measured against the size of the economy?",
        "headline": {"value": v, "unit": "%", "decimals": 1, "period": period_label(d, "m"),
                     "caption": "public sector net debt as a share of GDP"},
        "benchmark": {"label": "At the election (June 2024)", "text": f"{fmt(base)}% of GDP"},
        "baseline": {"label": "June 2024", "value": base, "unit": "%"},
        "context": [
            f"Debt was {fmt(base)}% of the economy at the general election and is {fmt(v)}% now.",
            "Debt as a share of GDP is the measure the government's own fiscal rules use, because it compares what is owed with the size of the economy that has to service it.",
        ],
        "chart": {"kind": "line", "unit": "%", "decimals": 1,
                  "series": [{"name": "Public sector net debt, % of GDP", "role": "primary", "points": since(s, "2010-01-01")}],
                  "ref": [{"value": base, "label": f"June 2024: {fmt(base)}%"}]},
        "sources": [ons_source("pusf", ["HF6X"], "Public sector net debt excluding public sector banks, as a share of GDP")],
        "method": "ONS public sector finances: net debt excluding public sector banks, as a percentage of GDP, published monthly.",
        "explainer": {"what": "Everything the state owes, minus its liquid assets, measured against the size of the economy.",
                      "why": "Interest on this debt is paid before anything else. The larger it is relative to the economy, the more of each year's taxes go to servicing it."},
    }


@metric
def borrowing():
    mid = "borrowing"
    raw, _ = ons("J5II", "PUSF", "economy/governmentpublicsectorandtaxes/publicsectorfinance", "ons_psnb")
    # The ONS series is net lending: borrowing appears as a negative. Flip it so a positive figure means borrowing.
    s = [[d, -v] for d, v in raw]
    d, v = latest(s)
    check_fresh(mid, d, 70)
    twelve = [p for p in s if p[0] > (dt.date.fromisoformat(d) - dt.timedelta(days=365)).isoformat()]
    rolling = sum(p[1] for p in twelve) / 1000
    return {
        "id": mid, "section": "money", "title": "Government borrowing",
        "question": "How much more is the government spending than it raises?",
        "headline": {"value": round(rolling, 1), "unit": "£bn", "decimals": 1, "period": f"12 months to {period_label(d, 'm')}",
                     "caption": "public sector net borrowing over the past 12 months"},
        "benchmark": {"label": "Balanced budget", "text": "£0"},
        "baseline": {"label": "June 2024", "value": at(s, BASE_M)[1] / 1000, "unit": "£bn"},
        "context": [
            f"Over the 12 months to {period_label(d, 'm')} the government borrowed £{fmt(rolling)} billion.",
            "Borrowing is the yearly gap between what the state spends and what it raises. Debt is the running total of every past gap.",
            f"In the latest month alone, the government {'borrowed' if v > 0 else 'ran a surplus of'} £{fmt(abs(v) / 1000)} billion.",
        ],
        "chart": {"kind": "bar", "unit": "£bn", "decimals": 1, "freq": "m",
                  "series": [{"name": "Monthly public sector net borrowing (£bn)", "role": "primary",
                              "points": [[p[0], round(p[1] / 1000, 2)] for p in since(s, "2018-01-01")]}],
                  "ref": [{"value": 0, "label": ""}],
                  "note": "Public sector net borrowing excluding public sector banks, by month. Positive bars are months when the government borrowed; bars below the line are surpluses, usually January and July when self-assessment tax arrives."},
        "sources": [ons_source("pusf", ["J5II"], "Public sector net borrowing excluding public sector banks, £ million")],
        "method": "ONS public sector finances: net borrowing excluding public sector banks. The headline is the sum of the latest 12 months.",
        "explainer": {"what": "The difference between what the government spends and what it raises in tax, in one period.",
                      "why": "Every pound borrowed is added to the national debt and has to be serviced out of future taxes."},
    }


@metric
def bank_rate():
    mid = "bank_rate"
    s = boe("IUMABEDR", "boe_bank_rate")
    mort = boe("IUMBV34", "boe_mortgage_2yr")
    svr = boe("IUMTLMV", "boe_svr")
    d, v = latest(s)
    check_fresh(mid, d, 70)
    check_range(mid, "Bank Rate", v, 0, 20)
    base = at(s, BASE_M)[1]
    return {
        "id": mid, "section": "money", "title": "Interest rates",
        "question": "What is it costing to borrow, and who decides?",
        "headline": {"value": v, "unit": "%", "decimals": 2, "period": period_label(d, "m"),
                     "caption": "Bank Rate, set by the Bank of England"},
        "benchmark": {"label": "At the election (June 2024)", "text": f"{fmt(base, 2)}%"},
        "baseline": {"label": "June 2024", "value": base, "unit": "%"},
        "context": [
            f"Bank Rate was {fmt(base, 2)}% at the general election and is {fmt(v, 2)}% now.",
            f"A typical two-year fixed mortgage at 75% loan-to-value is {fmt(latest(mort)[1], 2)}%, and the average standard variable rate is {fmt(latest(svr)[1], 2)}%.",
            "The Bank of England's Monetary Policy Committee sets Bank Rate independently of ministers, to meet the 2% inflation target.",
        ],
        "chart": {"kind": "line", "unit": "%", "decimals": 2,
                  "series": [{"name": "Bank Rate", "role": "primary", "points": since(s, "2015-01-01")},
                             {"name": "Two-year fixed mortgage (75% LTV)", "role": "muted", "points": since(mort, "2015-01-01")}]},
        "sources": [src_boe("Bank of England official Bank Rate and quoted household interest rates",
                            "https://www.bankofengland.co.uk/boeapps/database/", ["IUMABEDR", "IUMBV34", "IUMTLMV"],
                            "https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&SeriesCodes=IUMABEDR")],
        "method": "Bank of England statistical database: official Bank Rate (IUMABEDR), the quoted rate on a two-year fixed mortgage at 75% loan-to-value (IUMBV34) and the average standard variable rate (IUMTLMV), monthly.",
        "explainer": {"what": "Bank Rate is the interest rate the Bank of England pays commercial banks, and it feeds through to mortgages, loans and savings.",
                      "why": "It is the main tool for controlling inflation, and it decides what mortgages cost. The government does not set it."},
    }


@metric
def small_boat_arrivals():
    mid = "small_boats"
    monthly, last_day, ods_url = small_boats()
    points = [[iso, n] for iso, n in monthly]
    d, v = points[-1]
    check_fresh(mid, last_day.isoformat(), 20)
    since_election = sum(n for iso, n in points if iso >= ELECTION)
    year = [n for iso, n in points if iso > (dt.date.fromisoformat(d) - dt.timedelta(days=365)).isoformat()]
    prev_year = [n for iso, n in points if (dt.date.fromisoformat(d) - dt.timedelta(days=730)).isoformat() < iso <= (dt.date.fromisoformat(d) - dt.timedelta(days=365)).isoformat()]
    busiest = max(points, key=lambda p: p[1])
    return {
        "id": mid, "section": "borders", "title": "Small boat arrivals",
        "question": "How many people are crossing the Channel in small boats each month?",
        "headline": {"value": sum(year), "unit": "", "decimals": 0, "period": f"12 months to {period_label(d, 'm')}",
                     "caption": "people detected arriving in small boats over the past 12 months"},
        "benchmark": {"label": "Previous 12 months", "text": f"{sum(prev_year):,}"},
        "baseline": {"label": "Month of the election", "value": at(points, ELECTION)[1], "unit": ""},
        "context": [
            f"{sum(year):,} people arrived in the 12 months to {period_label(d, 'm')}, compared with {sum(prev_year):,} in the 12 months before that.",
            f"About {since_election:,} people have arrived since the general election in July 2024.",
            f"The busiest month on record in this series is {period_label(busiest[0], 'm')}, with {busiest[1]:,} arrivals.",
            f"In the latest complete month, {period_label(d, 'm')}, there were {v:,} arrivals.",
            "Arrivals are highly seasonal: crossings peak in summer when the Channel is calmest, so months should be compared with the same month a year earlier.",
        ],
        "chart": {"kind": "bar", "unit": "", "decimals": 0, "freq": "m",
                  "series": [{"name": "People arriving in small boats, by month", "role": "primary", "points": since(points, "2019-01-01")}],
                  "note": "Home Office and Border Force daily figures, added up by calendar month. The current, incomplete month is left out. These are people detected arriving; they are not the whole of irregular migration."},
        "sources": [{"publisher": "Home Office and Border Force", "title": "Small boat activity in the English Channel (transparency data)",
                     "url": "https://www.gov.uk/government/publications/migrants-detected-crossing-the-english-channel-in-small-boats",
                     "data_url": ods_url, "series": ["Migrants detected crossing the English Channel in small boats — daily time series (SB_01)"],
                     "retrieved_at": NOW.isoformat(timespec="seconds"), "automated": True}],
        "method": "Home Office transparency data: daily counts of people detected arriving in the UK in small boats, summed by calendar month. The series begins in 2018 and is updated weekly. The incomplete current month is excluded. These figures count arrivals detected by Border Force, and are not the same as asylum claims or as total irregular migration.",
        "explainer": {"what": "The number of people detected crossing the English Channel in small boats and arriving in the UK.",
                      "why": "It is the most visible measure of control of the border, and the figure most often cited in the debate about asylum. It is published weekly, so it is unusually current."},
    }


@metric
def returns():
    mid = "returns"
    url = home_office_table(r"returns-datasets-[a-z]{3}-\d{4}\.xlsx")
    blob = get(url, binary=True)
    qe = {"Q1": "03-31", "Q2": "06-30", "Q3": "09-30", "Q4": "12-31"}
    groups = {"Enforced return": {}, "Voluntary return": {}, "Refused entry at port and subsequently departed": {}}
    for i, cells in enumerate(xlsx_rows(blob, "Data_Ret_D02")):
        if i < 2 or len(cells) < 7:
            continue
        q, group = cells[1].strip(), cells[4]
        if group not in groups or q[-2:] not in qe:
            continue
        try:
            n = float(cells[6])
        except ValueError:
            continue
        iso = f"{q[:4]}-{qe[q[-2:]]}"
        groups[group][iso] = groups[group].get(iso, 0) + n
    if not groups["Enforced return"]:
        raise RuntimeError("returns: no rows parsed")

    def roll4(d):
        """Four-quarter rolling total, so a quarterly series reads as an annual one."""
        pts = sorted(d.items())
        return [[pts[i][0], int(sum(v for _, v in pts[i - 3:i + 1]))] for i in range(3, len(pts))]

    total = {k: sum(g.get(k, 0) for g in groups.values()) for k in groups["Enforced return"]}
    tot_r, enf_r, vol_r = roll4(total), roll4(groups["Enforced return"]), roll4(groups["Voluntary return"])
    d, v = tot_r[-1]
    check_fresh(mid, d, 130)
    check_range(mid, "returns over 12 months", v, 0, 500000)
    base = at(tot_r, BASE_Q)
    return {
        "id": mid, "section": "borders", "title": "Returns and removals",
        "question": "How many people with no right to be in the UK are actually leaving?",
        "headline": {"value": v, "unit": "", "decimals": 0, "period": f"12 months to {period_label(d, 'm')}",
                     "caption": "people returned from the UK over the past 12 months"},
        "benchmark": {"label": "At the election", "text": f"{base[1]:,}"},
        "baseline": {"label": "12 months to the election", "value": base[1], "unit": ""},
        "context": [
            f"{v:,} people were returned in the 12 months to {period_label(d, 'm')}, against {base[1]:,} in the 12 months to the election: "
            f"a change of {pct(base[1], v):+.1f}%.",
            f"Of the latest 12 months, {enf_r[-1][1]:,} were enforced returns and {vol_r[-1][1]:,} were voluntary. "
            "The rest were people refused entry at the border who then left.",
            "Enforced returns are the smallest of the three groups, and the one ministers are usually asked about.",
            "A return is not the same as a deportation, which is a specific power used mainly after a criminal conviction.",
        ],
        "chart": {"kind": "line", "unit": "", "decimals": 0, "freq": "q",
                  "series": [{"name": "All returns", "role": "primary", "points": since(tot_r, "2014-01-01")},
                             {"name": "Enforced returns", "role": "muted", "points": since(enf_r, "2014-01-01")},
                             {"name": "Voluntary returns", "role": "muted", "points": since(vol_r, "2014-01-01")}],
                  "note": "Home Office returns data (table Ret_D02), as rolling four-quarter totals so the seasonal pattern does not distort the trend."},
        "sources": [{"publisher": "Home Office", "title": "Immigration system statistics: returns from the UK (Ret_D02)",
                     "url": "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables",
                     "data_url": url, "series": ["Returns from the UK by return destination and return type (Ret_D02)"],
                     "retrieved_at": NOW.isoformat(timespec="seconds"), "automated": True}],
        "method": "Home Office quarterly returns dataset Ret_D02, summed across destinations into rolling four-quarter totals. 'Returns' covers enforced returns, voluntary returns and people refused entry at the border who subsequently left.",
        "explainer": {"what": "The number of people leaving the UK who had no right to remain, whether removed by the Home Office or leaving voluntarily.",
                      "why": "Arrivals get the attention, but a system's credibility rests on whether people refused permission to stay actually leave. Governments of both parties are judged on this figure."},
    }


@metric
def asylum_hotels():
    mid = "asylum_hotels"
    url = home_office_table(r"asylum-seekers-receipt-support-datasets-[a-z]{3}-\d{4}\.xlsx")
    blob = get(url, binary=True)
    months = {"Mar": "03-31", "Jun": "06-30", "Sep": "09-30", "Dec": "12-31"}
    hotel, supported = {}, {}
    for i, cells in enumerate(xlsx_rows(blob, "Data_Asy_D09")):
        if i < 2 or len(cells) < 7:
            continue
        label, accom = cells[0].strip(), cells[4]
        key = months.get(label[3:6])
        if not key:
            continue
        iso = f"{label[-4:]}-{key}"
        try:
            n = float(cells[6])
        except ValueError:
            continue
        supported[iso] = supported.get(iso, 0) + n
        if "hotel" in accom.lower():
            hotel[iso] = hotel.get(iso, 0) + n
    if not hotel:
        raise RuntimeError("asylum hotels: no rows parsed")
    points = [[iso, int(n)] for iso, n in sorted(hotel.items())]
    d, v = points[-1]
    check_fresh(mid, d, 130)                       # quarterly, published about two months after the quarter ends
    check_range(mid, "asylum seekers in hotels", v, 0, 200000)
    peak = max(points, key=lambda p: p[1])
    base = at(points, BASE_Q)
    high_since = max((p for p in points if p[0] >= BASE_Q), key=lambda p: p[1])
    return {
        "id": mid, "section": "cohesion", "title": "Asylum seekers in hotels",
        "question": "How many people claiming asylum are being housed in hotels?",
        "headline": {"value": v, "unit": "", "decimals": 0, "period": period_label(d, "q"),
                     "caption": "asylum seekers in hotel accommodation"},
        "benchmark": {"label": "Peak", "text": f"{peak[1]:,} ({period_label(peak[0], 'q')})"},
        "baseline": {"label": "At the election", "value": base[1], "unit": ""},
        "context": [
            f"{v:,} people supported by the Home Office were living in hotels at {period_label(d, 'q')}, "
            f"against {base[1]:,} at the election.",
            f"The number rose after the election before falling, peaking at {high_since[1]:,} in {period_label(high_since[0], 'q')}.",
            f"The highest figure in this series is {peak[1]:,}, in {period_label(peak[0], 'q')}, under the previous government.",
            f"Hotels housed {v / supported[d] * 100:.0f}% of the {int(supported[d]):,} asylum seekers receiving Home Office support at that date; "
            "the rest are in dispersal or initial accommodation, or receive money only.",
            "Hotel use is the most visible and most contested part of asylum accommodation, and has been the focus of local protests.",
            "The accommodation breakdown starts at the end of 2022. Earlier support figures exist but do not separate hotels the same way.",
        ],
        "chart": {"kind": "line", "unit": "", "decimals": 0, "freq": "q",
                  "series": [{"name": "Asylum seekers in hotel accommodation", "role": "primary", "points": points}],
                  "note": "Home Office quarterly asylum support data (table Asy_D09), counting people in contingency hotel accommodation at the end of each quarter."},
        "sources": [{"publisher": "Home Office", "title": "Immigration system statistics: asylum seekers in receipt of support (Asy_D09)",
                     "url": "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables",
                     "data_url": url, "series": ["Asylum seekers in receipt of Home Office support, by accommodation type (Asy_D09)"],
                     "retrieved_at": NOW.isoformat(timespec="seconds"), "automated": True}],
        "method": "Home Office quarterly asylum support dataset Asy_D09. People recorded in 'Contingency Accommodation - Hotel' at the end of each quarter, summed across nationalities and UK regions. Published quarterly, roughly two months after the quarter ends.",
        "explainer": {"what": "The number of people waiting on an asylum claim who are being housed in hotels at public expense.",
                      "why": "Hotels are the most visible form of asylum accommodation, the most expensive per person, and the focus of local protest. Both the government and its critics use this figure, so it is worth seeing in full."},
    }


# --------------------------------------------------------------------------- build
SECTIONS = [
    {"id": "cost", "title": "Cost of living", "blurb": "Prices, pay and what a wage actually buys."},
    {"id": "housing", "title": "Housing", "blurb": "Building, buying and renting."},
    {"id": "jobs", "title": "Jobs", "blurb": "Work, unemployment and the people not looking."},
    {"id": "economy", "title": "The economy", "blurb": "Growth, output per person and productivity."},
    {"id": "money", "title": "Tax, spending and debt", "blurb": "What the state raises, spends, borrows and owes."},
    {"id": "health", "title": "The NHS", "blurb": "Waiting lists and access to care."},
    {"id": "borders", "title": "Borders and migration", "blurb": "Who is arriving, and how."},
    {"id": "energy", "title": "Energy", "blurb": "Bills and where power comes from."},
    {"id": "crime", "title": "Crime and policing", "blurb": "Police numbers and public safety."},
    {"id": "cohesion", "title": "Social cohesion", "blurb": "Whether communities hold together: trust, integration, asylum accommodation and public order."},
    {"id": "education", "title": "Schools", "blurb": "How children are doing."},
]


def main():
    print("No. 10 Report Card — building UK data\n")
    results, failed = [], []
    for fn in METRICS:
        name = fn.__name__
        try:
            print(f"· {name}")
            m = fn()
            m.setdefault("automated", True)
            m["updated_at"] = NOW.isoformat(timespec="seconds")
            results.append(m)
        except Exception as e:
            failed.append(name)
            log(name, "fetch", "fail", str(e)[:200], critical=True)

    manual_path = os.path.join(HERE, "manual.json")
    manual = json.load(open(manual_path, encoding="utf-8")) if os.path.exists(manual_path) else {"metrics": []}
    for m in manual.get("metrics", []):
        m.setdefault("automated", False)
        results.append(m)
        if m.get("recheck_by") and m["recheck_by"] < dt.date.today().isoformat():
            log(m["id"], "review due", "warn", f"recheck_by {m['recheck_by']} has passed")

    order = {s["id"]: i for i, s in enumerate(SECTIONS)}
    results.sort(key=lambda m: (order.get(m["section"], 99), m["id"]))

    if failed:
        print(f"\n!! {len(failed)} automated metric(s) failed: {', '.join(failed)}")
        if len(failed) > len(METRICS) / 2:
            sys.exit("too many failures; not writing data")

    out = {
        "summary": {"generated_at": NOW.isoformat(timespec="seconds"),
                    "checks_total": len(CHECKS),
                    "checks_passed": sum(1 for c in CHECKS if c["status"] == "pass"),
                    "checks_warn": sum(1 for c in CHECKS if c["status"] == "warn"),
                    "checks_failed": sum(1 for c in CHECKS if c["status"] == "fail"),
                    "metrics_total": len(results)},
        "election": ELECTION,
        "sections": SECTIONS,
        "metrics": results,
    }
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, "checks.json"), "w", encoding="utf-8") as f:
        json.dump({"generated_at": NOW.isoformat(timespec="seconds"), "checks": CHECKS}, f, ensure_ascii=False, indent=1)
    print(f"\nWrote {len(results)} metrics to {DATA}/metrics.json")
    print(f"Checks: {out['summary']['checks_passed']} passed, {out['summary']['checks_warn']} warnings, {out['summary']['checks_failed']} failed")


if __name__ == "__main__":
    main()

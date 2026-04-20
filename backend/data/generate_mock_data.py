import json
import random
import sqlite3
from datetime import datetime, timedelta, date
from pathlib import Path

random.seed(42)

# ── helpers ──────────────────────────────────────────────────────────────────

def daterange(start: date, end: date):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)

def months_back(n: int) -> date:
    today = date.today()
    m = today.month - n
    y = today.year + m // 12
    m = m % 12 or 12
    return date(y, m, 1)

TODAY = date.today()
START = months_back(12)

# ── load client profiles ──────────────────────────────────────────────────────

with open("signal_mock_data.json") as f:
    base = json.load(f)

clients      = base["clients"]
products_cat = {p["id"]: p for p in base["products_catalog"]}

# ── transaction volume generators per signal type ────────────────────────────

def gen_weekly_volumes(client: dict) -> list[dict]:
    """Return one row per ISO-week for last 52 weeks."""
    signal   = client["expected_signal"]
    severity = client["signal_severity"]
    revenue  = client["annual_revenue"]
    industry = client["industry"]

    base_weekly = revenue / 52
    rows = []

    # seasonal multiplier by industry
    seasonal = {
        "Restaurant & Food Service":       [0.8,0.8,0.9,1.0,1.1,1.2,1.2,1.1,1.0,0.9,1.0,1.3],
        "Agriculture":                     [0.6,0.6,0.8,1.1,1.3,1.3,1.2,1.1,1.2,1.0,0.7,0.6],
        "Retail":                          [0.8,0.7,0.8,0.9,0.9,0.9,1.0,0.9,0.9,1.0,1.1,1.8],
        "Landscaping & Environmental Services":[0.5,0.5,0.7,1.1,1.4,1.4,1.3,1.2,1.1,0.9,0.6,0.5],
        "Construction":                    [0.7,0.7,0.9,1.1,1.2,1.2,1.2,1.1,1.1,1.0,0.8,0.7],
        "Health & Fitness":                [1.2,1.0,0.9,0.9,0.9,0.9,0.9,0.9,1.0,1.0,1.0,1.1],
    }
    s_curve = seasonal.get(industry, [1.0]*12)

    for w in range(52):
        week_start = TODAY - timedelta(weeks=52-w)
        month_idx  = week_start.month - 1
        s          = s_curve[month_idx]
        noise      = random.uniform(0.92, 1.08)

        # trend multiplier based on signal
        progress = w / 51          # 0 → 1 over the year
        if signal == "credit_stress":
            drop = 0.35 if severity == "HIGH" else 0.18 if severity == "MEDIUM" else 0.08
            if w < 26:
                trend = 1.0
            else:
                trend = 1.0 - drop * ((w - 26) / 25)
        elif signal == "upsell_opportunity":
            gain = 1.8 if severity == "HIGH" else 1.4 if severity == "MEDIUM" else 1.2
            trend = 1.0 + (gain - 1.0) * progress
        elif signal == "churn_risk":
            drop = 0.50 if severity == "HIGH" else 0.35 if severity == "MEDIUM" else 0.20
            if w < 30:
                trend = 1.0
            else:
                trend = 1.0 - drop * ((w - 30) / 21)
        else:
            trend = 1.0 + random.uniform(-0.03, 0.03)

        vol = max(0, base_weekly * s * trend * noise)
        rows.append({
            "client_id":    client["id"],
            "week_start":   week_start.isoformat(),
            "week_number":  week_start.isocalendar()[1],
            "year":         week_start.year,
            "volume":       round(vol, 2),
            "txn_count":    max(1, int(vol / random.uniform(800, 3000))),
        })
    return rows


def gen_payment_history(client: dict) -> list[dict]:
    """Monthly loan payments for last 12 months."""
    if not client["loan_balance"]:
        return []

    signal   = client["expected_signal"]
    severity = client["signal_severity"]
    balance  = client["loan_balance"]
    monthly  = round(balance / 60, 2)   # assume 5-yr term
    rows     = []

    for m in range(12):
        due_date = months_back(11 - m)
        due_date = due_date.replace(day=1)

        # drift logic
        if signal == "credit_stress":
            if m < 6:
                drift = random.randint(0, 2)
            else:
                base_drift = 4 if severity == "LOW" else 8 if severity == "MEDIUM" else 14
                drift = base_drift + random.randint(0, 4) + (m - 6)
        elif signal == "churn_risk":
            drift = random.randint(2, 6) if m > 8 else random.randint(0, 2)
        else:
            drift = random.randint(0, 2)

        paid_date = due_date + timedelta(days=drift)
        # don't go past today
        if paid_date > TODAY:
            paid_date = TODAY - timedelta(days=random.randint(1, 5))

        on_time = drift <= 3
        rows.append({
            "client_id":   client["id"],
            "due_date":    due_date.isoformat(),
            "paid_date":   paid_date.isoformat(),
            "amount":      monthly,
            "days_late":   drift,
            "on_time":     on_time,
            "month_number": m + 1,
        })
    return rows


def gen_balance_history(client: dict) -> list[dict]:
    """Monthly balance snapshots for last 12 months."""
    signal   = client["expected_signal"]
    severity = client["signal_severity"]
    change   = client["balance_change_90d_pct"] / 100

    # back-calculate approximate starting balance
    current_est = client["annual_revenue"] * 0.08
    rows = []

    for m in range(12):
        snap_date = months_back(11 - m)
        progress  = m / 11
        noise     = random.uniform(0.96, 1.04)

        if signal == "upsell_opportunity":
            factor = 1.0 + change * progress
        elif signal in ("credit_stress", "churn_risk"):
            factor = 1.0 + change * max(0, (progress - 0.5) * 2)
        else:
            factor = 1.0 + random.uniform(-0.05, 0.05)

        balance = max(0, current_est * factor * noise)
        rows.append({
            "client_id":  client["id"],
            "snap_date":  snap_date.replace(day=1).isoformat(),
            "balance":    round(balance, 2),
            "month_number": m + 1,
        })
    return rows


def gen_login_history(client: dict) -> list[dict]:
    """Portal login events for last 90 days."""
    signal   = client["expected_signal"]
    severity = client["signal_severity"]
    days_ago = client["portal_last_login_days_ago"]
    rows     = []

    for d in range(90, 0, -1):
        login_date = TODAY - timedelta(days=d)

        if signal == "churn_risk":
            # frequent early, stops recently
            if d > days_ago + 5:
                prob = 0.25
            else:
                prob = 0.02
        elif signal == "upsell_opportunity":
            prob = 0.40
        elif signal == "credit_stress" and severity == "HIGH":
            prob = 0.15
        else:
            prob = 0.30

        if random.random() < prob:
            rows.append({
                "client_id":  client["id"],
                "login_date": login_date.isoformat(),
                "session_duration_minutes": random.randint(3, 45),
                "pages_visited": random.randint(1, 12),
            })

    return rows


def gen_product_usage(client: dict) -> list[dict]:
    """Monthly product usage score (0-100) for last 6 months."""
    rows = []
    for product_id in client["products"]:
        for m in range(6):
            snap = months_back(5 - m).replace(day=1)
            signal = client["expected_signal"]
            if signal == "churn_risk":
                base_score = max(5, 70 - m * 12)
            elif signal == "upsell_opportunity":
                base_score = min(95, 60 + m * 6)
            elif signal == "credit_stress":
                base_score = max(20, 75 - m * 5)
            else:
                base_score = random.randint(55, 85)

            rows.append({
                "client_id":   client["id"],
                "product_id":  product_id,
                "snap_date":   snap.isoformat(),
                "usage_score": min(100, max(0, base_score + random.randint(-8, 8))),
                "month_number": m + 1,
            })
    return rows


# ── generate all data ─────────────────────────────────────────────────────────

all_transactions  = []
all_payments      = []
all_balances      = []
all_logins        = []
all_product_usage = []

for c in clients:
    all_transactions.extend(gen_weekly_volumes(c))
    all_payments.extend(gen_payment_history(c))
    all_balances.extend(gen_balance_history(c))
    all_logins.extend(gen_login_history(c))
    all_product_usage.extend(gen_product_usage(c))

print(f"Generated:")
print(f"  transactions  : {len(all_transactions):>5} rows  (52 weeks × 25 clients)")
print(f"  payments      : {len(all_payments):>5} rows")
print(f"  balances      : {len(all_balances):>5} rows")
print(f"  logins        : {len(all_logins):>5} rows")
print(f"  product_usage : {len(all_product_usage):>5} rows")
print(f"  TOTAL         : {len(all_transactions)+len(all_payments)+len(all_balances)+len(all_logins)+len(all_product_usage):>5} rows")

# ── write to SQLite ───────────────────────────────────────────────────────────

db_path = Path("signal.db")
if db_path.exists():
    db_path.unlink()

conn = sqlite3.connect(db_path)
cur  = conn.cursor()

cur.executescript("""
CREATE TABLE relationship_managers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL
);

CREATE TABLE risk_managers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL
);

CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT NOT NULL,
    location TEXT NOT NULL,
    relationship_manager_id TEXT NOT NULL,
    annual_revenue REAL,
    loan_balance REAL,
    loan_origination_date TEXT,
    credit_limit REAL,
    products TEXT,
    expected_signal TEXT,
    signal_severity TEXT,
    scenario_note TEXT,
    FOREIGN KEY (relationship_manager_id) REFERENCES relationship_managers(id)
);

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    week_number INTEGER,
    year INTEGER,
    volume REAL,
    txn_count INTEGER,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    due_date TEXT NOT NULL,
    paid_date TEXT NOT NULL,
    amount REAL,
    days_late INTEGER,
    on_time INTEGER,
    month_number INTEGER,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE balance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    snap_date TEXT NOT NULL,
    balance REAL,
    month_number INTEGER,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    login_date TEXT NOT NULL,
    session_duration_minutes INTEGER,
    pages_visited INTEGER,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE product_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    snap_date TEXT NOT NULL,
    usage_score REAL,
    month_number INTEGER,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE products_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    annual_revenue_to_bank REAL
);

CREATE TABLE signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    run_date TEXT NOT NULL,
    signal_type TEXT,
    severity TEXT,
    score REAL,
    churn_score REAL,
    credit_stress_score REAL,
    upsell_score REAL,
    reasoning TEXT,
    external_context TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE briefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    run_date TEXT NOT NULL,
    relationship_manager_id TEXT NOT NULL,
    brief_text TEXT,
    recommended_action TEXT,
    dollar_impact REAL,
    impact_type TEXT,
    actioned INTEGER DEFAULT 0,
    actioned_at TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    client_id TEXT,
    status TEXT,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE demo_scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    clients_involved TEXT,
    insight TEXT
);
""")

# insert static data
for rm in base["relationship_managers"]:
    cur.execute("INSERT INTO relationship_managers VALUES (?,?,?)",
                (rm["id"], rm["name"], rm["email"]))

for rm in base["risk_managers"]:
    cur.execute("INSERT INTO risk_managers VALUES (?,?,?)",
                (rm["id"], rm["name"], rm["email"]))

for p in base["products_catalog"]:
    cur.execute("INSERT INTO products_catalog VALUES (?,?,?)",
                (p["id"], p["name"], p["annual_revenue_to_bank"]))

for sc in base["demo_scenarios"]:
    cur.execute("INSERT INTO demo_scenarios VALUES (?,?,?,?,?)",
                (sc["scenario_id"], sc["name"], sc["description"],
                 json.dumps(sc["clients_involved"]), sc["insight"]))

for c in clients:
    cur.execute("""INSERT INTO clients VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (c["id"], c["name"], c["industry"], c["location"],
                 c["relationship_manager_id"], c["annual_revenue"],
                 c["loan_balance"], c.get("loan_origination_date"),
                 c["credit_limit"], json.dumps(c["products"]),
                 c["expected_signal"], c["signal_severity"], c["scenario_note"]))

# insert time-series data
cur.executemany("INSERT INTO transactions (client_id,week_start,week_number,year,volume,txn_count) VALUES (?,?,?,?,?,?)",
    [(r["client_id"],r["week_start"],r["week_number"],r["year"],r["volume"],r["txn_count"]) for r in all_transactions])

cur.executemany("INSERT INTO payments (client_id,due_date,paid_date,amount,days_late,on_time,month_number) VALUES (?,?,?,?,?,?,?)",
    [(r["client_id"],r["due_date"],r["paid_date"],r["amount"],r["days_late"],r["on_time"],r["month_number"]) for r in all_payments])

cur.executemany("INSERT INTO balance_history (client_id,snap_date,balance,month_number) VALUES (?,?,?,?)",
    [(r["client_id"],r["snap_date"],r["balance"],r["month_number"]) for r in all_balances])

cur.executemany("INSERT INTO login_history (client_id,login_date,session_duration_minutes,pages_visited) VALUES (?,?,?,?)",
    [(r["client_id"],r["login_date"],r["session_duration_minutes"],r["pages_visited"]) for r in all_logins])

cur.executemany("INSERT INTO product_usage (client_id,product_id,snap_date,usage_score,month_number) VALUES (?,?,?,?,?)",
    [(r["client_id"],r["product_id"],r["snap_date"],r["usage_score"],r["month_number"]) for r in all_product_usage])

conn.commit()

# ── quick sanity checks ───────────────────────────────────────────────────────
print("\nSanity checks:")
for tbl in ["relationship_managers","risk_managers","clients","transactions",
            "payments","balance_history","login_history","product_usage","products_catalog"]:
    n = cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
    print(f"  {tbl:<30}: {n:>5} rows")

# spot check a credit stress client
print("\nSpot check — Meridian Restaurant Group payment drift:")
rows = cur.execute("""
    SELECT due_date, paid_date, days_late FROM payments
    WHERE client_id='CLT-001' ORDER BY due_date
""").fetchall()
for r in rows:
    print(f"  due {r[0]}  paid {r[1]}  days_late={r[2]}")

print("\nSpot check — Hartwell Logistics balance growth:")
rows = cur.execute("""
    SELECT snap_date, balance FROM balance_history
    WHERE client_id='CLT-002' ORDER BY snap_date
""").fetchall()
for r in rows:
    print(f"  {r[0]}  ${r[1]:,.0f}")

print("\nSpot check — BlueCrest Retail login dropoff:")
rows = cur.execute("""
    SELECT login_date FROM login_history
    WHERE client_id='CLT-003'
    ORDER BY login_date DESC LIMIT 10
""").fetchall()
print(f"  Last 10 logins: {[r[0] for r in rows]}")

conn.close()
print(f"\nDatabase written to: {db_path.resolve()}")

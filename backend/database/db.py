import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta

from backend.config import settings


@contextmanager
def get_connection():
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------

def get_all_clients() -> list[dict]:
    sql = """
        SELECT c.*, rm.name AS rm_name,
               s.signal_type, s.severity, s.score,
               s.churn_score, s.credit_stress_score, s.upsell_score,
               s.reasoning, s.run_date AS signal_run_date
        FROM clients c
        LEFT JOIN relationship_managers rm ON c.relationship_manager_id = rm.id
        LEFT JOIN signals s ON s.id = (
            SELECT id FROM signals
            WHERE client_id = c.id
            ORDER BY created_at DESC
            LIMIT 1
        )
    """
    with get_connection() as conn:
        rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]


def get_client_by_id(client_id: str) -> dict | None:
    sql = """
        SELECT c.*, rm.name AS rm_name, rm.email AS rm_email
        FROM clients c
        LEFT JOIN relationship_managers rm ON c.relationship_manager_id = rm.id
        WHERE c.id = ?
    """
    with get_connection() as conn:
        row = conn.execute(sql, (client_id,)).fetchone()
    return dict(row) if row else None


def get_clients_by_rm(rm_id: str) -> list[dict]:
    sql = """
        SELECT c.*, rm.name AS rm_name,
               s.signal_type, s.severity, s.score,
               s.churn_score, s.credit_stress_score, s.upsell_score,
               s.reasoning, s.run_date AS signal_run_date
        FROM clients c
        LEFT JOIN relationship_managers rm ON c.relationship_manager_id = rm.id
        LEFT JOIN signals s ON s.id = (
            SELECT id FROM signals
            WHERE client_id = c.id
            ORDER BY created_at DESC
            LIMIT 1
        )
        WHERE c.relationship_manager_id = ?
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (rm_id,)).fetchall()
    return [dict(r) for r in rows]


def get_all_clients_with_latest_signals() -> list[dict]:
    """For the risk dashboard — each client with their most recent signal."""
    sql = """
        SELECT c.*, rm.name AS rm_name,
               s.signal_type, s.severity, s.score,
               s.churn_score, s.credit_stress_score, s.upsell_score,
               s.reasoning, s.run_date AS signal_run_date,
               s.created_at AS signal_created_at
        FROM clients c
        LEFT JOIN relationship_managers rm ON c.relationship_manager_id = rm.id
        LEFT JOIN signals s ON s.client_id = c.id
          AND s.id = (
            SELECT id FROM signals
            WHERE client_id = c.id
            ORDER BY created_at DESC
            LIMIT 1
          )
        ORDER BY
          CASE s.severity
            WHEN 'HIGH'   THEN 1
            WHEN 'MEDIUM' THEN 2
            WHEN 'LOW'    THEN 3
            ELSE 4
          END,
          s.score DESC
    """
    with get_connection() as conn:
        rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

def get_client_transactions(client_id: str, weeks: int = 12) -> list[dict]:
    sql = """
        SELECT * FROM transactions
        WHERE client_id = ?
        ORDER BY week_start DESC
        LIMIT ?
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (client_id, weeks)).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------

def get_client_payments(client_id: str) -> list[dict]:
    sql = """
        SELECT * FROM payments
        WHERE client_id = ?
        ORDER BY due_date
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (client_id,)).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Balance history
# ---------------------------------------------------------------------------

def get_client_balances(client_id: str) -> list[dict]:
    sql = """
        SELECT * FROM balance_history
        WHERE client_id = ?
        ORDER BY snap_date
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (client_id,)).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Login history
# ---------------------------------------------------------------------------

def get_client_logins(client_id: str, days: int = 90) -> list[dict]:
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    sql = """
        SELECT * FROM login_history
        WHERE client_id = ? AND login_date >= ?
        ORDER BY login_date DESC
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (client_id, cutoff)).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Product usage
# ---------------------------------------------------------------------------

def get_client_product_usage(client_id: str) -> list[dict]:
    """Latest usage score per product for a client."""
    sql = """
        SELECT pu.*, pc.name AS product_name, pc.annual_revenue_to_bank
        FROM product_usage pu
        JOIN products_catalog pc ON pu.product_id = pc.id
        WHERE pu.id IN (
            SELECT id FROM product_usage
            WHERE client_id = ?
            GROUP BY product_id
            HAVING snap_date = MAX(snap_date)
        )
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (client_id,)).fetchall()
    return [dict(r) for r in rows]


def get_products_catalog() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM products_catalog").fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------

def insert_signal(data: dict) -> int:
    safe = {k: json.dumps(v) if isinstance(v, (list, dict)) else v for k, v in data.items()}
    cols = ", ".join(safe.keys())
    placeholders = ", ".join("?" * len(safe))
    sql = f"INSERT INTO signals ({cols}) VALUES ({placeholders})"
    with get_connection() as conn:
        cur = conn.execute(sql, list(safe.values()))
        conn.commit()
        return cur.lastrowid


# ---------------------------------------------------------------------------
# Briefs
# ---------------------------------------------------------------------------

def insert_brief(data: dict) -> int:
    safe = {k: json.dumps(v) if isinstance(v, (list, dict)) else v for k, v in data.items()}
    cols = ", ".join(safe.keys())
    placeholders = ", ".join("?" * len(safe))
    sql = f"INSERT INTO briefs ({cols}) VALUES ({placeholders})"
    with get_connection() as conn:
        cur = conn.execute(sql, list(safe.values()))
        conn.commit()
        return cur.lastrowid


def get_latest_briefs_by_rm(rm_id: str) -> list[dict]:
    """Most recent brief per client for an RM, ordered by dollar_impact desc."""
    sql = """
        SELECT b.*, c.name AS client_name
        FROM briefs b
        JOIN clients c ON b.client_id = c.id
        WHERE b.id IN (
            SELECT id FROM briefs
            WHERE relationship_manager_id = ?
            GROUP BY client_id
            HAVING created_at = MAX(created_at)
        )
        ORDER BY b.dollar_impact DESC
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (rm_id,)).fetchall()
    return [dict(r) for r in rows]


def get_todays_briefs_by_rm(rm_id: str) -> list[dict]:
    sql = """
        SELECT b.*, c.name AS client_name
        FROM briefs b
        JOIN clients c ON b.client_id = c.id
        WHERE b.relationship_manager_id = ?
          AND b.signal_type != 'none' AND b.signal_type IS NOT NULL
          AND b.severity != 'NONE' AND b.severity IS NOT NULL
          AND b.id = (
            SELECT MAX(id) FROM briefs
            WHERE client_id = b.client_id
          )
        ORDER BY
          CASE b.severity
            WHEN 'HIGH'   THEN 1
            WHEN 'MEDIUM' THEN 2
            WHEN 'LOW'    THEN 3
          END,
          b.dollar_impact DESC
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (rm_id,)).fetchall()
    return [dict(r) for r in rows]


def action_brief(brief_id: int, notes: str) -> None:
    sql = """
        UPDATE briefs
        SET actioned = 1,
            actioned_at = ?,
            notes = ?
        WHERE id = ?
    """
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(sql, (now, notes, brief_id))
        conn.commit()


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

def insert_audit_log(data: dict) -> None:
    cols = ", ".join(data.keys())
    placeholders = ", ".join("?" * len(data))
    sql = f"INSERT INTO audit_log ({cols}) VALUES ({placeholders})"
    with get_connection() as conn:
        conn.execute(sql, list(data.values()))
        conn.commit()


def get_audit_log(limit: int = 100) -> list[dict]:
    sql = """
        SELECT al.*, c.name AS client_name
        FROM audit_log al
        LEFT JOIN clients c ON al.client_id = c.id
        ORDER BY al.created_at DESC
        LIMIT ?
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (limit,)).fetchall()
    return [dict(r) for r in rows]

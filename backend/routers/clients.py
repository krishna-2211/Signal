from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.database.db import (
    get_all_clients,
    get_client_balances,
    get_client_by_id,
    get_client_logins,
    get_client_payments,
    get_client_product_usage,
    get_client_transactions,
    get_clients_by_rm,
    get_connection,
)

router = APIRouter()


def _latest_brief_signals(client_ids: list[str]) -> dict[str, dict]:
    """Return {client_id: {signal_type, severity}} for the latest brief per client."""
    if not client_ids:
        return {}
    placeholders = ",".join("?" * len(client_ids))
    sql = f"""
        SELECT client_id, signal_type, severity
        FROM briefs
        WHERE id IN (
            SELECT MAX(id) FROM briefs
            WHERE client_id IN ({placeholders})
            GROUP BY client_id
        )
        AND signal_type != 'none' AND signal_type IS NOT NULL
        AND severity != 'NONE' AND severity IS NOT NULL
    """
    with get_connection() as conn:
        rows = conn.execute(sql, client_ids).fetchall()
    return {r["client_id"]: {"signal_type": r["signal_type"], "severity": r["severity"]}
            for r in rows}


@router.get("/")
def list_clients(current_user: dict = Depends(get_current_user)):
    """Return clients scoped by role: RM sees own portfolio, risk sees all."""
    if current_user["role"] == "risk":
        clients = get_all_clients()
    else:
        clients = get_clients_by_rm(current_user["user_id"])

    if not clients:
        return {"clients": [], "count": 0}

    _signal_keys = {"signal_type", "severity", "score", "churn_score",
                    "credit_stress_score", "upsell_score", "reasoning", "signal_run_date"}

    # Brief signal takes precedence over signals table to keep Portfolio consistent with Brief
    brief_signals = _latest_brief_signals([c["id"] for c in clients])

    enriched = []
    for c in clients:
        sig = {k: c[k] for k in _signal_keys if k in c and c[k] is not None}
        base = {k: v for k, v in c.items() if k not in _signal_keys}
        if c["id"] in brief_signals:
            sig.update(brief_signals[c["id"]])
        enriched.append({**base, "latest_signal": sig or None})

    return {"clients": enriched, "count": len(enriched)}


@router.get("/{client_id}")
def client_detail(client_id: str):
    """Full client profile including transactions, payments, balances, logins, latest signal and brief."""
    client = get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail=f"Client '{client_id}' not found")

    # Parallel data fetch (all synchronous DB calls)
    transactions = get_client_transactions(client_id, weeks=12)
    payments = get_client_payments(client_id)
    balances = get_client_balances(client_id)
    logins = get_client_logins(client_id, days=90)
    product_usage = get_client_product_usage(client_id)

    # Latest signal
    with get_connection() as conn:
        signal_row = conn.execute(
            """
            SELECT * FROM signals
            WHERE client_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (client_id,),
        ).fetchone()

    # Latest brief
    with get_connection() as conn:
        brief_row = conn.execute(
            """
            SELECT * FROM briefs
            WHERE client_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (client_id,),
        ).fetchone()

    return {
        "client": client,
        "transactions": transactions,
        "payments": payments,
        "balances": balances,
        "logins": logins,
        "product_usage": product_usage,
        "latest_signal": dict(signal_row) if signal_row else None,
        "latest_brief": dict(brief_row) if brief_row else None,
    }

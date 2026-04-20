from fastapi import APIRouter, HTTPException, Query

from backend.database.db import (
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


@router.get("/")
def list_clients(rm_id: str = Query(...)):
    """Return all clients for an RM with their latest signal status."""
    clients = get_clients_by_rm(rm_id)

    if not clients:
        return {"rm_id": rm_id, "clients": [], "count": 0}

    client_ids = [c["id"] for c in clients]
    placeholders = ",".join("?" * len(client_ids))

    sql = f"""
        SELECT s.client_id, s.signal_type, s.severity, s.score,
               s.churn_score, s.credit_stress_score, s.upsell_score, s.run_date
        FROM signals s
        WHERE s.id IN (
            SELECT id FROM signals
            WHERE client_id IN ({placeholders})
            GROUP BY client_id
            HAVING created_at = MAX(created_at)
        )
    """
    with get_connection() as conn:
        rows = conn.execute(sql, client_ids).fetchall()

    signals_by_client = {r["client_id"]: dict(r) for r in rows}

    enriched = [
        {**c, "latest_signal": signals_by_client.get(c["id"])}
        for c in clients
    ]

    return {"rm_id": rm_id, "clients": enriched, "count": len(enriched)}


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

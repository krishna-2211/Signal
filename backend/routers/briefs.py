from fastapi import APIRouter, Body, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.database.db import (
    action_brief,
    get_connection,
    get_latest_briefs_by_rm,
    get_todays_briefs_by_rm,
)

router = APIRouter()


@router.get("/")
def list_todays_briefs(current_user: dict = Depends(get_current_user)):
    """Return most recent brief per client scoped by role: RM sees own, risk sees all."""
    if current_user["role"] == "risk":
        sql = """
            SELECT b.*, c.name AS client_name
            FROM briefs b
            JOIN clients c ON b.client_id = c.id
            WHERE b.signal_type != 'none' AND b.severity != 'NONE'
              AND b.id IN (
                SELECT MAX(id) FROM briefs
                GROUP BY client_id
              )
            ORDER BY b.dollar_impact DESC
        """
        with get_connection() as conn:
            rows = conn.execute(sql).fetchall()
        briefs = [dict(r) for r in rows]
        return {"briefs": briefs, "count": len(briefs)}

    rm_id = current_user["user_id"]
    briefs = get_todays_briefs_by_rm(rm_id)
    return {"rm_id": rm_id, "briefs": briefs, "count": len(briefs)}


@router.get("/latest")
def list_latest_briefs(current_user: dict = Depends(get_current_user)):
    """Return the most recent brief per client scoped by role."""
    if current_user["role"] == "risk":
        sql = """
            SELECT b.*, c.name AS client_name
            FROM briefs b
            JOIN clients c ON b.client_id = c.id
            WHERE b.id IN (
                SELECT id FROM briefs
                GROUP BY client_id
                HAVING created_at = MAX(created_at)
            )
            ORDER BY b.dollar_impact DESC
        """
        with get_connection() as conn:
            rows = conn.execute(sql).fetchall()
        briefs = [dict(r) for r in rows]
        return {"briefs": briefs, "count": len(briefs)}

    rm_id = current_user["user_id"]
    briefs = get_latest_briefs_by_rm(rm_id)
    return {"rm_id": rm_id, "briefs": briefs, "count": len(briefs)}


@router.get("/{client_id}")
def client_brief_history(client_id: str):
    """Return full brief history for a client ordered by created_at desc."""
    sql = """
        SELECT * FROM briefs
        WHERE client_id = ?
        ORDER BY created_at DESC
    """
    with get_connection() as conn:
        rows = conn.execute(sql, (client_id,)).fetchall()

    if not rows:
        return {"client_id": client_id, "briefs": [], "count": 0}

    briefs = [dict(r) for r in rows]
    return {"client_id": client_id, "briefs": briefs, "count": len(briefs)}


@router.patch("/{brief_id}/action")
def action_brief_endpoint(brief_id: int, notes: str = Body(..., embed=True)):
    """Mark a brief as actioned with optional notes."""
    try:
        action_brief(brief_id, notes)
        return {"brief_id": brief_id, "actioned": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

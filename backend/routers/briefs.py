from fastapi import APIRouter, Body, HTTPException, Query

from backend.database.db import (
    action_brief,
    get_latest_briefs_by_rm,
    get_todays_briefs_by_rm,
)
from backend.database.db import get_connection

router = APIRouter()


@router.get("/")
def list_todays_briefs(rm_id: str = Query(...)):
    """Return today's briefs for an RM sorted by dollar_impact descending."""
    briefs = get_todays_briefs_by_rm(rm_id)
    return {"rm_id": rm_id, "briefs": briefs, "count": len(briefs)}


@router.get("/latest")
def list_latest_briefs(rm_id: str = Query(...)):
    """Return the most recent brief per client for an RM."""
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

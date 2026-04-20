from fastapi import APIRouter, Query

from backend.database.db import get_audit_log

router = APIRouter()


@router.get("/")
def list_audit_log(limit: int = Query(default=100, ge=1, le=500)):
    """Return recent audit log entries ordered by created_at descending."""
    entries = get_audit_log(limit=limit)
    return {"entries": entries, "count": len(entries)}

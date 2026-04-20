from fastapi import APIRouter, HTTPException, Query

from backend.agents.orchestrator import Orchestrator
from backend.database.db import get_audit_log

router = APIRouter()
_orchestrator = Orchestrator()


@router.post("/run")
async def run_pipeline(rm_id: str | None = Query(default=None)):
    """Trigger the full signal pipeline. Optionally scope to a single RM's clients."""
    try:
        summary = await _orchestrator.run_pipeline(rm_id=rm_id)
        return summary
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status")
def pipeline_status():
    """Return the most recent pipeline run info from the audit log."""
    entries = get_audit_log(limit=100)

    pipeline_entries = [
        e for e in entries
        if e.get("agent_name") == "Orchestrator"
    ]

    if not pipeline_entries:
        return {"status": "no_runs_found", "last_run": None, "summary": None}

    latest = pipeline_entries[0]  # already ordered created_at DESC
    return {
        "status": latest.get("status"),
        "last_run": latest.get("created_at"),
        "summary": latest.get("message"),
    }

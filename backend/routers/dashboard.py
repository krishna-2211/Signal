from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException, status

from backend.auth import get_current_user
from backend.database.db import get_all_clients_with_latest_signals

router = APIRouter()


@router.get("/risk")
def risk_dashboard(current_user: dict = Depends(get_current_user)):
    """
    Full portfolio view for risk managers.

    Returns all clients with latest signals, grouped by signal type,
    severity counts, and sector stress flags (2+ clients in the same
    industry both carrying a credit_stress signal).
    """
    if current_user["role"] != "risk":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Risk dashboard requires risk role",
        )

    clients = get_all_clients_with_latest_signals()

    # ------------------------------------------------------------------
    # Severity counts
    # ------------------------------------------------------------------
    severity_counts: Counter = Counter()
    signal_type_counts: Counter = Counter()

    for c in clients:
        severity = c.get("severity") or "NONE"
        signal_type = c.get("signal_type") or "none"
        severity_counts[severity] += 1
        signal_type_counts[signal_type] += 1

    # ------------------------------------------------------------------
    # Group clients by signal type
    # ------------------------------------------------------------------
    by_signal: dict[str, list[dict]] = defaultdict(list)
    for c in clients:
        signal_type = c.get("signal_type") or "none"
        by_signal[signal_type].append(c)

    # Sort each group: HIGH → MEDIUM → LOW → NONE
    _severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "NONE": 3}
    for group in by_signal.values():
        group.sort(key=lambda c: _severity_order.get(c.get("severity") or "NONE", 4))

    # ------------------------------------------------------------------
    # Sector stress detection
    # Flag any industry where 2+ clients have a credit_stress signal
    # ------------------------------------------------------------------
    industry_credit_stress: dict[str, list[str]] = defaultdict(list)
    for c in clients:
        if c.get("signal_type") == "credit_stress":
            industry = c.get("industry") or "Unknown"
            industry_credit_stress[industry].append(c.get("name", c["id"]))

    stressed_sectors = [
        {"industry": industry, "clients": names}
        for industry, names in industry_credit_stress.items()
        if len(names) >= 2
    ]

    # ------------------------------------------------------------------
    # High-severity escalation list (HIGH + MEDIUM signals)
    # ------------------------------------------------------------------
    escalations = [
        c for c in clients
        if c.get("severity") in ("HIGH", "MEDIUM")
    ]
    escalations.sort(
        key=lambda c: (
            _severity_order.get(c.get("severity") or "NONE", 4),
            -(c.get("score") or 0),
        )
    )

    return {
        "total_clients": len(clients),
        "severity_counts": dict(severity_counts),
        "signal_type_counts": dict(signal_type_counts),
        "by_signal_type": dict(by_signal),
        "stressed_sectors": stressed_sectors,
        "escalations": escalations,
        "escalation_count": len(escalations),
    }

import logging
from datetime import date, datetime, timedelta

from backend.database.db import (
    get_client_balances,
    get_client_by_id,
    get_client_logins,
    get_client_payments,
    get_client_product_usage,
    get_client_transactions,
    insert_audit_log,
)

logger = logging.getLogger(__name__)

_AGENT_NAME = "DataIngestionAgent"


class DataIngestionAgent:
    def run(self, client_id: str) -> dict:
        self._audit(client_id, "started", "Data ingestion started")

        try:
            client = get_client_by_id(client_id)
            transactions = get_client_transactions(client_id, weeks=12)
            payments = get_client_payments(client_id)
            balances = get_client_balances(client_id)
            logins = get_client_logins(client_id, days=90)
            product_usage = get_client_product_usage(client_id)

            derived = {}

            # ------------------------------------------------------------------
            # Transaction volume trend
            # ------------------------------------------------------------------
            # transactions are already ordered week_start DESC (most recent first)
            volumes = [t["volume"] for t in transactions]
            last_4 = volumes[:4]
            prev_8 = volumes[4:12]

            avg_last_4 = sum(last_4) / len(last_4) if last_4 else None
            avg_prev_8 = sum(prev_8) / len(prev_8) if prev_8 else None

            if avg_last_4 is not None and avg_prev_8 and avg_prev_8 != 0:
                volume_trend_pct = ((avg_last_4 - avg_prev_8) / avg_prev_8) * 100
            else:
                volume_trend_pct = None

            derived["avg_volume_last_4w"] = avg_last_4
            derived["avg_volume_prev_8w"] = avg_prev_8
            derived["volume_trend_pct"] = volume_trend_pct

            # ------------------------------------------------------------------
            # Payment drift
            # ------------------------------------------------------------------
            if payments:
                # payments are ordered due_date ASC — last 6 in chronological order
                last_6 = payments[-6:]
                derived["payment_drift_trend"] = [p["days_late"] for p in last_6]

                recent_3 = last_6[-3:]
                early_3 = last_6[:3]

                avg_recent = sum(p["days_late"] for p in recent_3) / len(recent_3)
                avg_early = sum(p["days_late"] for p in early_3) / len(early_3)

                derived["avg_days_late_recent"] = avg_recent
                derived["avg_days_late_early"] = avg_early

                if avg_recent > avg_early + 2:
                    derived["payment_drift_direction"] = "worsening"
                elif avg_recent < avg_early - 2:
                    derived["payment_drift_direction"] = "improving"
                else:
                    derived["payment_drift_direction"] = "stable"
            else:
                derived["payment_drift_trend"] = None
                derived["avg_days_late_recent"] = None
                derived["avg_days_late_early"] = None
                derived["payment_drift_direction"] = None

            # ------------------------------------------------------------------
            # Login engagement
            # ------------------------------------------------------------------
            today = date.today()

            if logins:
                most_recent_login = logins[0]["login_date"]  # DESC order
                days_since = (today - date.fromisoformat(most_recent_login)).days
                derived["days_since_last_login"] = days_since
            else:
                derived["days_since_last_login"] = None

            cutoff_30d = today - timedelta(days=30)
            cutoff_60d = today - timedelta(days=60)

            last_30 = sum(
                1 for l in logins
                if date.fromisoformat(l["login_date"]) >= cutoff_30d
            )
            prev_30 = sum(
                1 for l in logins
                if cutoff_60d <= date.fromisoformat(l["login_date"]) < cutoff_30d
            )

            derived["login_frequency_last_30d"] = last_30
            derived["login_frequency_prev_30d"] = prev_30
            derived["login_trend"] = (
                "declining" if prev_30 > 0 and last_30 < prev_30 * 0.5 else "stable"
            )

            # ------------------------------------------------------------------
            # Balance trajectory
            # ------------------------------------------------------------------
            # balances ordered snap_date ASC
            if balances:
                derived["balance_latest"] = balances[-1]["balance"]

                three_months_ago = today - timedelta(days=90)
                older = [
                    b for b in balances
                    if date.fromisoformat(b["snap_date"]) <= three_months_ago
                ]
                if older:
                    b_3m = older[-1]["balance"]  # closest snapshot at/before 3m ago
                    derived["balance_3m_ago"] = b_3m
                    if b_3m and b_3m != 0:
                        derived["balance_change_pct"] = (
                            (derived["balance_latest"] - b_3m) / abs(b_3m)
                        ) * 100
                    else:
                        derived["balance_change_pct"] = None
                else:
                    derived["balance_3m_ago"] = None
                    derived["balance_change_pct"] = None
            else:
                derived["balance_latest"] = None
                derived["balance_3m_ago"] = None
                derived["balance_change_pct"] = None

            # ------------------------------------------------------------------
            # Product footprint
            # ------------------------------------------------------------------
            derived["active_products"] = [p["product_id"] for p in product_usage]
            derived["product_count"] = len(product_usage)

            result = {
                "client": client,
                "transactions": transactions,
                "payments": payments,
                "balances": balances,
                "logins": logins,
                "product_usage": product_usage,
                "derived_metrics": derived,
            }

            self._audit(client_id, "completed", "Data ingestion completed successfully")
            return result

        except Exception as exc:
            self._audit(client_id, "error", str(exc))
            logger.exception("DataIngestionAgent failed for client %s", client_id)
            raise

    # --------------------------------------------------------------------------
    # Internal helpers
    # --------------------------------------------------------------------------

    def _audit(self, client_id: str, status: str, message: str) -> None:
        try:
            insert_audit_log({
                "run_date": date.today().isoformat(),
                "agent_name": _AGENT_NAME,
                "client_id": client_id,
                "status": status,
                "message": message,
                "created_at": datetime.utcnow().isoformat(),
            })
        except Exception:
            logger.warning("Failed to write audit log for client %s", client_id, exc_info=True)

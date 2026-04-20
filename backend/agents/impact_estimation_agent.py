import json
import logging
from datetime import date, datetime

from backend.database.db import get_products_catalog, insert_audit_log

logger = logging.getLogger(__name__)

_AGENT_NAME = "ImpactEstimationAgent"


def _parse_products(raw) -> set[str]:
    """Return a set of product name strings from the client's products field."""
    if not raw:
        return set()
    if isinstance(raw, (list, set)):
        return {str(p).strip() for p in raw}
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return {str(p).strip() for p in parsed}
        except json.JSONDecodeError:
            pass
    return set()


class ImpactEstimationAgent:
    def run(self, client: dict, signal: dict) -> dict:
        client_id = client["id"]
        self._audit(client_id, "started", "Impact estimation started")

        try:
            catalog = get_products_catalog()
            result = self._estimate(client, signal, catalog)
        except Exception as exc:
            logger.exception(
                "ImpactEstimationAgent failed for client %s", client_id
            )
            self._audit(client_id, "error", str(exc))
            raise

        self._audit(
            client_id,
            "completed",
            f"Impact estimated: {result['impact_type']} = ${result['dollar_impact']:,.0f}",
        )
        return result

    # --------------------------------------------------------------------------
    # Core calculation
    # --------------------------------------------------------------------------

    def _estimate(self, client: dict, signal: dict, catalog: list[dict]) -> dict:
        primary = signal.get("primary_signal", "none")
        client_products = _parse_products(client.get("products"))

        catalog_by_name = {p["name"]: p for p in catalog}

        if primary == "churn_risk":
            held = [
                p for name, p in catalog_by_name.items()
                if name in client_products
            ]
            dollar_impact = sum(p["annual_revenue_to_bank"] for p in held)
            basis = (
                f"Sum of annual bank revenue from {len(held)} product(s) "
                f"currently held by the client — all at risk if client churns."
            )
            return {
                "dollar_impact": float(dollar_impact),
                "impact_type": "revenue_at_risk",
                "recommended_products": [],
                "calculation_basis": basis,
            }

        if primary == "credit_stress":
            loan_balance = float(client.get("loan_balance") or 0)
            dollar_impact = loan_balance * 0.15
            basis = (
                f"15% expected loss given default applied to loan balance "
                f"of ${loan_balance:,.0f}."
            )
            return {
                "dollar_impact": dollar_impact,
                "impact_type": "potential_loss",
                "recommended_products": [],
                "calculation_basis": basis,
            }

        if primary == "upsell_opportunity":
            missing = sorted(
                [p for name, p in catalog_by_name.items() if name not in client_products],
                key=lambda p: p["annual_revenue_to_bank"],
                reverse=True,
            )
            top2 = missing[:2]
            dollar_impact = sum(p["annual_revenue_to_bank"] for p in top2)
            names = [p["name"] for p in top2]
            basis = (
                f"Combined annual revenue from top {len(top2)} unsubscribed product(s): "
                f"{', '.join(names)}."
                if names
                else "No unsubscribed products available in catalog."
            )
            return {
                "dollar_impact": float(dollar_impact),
                "impact_type": "revenue_opportunity",
                "recommended_products": names,
                "calculation_basis": basis,
            }

        # none / stable / unrecognised
        return {
            "dollar_impact": 0.0,
            "impact_type": "none",
            "recommended_products": [],
            "calculation_basis": "No actionable signal detected — no impact calculated.",
        }

    # --------------------------------------------------------------------------
    # Audit
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
            logger.warning(
                "Failed to write audit log for client %s", client_id, exc_info=True
            )

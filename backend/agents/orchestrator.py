import asyncio
import json
import logging
from datetime import date, datetime

from backend.agents.brief_generation_agent import BriefGenerationAgent
from backend.agents.data_ingestion_agent import DataIngestionAgent
from backend.agents.external_signal_agent import ExternalSignalAgent
from backend.agents.impact_estimation_agent import ImpactEstimationAgent
from backend.agents.signal_detection_agent import SignalDetectionAgent
from backend.database.db import (
    get_all_clients,
    get_clients_by_rm,
    insert_audit_log,
    insert_brief,
    insert_signal,
)

logger = logging.getLogger(__name__)

_AGENT_NAME = "Orchestrator"
_CLIENT_TIMEOUT = 180  # seconds per client — sized for local Ollama models


class Orchestrator:
    def __init__(self):
        self._ingestion = DataIngestionAgent()
        self._external = ExternalSignalAgent()
        self._detection = SignalDetectionAgent()
        self._impact = ImpactEstimationAgent()
        self._brief = BriefGenerationAgent()

    async def run_pipeline(self, rm_id: str = None) -> dict:
        run_date = date.today().isoformat()
        started_at = datetime.utcnow()

        clients = get_clients_by_rm(rm_id) if rm_id else get_all_clients()

        self._audit(
            None, "started",
            f"Pipeline started — {len(clients)} client(s) to process"
            + (f", rm_id={rm_id}" if rm_id else ""),
        )

        total_processed = 0
        signals_detected = 0
        briefs_generated = 0
        errors: list[dict] = []

        for raw_client in clients:
            client_id = raw_client["id"]
            try:
                async with asyncio.timeout(_CLIENT_TIMEOUT):
                    # --------------------------------------------------------------
                    # Step 1 — Data ingestion
                    # --------------------------------------------------------------
                    self._audit(client_id, "started", "Step 1: data ingestion")
                    client_data = self._ingestion.run(client_id)
                    client = client_data["client"]  # richer dict from get_client_by_id

                    # --------------------------------------------------------------
                    # Step 2 — External signals
                    # --------------------------------------------------------------
                    self._audit(client_id, "started", "Step 2: external signal fetch")
                    external = await self._external.run(client)

                    # --------------------------------------------------------------
                    # Step 3 — Signal detection
                    # --------------------------------------------------------------
                    self._audit(client_id, "started", "Step 3: signal detection")
                    signal = await self._detection.run(client_data, external)

                    # --------------------------------------------------------------
                    # Step 4 — Impact estimation
                    # --------------------------------------------------------------
                    self._audit(client_id, "started", "Step 4: impact estimation")
                    impact = self._impact.run(client, signal)

                    # --------------------------------------------------------------
                    # Step 5 — Brief generation (only when a signal was detected)
                    # --------------------------------------------------------------
                    primary_signal = signal.get("primary_signal", "none")
                    brief: dict = {}
                    if primary_signal != "none":
                        self._audit(client_id, "started", "Step 5: brief generation")
                        brief = await self._brief.run(client, signal, impact, external)

                    # --------------------------------------------------------------
                    # Step 6 — Persist signal
                    # --------------------------------------------------------------
                    score_by_type = {
                        "churn_risk": signal.get("churn_risk_score", 0),
                        "credit_stress": signal.get("credit_stress_score", 0),
                        "upsell_opportunity": signal.get("upsell_opportunity_score", 0),
                    }
                    insert_signal({
                        "client_id": client_id,
                        "run_date": run_date,
                        "signal_type": primary_signal,
                        "severity": signal.get("severity", "NONE"),
                        "score": score_by_type.get(primary_signal, 0),
                        "churn_score": signal.get("churn_risk_score", 0),
                        "credit_stress_score": signal.get("credit_stress_score", 0),
                        "upsell_score": signal.get("upsell_opportunity_score", 0),
                        "reasoning": signal.get("reasoning", ""),
                        "created_at": datetime.utcnow().isoformat(),
                    })

                    if primary_signal != "none":
                        signals_detected += 1

                    # --------------------------------------------------------------
                    # Step 7 — Persist brief
                    # --------------------------------------------------------------
                    if brief and brief.get("brief_text"):
                        insert_brief({
                            "client_id": client_id,
                            "relationship_manager_id": client.get("relationship_manager_id"),
                            "run_date": run_date,
                            "signal_type": primary_signal,
                            "severity": signal.get("severity", "NONE"),
                            "dollar_impact": impact.get("dollar_impact", 0.0),
                            "impact_type": impact.get("impact_type", "none"),
                            "brief_text": brief.get("brief_text", ""),
                            "recommended_action": brief.get("recommended_action", ""),
                            "urgency_note": brief.get("urgency_note", ""),
                            "talking_points": json.dumps(brief.get("talking_points", [])),
                            "actioned": 0,
                            "created_at": datetime.utcnow().isoformat(),
                        })
                        briefs_generated += 1

                    total_processed += 1
                    self._audit(
                        client_id, "completed",
                        f"Client pipeline done — signal={primary_signal}, "
                        f"severity={signal.get('severity', 'NONE')}, "
                        f"impact=${impact.get('dollar_impact', 0):,.0f}",
                    )

            except TimeoutError:
                logger.error("Pipeline timed out for client %s after %ss", client_id, _CLIENT_TIMEOUT)
                errors.append({"client_id": client_id, "error": f"timed out after {_CLIENT_TIMEOUT}s"})
                self._audit(client_id, "error", f"Pipeline timed out after {_CLIENT_TIMEOUT}s")

            except Exception as exc:
                logger.exception("Pipeline failed for client %s", client_id)
                errors.append({"client_id": client_id, "error": str(exc)})
                self._audit(client_id, "error", f"Pipeline error: {exc}")

        duration = (datetime.utcnow() - started_at).total_seconds()
        self._audit(
            None, "completed",
            f"Pipeline complete — processed={total_processed}, "
            f"signals={signals_detected}, briefs={briefs_generated}, "
            f"errors={len(errors)}, duration={duration:.1f}s",
        )

        return {
            "run_date": run_date,
            "total_processed": total_processed,
            "signals_detected": signals_detected,
            "briefs_generated": briefs_generated,
            "errors": errors,
            "duration_seconds": round(duration, 2),
        }

    # --------------------------------------------------------------------------
    # Internal helpers
    # --------------------------------------------------------------------------

    def _audit(self, client_id, status: str, message: str) -> None:
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
            logger.warning("Orchestrator failed to write audit log", exc_info=True)

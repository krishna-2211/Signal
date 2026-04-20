import json
import logging
import re
from datetime import date, datetime

from backend.core.llm_client import llm_client
from backend.database.db import insert_audit_log

logger = logging.getLogger(__name__)

_AGENT_NAME = "BriefGenerationAgent"

_SYSTEM_PROMPT = (
    "You are a senior relationship manager assistant at a commercial bank. "
    "Your job is to write daily intelligence briefs for relationship managers. "
    "Briefs must be clear, direct, and jargon-free. "
    "Write as if explaining to a smart business person, not a data analyst. "
    "Every brief must make the reader know exactly what happened and exactly what to do. "
    "Respond only in valid JSON."
)

_SIGNAL_LABELS = {
    "churn_risk": "Churn Risk",
    "credit_stress": "Credit Stress",
    "upsell_opportunity": "Upsell Opportunity",
}

_IMPACT_LABELS = {
    "revenue_at_risk": "revenue at risk",
    "potential_loss": "potential loss",
    "revenue_opportunity": "revenue opportunity",
}


class BriefGenerationAgent:
    async def run(
        self,
        client: dict,
        signal: dict,
        impact: dict,
        external: dict,
    ) -> dict:
        client_id = client["id"]
        primary = signal.get("primary_signal", "none")

        if primary == "none":
            self._audit(client_id, "skipped", "No actionable signal — brief skipped")
            return {}

        self._audit(client_id, "started", "Brief generation started")

        user_prompt = self._build_user_prompt(client, signal, impact, external)
        raw_response = ""

        try:
            raw_response = await llm_client.complete(_SYSTEM_PROMPT, user_prompt)
            result = self._parse_response(raw_response, client, signal, impact)
        except Exception as exc:
            logger.exception(
                "BriefGenerationAgent LLM call failed for client %s", client_id
            )
            self._audit(client_id, "error", str(exc))
            result = self._fallback_brief(client, signal, impact)

        result["raw_response"] = raw_response
        self._audit(client_id, "completed", "Brief generated successfully")
        return result

    # --------------------------------------------------------------------------
    # Prompt construction
    # --------------------------------------------------------------------------

    def _build_user_prompt(
        self,
        client: dict,
        signal: dict,
        impact: dict,
        external: dict,
    ) -> str:
        signal_label = _SIGNAL_LABELS.get(signal["primary_signal"], signal["primary_signal"])
        impact_label = _IMPACT_LABELS.get(impact["impact_type"], impact["impact_type"])

        news = external.get("news_headlines", [])
        top_news = [a["title"] for a in news[:2] if a.get("title")]
        news_str = (
            "\n".join(f"  - {t}" for t in top_news)
            if top_news
            else "  None available"
        )

        macro = external.get("macro_indicator", {})
        macro_str = (
            f"{macro.get('series_id', 'N/A')} trending {macro.get('trend', 'N/A')} "
            f"(latest: {macro.get('latest_value', 'N/A')})"
            if macro
            else "No macro data available"
        )

        products_str = (
            ", ".join(impact["recommended_products"])
            if impact.get("recommended_products")
            else "N/A"
        )

        indicators_str = (
            "\n".join(f"  - {i}" for i in signal.get("key_indicators", []))
            or "  None listed"
        )

        return f"""Generate a relationship manager intelligence brief for the following client.

CLIENT
  Name:            {client.get('name', 'N/A')}
  Industry:        {client.get('industry', 'N/A')}
  Location:        {client.get('location', 'N/A')}
  Annual Revenue:  ${client.get('annual_revenue', 0):,.0f}

DETECTED SIGNAL
  Type:      {signal_label}
  Severity:  {signal.get('severity', 'N/A')}
  Reasoning: {signal.get('reasoning', 'N/A')}

FINANCIAL IMPACT
  Dollar Impact: ${impact.get('dollar_impact', 0):,.0f} ({impact_label})
  Recommended Products: {products_str}

KEY INDICATORS
{indicators_str}

EXTERNAL CONTEXT
  Recent news:
{news_str}
  Macro indicator: {macro_str}

Respond with exactly this JSON and no other text:
{{
  "brief_text": "<2-3 sentences: what changed, why it matters, no jargon>",
  "recommended_action": "<one specific sentence starting with a verb — exactly what the RM should do>",
  "urgency_note": "<one sentence on when to act and why>",
  "talking_points": ["<point 1>", "<point 2>", "<point 3>"]
}}"""

    # --------------------------------------------------------------------------
    # Response parsing
    # --------------------------------------------------------------------------

    def _clean_json(self, text: str) -> str:
        """Normalise LLM output into parseable JSON."""
        # Strip markdown code fences
        if "```" in text:
            text = "\n".join(
                line for line in text.splitlines()
                if not line.strip().startswith("```")
            ).strip()

        # Extract between first { and last }
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]

        # Fix common Ollama escape artifacts
        text = text.replace(r"\_", "_")
        text = text.replace(r"\(", "(")
        text = text.replace(r"\)", ")")
        text = text.replace(r"\$", "$")

        # Remove any remaining invalid escape sequences (keep valid JSON escapes)
        text = re.sub(r'\\(?!["\\/bfnrtu])', "", text)

        # Strip trailing commas before closing } or ]
        text = re.sub(r",\s*([}\]])", r"\1", text)

        # Close any unclosed braces (handles truncated responses)
        open_count = text.count("{")
        close_count = text.count("}")
        if open_count > close_count:
            text += "}" * (open_count - close_count)

        return text

    def _parse_response(
        self,
        raw: str,
        client: dict,
        signal: dict,
        impact: dict,
    ) -> dict:
        text = self._clean_json(raw.strip())

        try:
            parsed = json.loads(text)
            return {
                "brief_text": parsed.get("brief_text", ""),
                "recommended_action": parsed.get("recommended_action", ""),
                "urgency_note": parsed.get("urgency_note", ""),
                "talking_points": parsed.get("talking_points", []),
            }
        except json.JSONDecodeError as exc:
            logger.warning(
                "BriefGenerationAgent JSON parse failed for client %s: %s\nRaw response: %s",
                client["id"], exc, raw,
            )
            return self._fallback_brief(client, signal, impact)

    # --------------------------------------------------------------------------
    # Fallback brief (no LLM)
    # --------------------------------------------------------------------------

    def _fallback_brief(self, client: dict, signal: dict, impact: dict) -> dict:
        signal_label = _SIGNAL_LABELS.get(signal["primary_signal"], signal["primary_signal"])
        severity = signal.get("severity", "UNKNOWN")
        dollar = impact.get("dollar_impact", 0)
        impact_label = _IMPACT_LABELS.get(impact["impact_type"], impact["impact_type"])
        reasoning = signal.get("reasoning", "No reasoning available.")

        brief_text = (
            f"{client.get('name', 'This client')} has triggered a {severity} {signal_label} signal. "
            f"{reasoning} "
            f"The estimated {impact_label} is ${dollar:,.0f}."
        )

        if signal["primary_signal"] == "churn_risk":
            action = "Schedule an immediate check-in call with the client to understand their needs."
            urgency = "Act within 48 hours — early outreach significantly improves retention odds."
            points = [
                f"Client is showing signs of disengagement worth ${dollar:,.0f} in annual revenue.",
                "Ask directly whether their needs are being met and what could be improved.",
                "Bring a tailored retention offer or product review to the conversation.",
            ]
        elif signal["primary_signal"] == "credit_stress":
            action = "Review the client's loan covenants and request an updated financial statement."
            urgency = "Flag to credit risk team today — early intervention limits potential loss."
            points = [
                f"Estimated exposure at risk: ${dollar:,.0f} based on current loan balance.",
                "Look for signs of payment delays or unusual transaction patterns.",
                "Consider a restructuring conversation before the client misses a payment.",
            ]
        else:  # upsell_opportunity
            products = impact.get("recommended_products", [])
            product_str = " and ".join(products) if products else "additional products"
            action = f"Reach out to introduce {product_str} and schedule a product demo."
            urgency = "Best time to cross-sell is when client momentum is high — act this week."
            points = [
                f"Client growth trajectory suggests readiness for {product_str}.",
                f"Potential additional annual revenue: ${dollar:,.0f}.",
                "Personalise the pitch around their recent business activity.",
            ]

        return {
            "brief_text": brief_text,
            "recommended_action": action,
            "urgency_note": urgency,
            "talking_points": points,
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

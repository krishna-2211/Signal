import json
import logging
import re
from datetime import date, datetime

from backend.core.llm_client import llm_client
from backend.database.db import insert_audit_log

logger = logging.getLogger(__name__)

_AGENT_NAME = "SignalDetectionAgent"

_SYSTEM_PROMPT = """You are a senior credit risk and relationship intelligence analyst at a commercial bank.

DATA SOURCE HIERARCHY:
1. PRIMARY — Internal behavioral data (always available):
   Payment timing drift, transaction volume trends,
   balance changes, login activity, product usage.
   This data ALONE is sufficient to detect signals.

2. SECONDARY — FRED macro indicators (when available):
   Use to strengthen or add sector-wide context to
   a signal already detected from internal data.
   Example: credit stress detected internally + FRED shows sector declining = HIGH confidence.
   Do NOT use absence of FRED data to downgrade a signal.

3. TERTIARY — News headlines (when available):
   Use to add specific recent events as supporting evidence.
   Absence of news does NOT mean no signal.

DETECTION RULES:
- Detect signals from internal data FIRST
- Use external data only to CONFIRM or STRENGTHEN
- Never return 'none' if internal thresholds are met
- Never downgrade a signal because external data is missing

CREDIT STRESS — flag if internal data shows ANY of:
  payment_drift_direction = 'worsening'
  avg_days_late_recent > 5
  volume_trend_pct < -15
  balance_change_pct < -20

CHURN RISK — flag if internal data shows ANY of:
  days_since_last_login > 20
  login_trend = 'declining'
  volume_trend_pct < -25
  balance_change_pct < -30

UPSELL OPPORTUNITY — flag if internal data shows ANY of:
  volume_trend_pct > 20
  balance_change_pct > 30
  login_frequency_last_30d high and stable
  active_products < 3 AND growth signals present

SEVERITY CALIBRATION with external data:
  Signal detected internally only → LOW or MEDIUM
  Signal + FRED trend confirms → bump up one level
  Signal + News headline confirms → bump up one level
  Signal + both FRED and News confirm → HIGH

CRITICAL: primary_signal must be exactly one of these four values:
churn_risk, credit_stress, upsell_opportunity, or none. Never use any other value.

Respond only in valid JSON. No explanation outside the JSON."""

_SAFE_DEFAULT = {
    "churn_risk_score": 0,
    "credit_stress_score": 0,
    "upsell_opportunity_score": 0,
    "primary_signal": "none",
    "severity": "NONE",
    "reasoning": "Signal detection unavailable — LLM response could not be parsed.",
    "key_indicators": [],
}


def _fmt(value, fallback: str = "N/A") -> str:
    """Format a potentially-None metric value for prompt insertion."""
    if value is None:
        return fallback
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


class SignalDetectionAgent:
    async def run(self, client_data: dict, external_context: dict) -> dict:
        client = client_data["client"]
        metrics = client_data["derived_metrics"]
        client_id = client["id"]

        self._audit(client_id, "started", "Signal detection started")

        user_prompt = self._build_user_prompt(client, metrics, external_context)

        raw_response = ""
        try:
            raw_response = await llm_client.complete(_SYSTEM_PROMPT, user_prompt)
            result = self._parse_response(raw_response, client_id)
        except Exception as exc:
            logger.exception("SignalDetectionAgent LLM call failed for client %s", client_id)
            self._audit(client_id, "error", str(exc))
            result = dict(_SAFE_DEFAULT)

        result["raw_response"] = raw_response
        self._audit(
            client_id,
            "completed",
            f"Signal detected: {result['primary_signal']} / {result['severity']}",
        )
        return result

    # --------------------------------------------------------------------------
    # Prompt construction
    # --------------------------------------------------------------------------

    def _build_user_prompt(
        self, client: dict, metrics: dict, external_context: dict
    ) -> str:
        drift_trend = metrics.get("payment_drift_trend")
        drift_str = (
            ", ".join(str(d) for d in drift_trend)
            if drift_trend
            else "no payment history"
        )

        news = external_context.get("news_headlines", [])
        news_str = (
            "\n".join(f"  - {a['title']}" for a in news if a.get("title"))
            if news
            else "  None available"
        )

        macro = external_context.get("macro_indicator", {})
        if macro:
            macro_str = (
                f"{macro.get('series_id', 'N/A')} — latest: {_fmt(macro.get('latest_value'))}, "
                f"previous: {_fmt(macro.get('previous_value'))}, "
                f"trend: {macro.get('trend', 'N/A')}"
            )
        else:
            macro_str = "No macro data available"

        return f"""Analyze the following commercial banking client and return the JSON signal assessment.

CLIENT PROFILE
  Name:      {client.get('name', 'N/A')}
  Industry:  {client.get('industry', 'N/A')}
  Location:  {client.get('location', 'N/A')}
  Loan Balance: ${_fmt(client.get('loan_balance'))}
  Products Held: {client.get('products', 'N/A')}

BEHAVIORAL METRICS
  Transaction volume trend (last 4w vs prior 8w): {_fmt(metrics.get('volume_trend_pct'))}%
  Payment drift direction: {_fmt(metrics.get('payment_drift_direction'))}
  Avg days late (recent 3 payments): {_fmt(metrics.get('avg_days_late_recent'))}
  Payment drift trend (days late, chronological): [{drift_str}]
  Days since last login: {_fmt(metrics.get('days_since_last_login'))}
  Login trend: {_fmt(metrics.get('login_trend'))}
  Balance change (last 3 months): {_fmt(metrics.get('balance_change_pct'))}%

EXTERNAL SIGNALS
  Recent news headlines:
{news_str}

  Macro indicator: {macro_str}

Respond with exactly this JSON structure and no other text:
{{
  "churn_risk_score": <0-100>,
  "credit_stress_score": <0-100>,
  "upsell_opportunity_score": <0-100>,
  "primary_signal": "<churn_risk|credit_stress|upsell_opportunity|none>",
  "severity": "<HIGH|MEDIUM|LOW|NONE>",
  "reasoning": "<2-3 sentences explaining the detected signals>",
  "key_indicators": ["<indicator 1>", "<indicator 2>", "<indicator 3>"]
}}"""

    # --------------------------------------------------------------------------
    # Response parsing
    # --------------------------------------------------------------------------

    _VALID_SIGNALS = {"churn_risk", "credit_stress", "upsell_opportunity", "none"}

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

        # Remove single quote pairs — safe because valid JSON never uses single
        # quotes; they only appear as Ollama emphasis artifacts
        text = re.sub(r"'([^']*)'", r'\1', text)

        # Fix ) used in place of ] to close arrays before a closing brace
        text = re.sub(r'"\s*\)\s*\n?\s*\}', '"]\n}', text)
        text = re.sub(r"'\s*\)\s*\n?\s*\}", "']\n}", text)
        text = re.sub(r'\)\s*\n?\s*\}', ']\n}', text)

        # Strip trailing commas before closing } or ]
        text = re.sub(r",\s*([}\]])", r"\1", text)

        # Replace explicit JSON null for numeric score fields with 0 so
        # int() conversion in _parse_response never receives None
        text = re.sub(
            r'("(?:churn_risk_score|credit_stress_score|upsell_opportunity_score)"\s*:\s*)null',
            r'\g<1>0',
            text,
        )

        # Balance square brackets before braces (arrays are nested inside the object)
        open_brackets = text.count("[")
        close_brackets = text.count("]")
        if open_brackets > close_brackets:
            text += "]" * (open_brackets - close_brackets)

        # Close any unclosed braces (handles truncated responses)
        open_braces = text.count("{")
        close_braces = text.count("}")
        if open_braces > close_braces:
            text += "}" * (open_braces - close_braces)

        # Fix malformed key_indicators items produced by Ollama where an array
        # item is split across a quoted token and bare text, e.g.:
        #   ["-0.38" balance change]  →  ["-0.38 balance change"]
        text = re.sub(
            r'"key_indicators"\s*:\s*\[[^\]]*\]',
            lambda m: re.sub(
                r'"([^"]+)"\s+([^,\[\]"]+)',
                lambda i: f'"{i.group(1)} {i.group(2).strip()}"',
                m.group(0),
            ),
            text,
        )

        return text

    def _regex_fallback(self, raw: str, client_id: str) -> dict:
        """Best-effort field extraction when full JSON parse fails."""
        result = dict(_SAFE_DEFAULT)

        m = re.search(r'"primary_signal"\s*:\s*"([^"]+)"', raw)
        if m:
            val = m.group(1).strip()
            result["primary_signal"] = val if val in self._VALID_SIGNALS else "none"

        m = re.search(r'"severity"\s*:\s*"([^"]+)"', raw)
        if m:
            result["severity"] = m.group(1).strip().upper()

        for field in ("churn_risk_score", "credit_stress_score", "upsell_opportunity_score"):
            m = re.search(rf'"{field}"\s*:\s*(\d+)', raw)
            if m:
                result[field] = int(m.group(1))

        m = re.search(r'"reasoning"\s*:\s*"([^"]+)"', raw)
        if m:
            result["reasoning"] = m.group(1)

        logger.warning(
            "SignalDetectionAgent used regex fallback for client %s — extracted: %s",
            client_id, result["primary_signal"],
        )
        return result

    def _parse_response(self, raw: str, client_id: str) -> dict:
        text = self._clean_json(raw.strip())

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.warning(
                "SignalDetectionAgent JSON parse failed for client %s: %s\nRaw response: %s",
                client_id, exc, raw,
            )
            return self._regex_fallback(raw, client_id)

        signal_raw = (parsed.get("primary_signal") or "none").lower().strip()

        if signal_raw.startswith("upsell") or signal_raw.startswith("ups") or signal_raw.startswith("upa"):
            signal_raw = "upsell_opportunity"
        elif signal_raw.startswith("credit") or signal_raw.startswith("cred"):
            signal_raw = "credit_stress"
        elif signal_raw.startswith("churn") or signal_raw.startswith("chu"):
            signal_raw = "churn_risk"
        elif signal_raw not in self._VALID_SIGNALS:
            logger.warning(
                "SignalDetectionAgent got invalid primary_signal '%s' for client %s — defaulting to 'none'",
                signal_raw, client_id,
            )
            signal_raw = "none"

        return {
            "churn_risk_score": int(parsed.get("churn_risk_score") or 0),
            "credit_stress_score": int(parsed.get("credit_stress_score") or 0),
            "upsell_opportunity_score": int(parsed.get("upsell_opportunity_score") or 0),
            "primary_signal": signal_raw,
            "severity": parsed.get("severity", "NONE"),
            "reasoning": parsed.get("reasoning", ""),
            "key_indicators": parsed.get("key_indicators", []),
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

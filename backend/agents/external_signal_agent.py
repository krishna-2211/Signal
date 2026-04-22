import logging
from datetime import date, datetime

import httpx

from backend.config import settings
from backend.database.db import insert_audit_log

logger = logging.getLogger(__name__)

_AGENT_NAME = "ExternalSignalAgent"
_TIMEOUT = 10  # seconds

_INDUSTRY_NEWS_QUERY: dict[str, str] = {
    "Restaurant & Food Service":      "restaurant industry",
    "Logistics & Supply Chain":       "logistics freight",
    "Retail":                         "retail sales",
    "Construction":                   "construction industry",
    "Technology":                     "technology sector",
    "Manufacturing":                  "manufacturing industry",
    "Real Estate":                    "commercial real estate",
    "Agriculture":                    "agriculture farming",
    "Automotive":                     "automotive industry",
    "Energy":                         "energy sector oil",
    "Healthcare":                     "healthcare industry",
    "Education":                      "education sector",
    "Biotechnology":                  "biotech pharma",
    "Legal Services":                 "legal services",
    "Import & Export":                "trade tariffs import export",
    "Health & Fitness":               "fitness wellness",
    "Pharmaceuticals":                "pharmaceutical industry",
    "Food & Beverage Manufacturing":  "food beverage industry",
    "Media & Entertainment":          "media entertainment",
}
_NEWS_DEFAULT = "business economy news"

_INDUSTRY_TO_FRED: dict[str, str] = {
    "Restaurant & Food Service": "RRSFS",
    "Logistics & Supply Chain": "TSIFRGHT",
    "Retail": "RSXFS",
    "Construction": "TTLCONS",
    "Technology": "NASDAQCOM",
    "Manufacturing": "IPMAN",
    "Real Estate": "HOUST",
    "Agriculture": "WPU01",
    "Automotive": "TOTALSA",
    "Energy": "DCOILWTICO",
}
_FRED_DEFAULT = "GDPC1"


class ExternalSignalAgent:
    async def run(self, client: dict) -> dict:
        client_id = client["id"]
        industry = client.get("industry", "")
        location = client.get("location", "")

        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            # NewsAPI disabled - rate limited
            news = []
            macro = await self._fetch_fred(http, industry)

        external_data_available = bool(news or macro)

        self._audit(
            client_id,
            "completed",
            f"External signals fetched — news={len(news)} articles, "
            f"macro={'yes' if macro else 'no'}",
        )

        return {
            "news_headlines": news,
            "macro_indicator": macro,
            "external_data_available": external_data_available,
        }

    # --------------------------------------------------------------------------
    # NewsAPI
    # --------------------------------------------------------------------------

    async def _fetch_news(
        self, http: httpx.AsyncClient, industry: str
    ) -> list[dict]:
        if not settings.NEWS_API_KEY:
            logger.warning("NEWS_API_KEY not set — skipping news fetch")
            return []

        query = _INDUSTRY_NEWS_QUERY.get(industry, _NEWS_DEFAULT)
        params = {
            "q": query,
            "apiKey": settings.NEWS_API_KEY,
            "pageSize": 3,
            "sortBy": "publishedAt",
            "language": "en",
        }

        try:
            resp = await http.get("https://newsapi.org/v2/everything", params=params)
            resp.raise_for_status()
            articles = resp.json().get("articles", [])
            return [
                {
                    "title": a.get("title"),
                    "description": a.get("description"),
                    "published_at": a.get("publishedAt"),
                    "source": a.get("source", {}).get("name"),
                }
                for a in articles[:3]
            ]
        except Exception as exc:
            logger.warning("NewsAPI call failed: %s", exc)
            return []

    # --------------------------------------------------------------------------
    # FRED
    # --------------------------------------------------------------------------

    async def _fetch_fred(
        self, http: httpx.AsyncClient, industry: str
    ) -> dict:
        if not settings.FRED_API_KEY:
            logger.warning("FRED_API_KEY not set — skipping macro fetch")
            return {}

        series_id = _INDUSTRY_TO_FRED.get(industry, _FRED_DEFAULT)
        params = {
            "series_id": series_id,
            "api_key": settings.FRED_API_KEY,
            "sort_order": "desc",
            "limit": 3,
            "file_type": "json",
        }

        try:
            resp = await http.get(
                "https://api.stlouisfed.org/fred/series/observations",
                params=params,
            )
            resp.raise_for_status()
            observations = resp.json().get("observations", [])

            # FRED returns desc order: [0] = latest, [1] = previous
            values = []
            for obs in observations:
                raw = obs.get("value", ".")
                if raw != ".":  # FRED uses "." for missing data
                    try:
                        values.append(float(raw))
                    except ValueError:
                        pass

            if not values:
                return {}

            latest = values[0]
            previous = values[1] if len(values) > 1 else None

            if previous is None or latest == previous:
                trend = "flat"
            elif latest > previous:
                trend = "up"
            else:
                trend = "down"

            return {
                "series_id": series_id,
                "latest_value": latest,
                "previous_value": previous,
                "trend": trend,
                "unit": observations[0].get("units") if observations else None,
            }
        except Exception as exc:
            logger.warning("FRED API call failed for series %s: %s", series_id, exc)
            return {}

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

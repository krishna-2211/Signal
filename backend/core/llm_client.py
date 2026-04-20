import asyncio
import logging

import google.generativeai as genai
import httpx
from openai import AsyncOpenAI

from backend.config import settings

logger = logging.getLogger(__name__)

_GEMINI_MODEL  = "gemini-2.0-flash"
_OPENAI_MODEL  = "gpt-4o-mini"
_TIMEOUT       = 30   # seconds — cloud providers
_OLLAMA_TIMEOUT = 120  # seconds — local models are slower


class LLMClient:
    def __init__(self) -> None:
        self._provider = settings.LLM_PROVIDER.lower()
        self._logged = False

        if self._provider == "gemini":
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._gemini_model = genai.GenerativeModel(_GEMINI_MODEL)
        elif self._provider == "openai":
            self._openai = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                timeout=_TIMEOUT,
            )
        elif self._provider == "ollama":
            self._ollama_url = (
                f"{settings.OLLAMA_BASE_URL.rstrip('/')}/v1/chat/completions"
            )
            self._ollama_model = settings.OLLAMA_MODEL
        else:
            raise ValueError(
                f"Unrecognized LLM_PROVIDER '{self._provider}'. "
                "Supported values: 'gemini', 'openai', 'ollama'."
            )

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        if not self._logged:
            logger.info("LLMClient using provider: %s", self._provider)
            self._logged = True

        if self._provider == "gemini":
            return await self._complete_gemini(system_prompt, user_prompt)
        if self._provider == "ollama":
            return await self._complete_ollama(system_prompt, user_prompt)
        return await self._complete_openai(system_prompt, user_prompt)

    async def _complete_gemini(self, system_prompt: str, user_prompt: str) -> str:
        combined = f"{system_prompt}\n\n{user_prompt}"
        try:
            response = await asyncio.wait_for(
                self._gemini_model.generate_content_async(combined),
                timeout=_TIMEOUT,
            )
            return response.text
        except Exception as exc:
            # 429 ResourceExhausted — back off 60 s and retry once
            if "429" in str(exc) or "ResourceExhausted" in type(exc).__name__:
                logger.warning("Gemini 429 rate limit hit — waiting 60 s before retry")
                await asyncio.sleep(60)
                response = await asyncio.wait_for(
                    self._gemini_model.generate_content_async(combined),
                    timeout=_TIMEOUT,
                )
                return response.text
            raise

    async def _complete_openai(self, system_prompt: str, user_prompt: str) -> str:
        response = await self._openai.chat.completions.create(
            model=_OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content

    async def _complete_ollama(self, system_prompt: str, user_prompt: str) -> str:
        payload = {
            "model": self._ollama_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            "stream": False,
            "options": {
                "num_predict": 1024,
                "temperature": 0.1,
            },
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0)) as http:
            response = await http.post(self._ollama_url, json=payload)
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]


llm_client = LLMClient()

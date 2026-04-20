import os
import warnings
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class Settings:
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
    NEWS_API_KEY: str | None = os.getenv("NEWS_API_KEY")
    FRED_API_KEY: str | None = os.getenv("FRED_API_KEY")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "gemini")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    DB_PATH: str = str(
        (Path(__file__).resolve().parent.parent / os.getenv("DB_PATH", "backend/data/signal.db"))
    )


settings = Settings()

if not settings.GEMINI_API_KEY:
    warnings.warn(
        "GEMINI_API_KEY is not set. The application will not function correctly.",
        stacklevel=1,
    )

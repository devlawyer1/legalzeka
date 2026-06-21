from __future__ import annotations

import os
from dataclasses import dataclass


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://hukuk_ai:local_dev_password@localhost:5433/hukuk_ai",
    )
    embedding_base_url: str = os.getenv("EMBEDDING_BASE_URL", "http://localhost:8080")
    embedding_enabled: bool = _bool_env("EMBEDDING_ENABLED", False)
    request_delay_ms: int = int(os.getenv("REQUEST_DELAY_MS", "1500"))
    request_delay_jitter_ms: int = int(os.getenv("REQUEST_DELAY_JITTER_MS", "1000"))
    max_pages_per_run: int = int(os.getenv("MAX_PAGES_PER_RUN", "1"))
    bedesten_phrase: str = os.getenv("BEDESTEN_PHRASE", "karar")
    bedesten_429_sleep_ms: int = int(os.getenv("BEDESTEN_429_SLEEP_MS", "90000"))
    bedesten_page_cooldown_ms: int = int(os.getenv("BEDESTEN_PAGE_COOLDOWN_MS", "10000"))
    mevzuat_mode: str = os.getenv("MEVZUAT_MODE", "priority")
    mevzuat_page_size: int = int(os.getenv("MEVZUAT_PAGE_SIZE", "50"))
    mevzuat_max_records: int = int(os.getenv("MEVZUAT_MAX_RECORDS", "0"))
    chunk_max_chars: int = int(os.getenv("CHUNK_MAX_CHARS", "2200"))
    chunk_overlap_chars: int = int(os.getenv("CHUNK_OVERLAP_CHARS", "220"))


def settings() -> Settings:
    return Settings()

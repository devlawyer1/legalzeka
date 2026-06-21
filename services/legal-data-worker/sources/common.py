from __future__ import annotations

import asyncio
import random
import re
from datetime import date, datetime, timezone
from typing import Any

from bs4 import BeautifulSoup
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from config import settings


retry_http = retry(
    retry=retry_if_exception_type(Exception),
    wait=wait_exponential(multiplier=1, min=2, max=120),
    stop=stop_after_attempt(8),
    reraise=True,
)


async def polite_delay() -> None:
    cfg = settings()
    delay_ms = cfg.request_delay_ms + random.randint(0, cfg.request_delay_jitter_ms)
    await asyncio.sleep(delay_ms / 1000)


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html or "", "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    raw = str(value).strip()
    if not raw:
        return None

    raw = raw.split("T", 1)[0]
    formats = ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y", "%d-%m-%Y")
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            pass

    match = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", raw)
    if match:
        day, month, year = match.groups()
        return date(int(year), int(month), int(day))
    return None


def iso_date(value: datetime | date | None) -> str:
    if value is None:
        value = datetime.now(timezone.utc)
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value.isoformat()


def iso_datetime(value: datetime | date | None, *, end_of_day: bool = False) -> str:
    if value is None:
        value = datetime.now(timezone.utc)
    if isinstance(value, datetime):
        return value.replace(microsecond=0, tzinfo=None).isoformat(timespec="seconds")
    suffix = "T23:59:59" if end_of_day else "T00:00:00"
    return f"{value.isoformat()}{suffix}"


def tr_date(value: datetime | date | None) -> str:
    parsed = parse_date(value)
    return parsed.strftime("%d/%m/%Y") if parsed else ""


def clean_id(value: Any) -> str:
    return re.sub(r"\s+", "-", str(value or "").strip())[:150]


def decision_record(
    *,
    source: str,
    source_doc_id: str,
    raw_text: str,
    raw_html: str | None = None,
    court: str | None = None,
    chamber: str | None = None,
    esas_no: str | None = None,
    karar_no: str | None = None,
    decision_date: Any = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "kind": "decision",
        "source": source,
        "source_doc_id": clean_id(source_doc_id),
        "court": court,
        "chamber": chamber,
        "esas_no": esas_no,
        "karar_no": karar_no,
        "decision_date": parse_date(decision_date),
        "raw_text": raw_text,
        "raw_html": raw_html,
        "metadata": metadata or {},
    }


def legislation_record(
    *,
    law_name: str,
    law_no: str,
    law_type: str,
    source_doc_id: str,
    articles: list[dict[str, str]],
    rg_date: Any = None,
    rg_no: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "kind": "legislation",
        "law_name": law_name,
        "law_no": law_no,
        "law_type": law_type,
        "rg_date": parse_date(rg_date),
        "rg_no": rg_no,
        "source_doc_id": clean_id(source_doc_id),
        "articles": articles,
        "metadata": metadata or {},
    }

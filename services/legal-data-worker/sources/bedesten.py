from __future__ import annotations

import base64
import asyncio
from datetime import date, datetime, timezone
from typing import Any

import httpx

from config import settings
from sources.common import decision_record, html_to_text, iso_datetime, polite_delay, retry_http


BASE_URL = "https://bedesten.adalet.gov.tr"
SEARCH_ENDPOINT = "/emsal-karar/searchDocuments"
DOCUMENT_ENDPOINT = "/emsal-karar/getDocumentContent"

HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "AdaletApplicationName": "UyapMevzuat",
    "Content-Type": "application/json; charset=utf-8",
    "Origin": "https://mevzuat.adalet.gov.tr",
    "Referer": "https://mevzuat.adalet.gov.tr/",
    "User-Agent": "Mozilla/5.0",
}


@retry_http
async def _post(client: httpx.AsyncClient, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(endpoint, json=payload)
    if response.status_code == 429:
        await asyncio.sleep(settings().bedesten_429_sleep_ms / 1000)
    response.raise_for_status()
    data = response.json()
    metadata = data.get("metadata") or {}
    if metadata.get("FMTY") == "ERROR":
        raise RuntimeError(metadata.get("FMTE") or metadata.get("FMU") or "Bedesten API error")
    return data


async def _fetch_document(client: httpx.AsyncClient, document_id: str) -> tuple[str, str | None, dict[str, Any]]:
    payload = {
        "data": {"documentId": document_id},
        "applicationName": "UyapMevzuat",
    }
    await polite_delay()
    data = await _post(client, DOCUMENT_ENDPOINT, payload)
    doc_data = data.get("data") or {}
    encoded = doc_data.get("content") or ""
    mime_type = doc_data.get("mimeType")
    metadata = {"mime_type": mime_type, "document_response_metadata": data.get("metadata", {})}

    if not encoded:
        return "", None, metadata

    raw_bytes = base64.b64decode(encoded)
    if mime_type == "text/html":
        raw_html = raw_bytes.decode("utf-8", errors="replace")
        return html_to_text(raw_html), raw_html, metadata

    return f"[{mime_type or 'unknown'} document: {document_id}]", None, metadata


async def fetch_bedesten_decisions(
    *,
    source: str,
    item_type: str,
    court: str,
    since: datetime,
    until: date | None = None,
    phrase: str = "",
    start_page: int = 1,
    max_pages: int | None = None,
    page_size: int = 10,
) -> list[dict[str, Any]]:
    """Fetch decisions from the Bedesten API extracted from yargi-mcp."""
    cfg = settings()
    phrase = phrase or cfg.bedesten_phrase
    until = until or datetime.now(timezone.utc).date()
    records: list[dict[str, Any]] = []

    async with httpx.AsyncClient(base_url=BASE_URL, headers=HEADERS, timeout=60) as client:
        page_count = max_pages or cfg.max_pages_per_run
        for page in range(start_page, start_page + page_count):
            payload = {
                "data": {
                    "pageSize": page_size,
                    "pageNumber": page,
                    "itemTypeList": [item_type],
                    "phrase": phrase,
                    "kararTarihiStart": iso_datetime(since),
                    "kararTarihiEnd": iso_datetime(until, end_of_day=True),
                    "sortFields": ["KARAR_TARIHI"],
                    "sortDirection": "desc",
                },
                "applicationName": "UyapMevzuat",
                "paging": True,
            }
            await polite_delay()
            data = await _post(client, SEARCH_ENDPOINT, payload)
            items = ((data.get("data") or {}).get("emsalKararList")) or []
            if not items:
                break

            for item in items:
                document_id = item.get("documentId")
                if not document_id:
                    continue
                raw_text, raw_html, doc_meta = await _fetch_document(client, document_id)
                metadata = {**item, **doc_meta}
                records.append(
                    decision_record(
                        source=source,
                        source_doc_id=document_id,
                        court=court,
                        chamber=item.get("birimAdi"),
                        esas_no=item.get("esasNo"),
                        karar_no=item.get("kararNo"),
                        decision_date=item.get("kararTarihiStr") or item.get("kararTarihi"),
                        raw_text=raw_text,
                        raw_html=raw_html,
                        metadata=metadata,
                    )
                )
    return records

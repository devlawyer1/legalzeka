from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from config import settings
from sources.common import decision_record, html_to_text, polite_delay, retry_http, tr_date


BASE_URL = "https://karararama.danistay.gov.tr"
DETAILED_SEARCH_ENDPOINT = "/aramadetaylist"
DOCUMENT_ENDPOINT = "/getDokuman"


def _items_from_response(data: dict[str, Any]) -> list[dict[str, Any]]:
    container = data.get("data") or {}
    if isinstance(container, dict):
        items = container.get("data") or container.get("list") or []
    elif isinstance(container, list):
        items = container
    else:
        items = []
    return items if isinstance(items, list) else []


@retry_http
async def _post(client: httpx.AsyncClient, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(endpoint, json=payload)
    if response.status_code == 429:
        await polite_delay()
    response.raise_for_status()
    return response.json()


@retry_http
async def _get_document(client: httpx.AsyncClient, document_id: str) -> str:
    query = urlencode({"id": document_id, "arananKelime": ""})
    response = await client.get(f"{DOCUMENT_ENDPOINT}?{query}")
    if response.status_code == 429:
        await polite_delay()
    response.raise_for_status()
    return response.text


async def fetch_new(since: datetime) -> list[dict[str, Any]]:
    cfg = settings()
    records: list[dict[str, Any]] = []
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
    }
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers=headers,
        timeout=60,
        verify=False,
        follow_redirects=True,
    ) as client:
        for page in range(1, cfg.max_pages_per_run + 1):
            payload = {
                "data": {
                    "baslangicTarihi": tr_date(since),
                    "bitisTarihi": tr_date(datetime.now(timezone.utc)),
                    "siralama": "1",
                    "siralamaDirection": "desc",
                    "pageSize": 10,
                    "pageNumber": page,
                }
            }
            await polite_delay()
            data = await _post(client, DETAILED_SEARCH_ENDPOINT, payload)
            items = _items_from_response(data)
            if not items:
                break

            for item in items:
                document_id = str(item.get("id") or item.get("documentId") or "")
                if not document_id:
                    continue
                await polite_delay()
                raw_html = await _get_document(client, document_id)
                records.append(
                    decision_record(
                        source="danistay",
                        source_doc_id=document_id,
                        court="Danıştay",
                        chamber=item.get("daire") or item.get("birimAdi"),
                        esas_no=item.get("esasNo") or item.get("esas"),
                        karar_no=item.get("kararNo") or item.get("karar"),
                        decision_date=item.get("kararTarihi") or item.get("kararTarihiStr"),
                        raw_text=html_to_text(raw_html),
                        raw_html=raw_html,
                        metadata=item,
                    )
                )
    return records

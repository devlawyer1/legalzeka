from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import httpx
from bs4 import BeautifulSoup

from config import settings
from sources.common import html_to_text, legislation_record, polite_delay, retry_http


BASE_URL = "https://www.mevzuat.gov.tr"
SEARCH_ENDPOINT = "/Anasayfa/MevzuatDatatable"
IFRAME_ENDPOINT = "/anasayfa/MevzuatFihristDetayIframe"

TARGET_LAWS = [
    ("Turk Ceza Kanunu", "5237"),
    ("Turk Medeni Kanunu", "4721"),
    ("Turk Borclar Kanunu", "6098"),
    ("Hukuk Muhakemeleri Kanunu", "6100"),
    ("Ceza Muhakemesi Kanunu", "5271"),
    ("Is Kanunu", "4857"),
    ("Icra ve Iflas Kanunu", "2004"),
]


def _datatable_columns() -> list[dict[str, Any]]:
    return [
        {"data": None, "name": "", "searchable": True, "orderable": False, "search": {"value": "", "regex": False}},
        {"data": None, "name": "", "searchable": True, "orderable": False, "search": {"value": "", "regex": False}},
        {"data": None, "name": "", "searchable": True, "orderable": False, "search": {"value": "", "regex": False}},
    ]


def _search_payload(token: str, *, start: int, length: int, law_no: str = "") -> dict[str, Any]:
    return {
        "draw": 1,
        "columns": _datatable_columns(),
        "order": [],
        "start": start,
        "length": length,
        "search": {"value": "", "regex": False},
        "parameters": {
            "MevzuatTur": "Kanun",
            "YonetmelikMevzuatTur": "OsmanliKanunu",
            "AranacakIfade": "",
            "TamCumle": "false",
            "AranacakYer": "1",
            "MevzuatNo": law_no,
            "KurumId": "0",
            "AltKurumId": "0",
            "BaslangicTarihi": "",
            "BitisTarihi": "",
            "antiforgerytoken": token,
        },
    }


@retry_http
async def _get(client: httpx.AsyncClient, url: str, params: dict[str, str] | None = None) -> httpx.Response:
    response = await client.get(url, params=params)
    if response.status_code == 429:
        await polite_delay()
    response.raise_for_status()
    return response


@retry_http
async def _post(client: httpx.AsyncClient, url: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = await client.post(url, json=payload)
    if response.status_code == 429:
        await polite_delay()
    response.raise_for_status()
    return response.json()


def _extract_token(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    token = soup.find("input", {"name": "__RequestVerificationToken"})
    return token.get("value", "") if token else ""


async def _search_law(client: httpx.AsyncClient, token: str, law_no: str) -> dict[str, Any] | None:
    await polite_delay()
    data = await _post(client, SEARCH_ENDPOINT, _search_payload(token, start=0, length=10, law_no=law_no))
    rows = data.get("data") or []
    return rows[0] if rows else None


async def _list_all_laws(client: httpx.AsyncClient, token: str, page_size: int, max_records: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page_size = max(1, min(page_size, 100))
    start = 0
    total: int | None = None

    while total is None or start < total:
        await polite_delay()
        data = await _post(client, SEARCH_ENDPOINT, _search_payload(token, start=start, length=page_size))
        page_rows = data.get("data") or []
        if total is None:
            total = int(data.get("recordsFiltered") or data.get("recordsTotal") or len(page_rows))
            print(f"mevzuat list total={total} page_size={page_size}", flush=True)
        if not page_rows:
            break

        rows.extend(page_rows)
        if max_records > 0 and len(rows) >= max_records:
            return rows[:max_records]
        start += len(page_rows)

    return rows


async def _priority_laws(client: httpx.AsyncClient, token: str, max_records: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    target_laws = TARGET_LAWS[:max_records] if max_records > 0 else TARGET_LAWS
    for law_name, law_no in target_laws:
        row = await _search_law(client, token, law_no)
        if row:
            rows.append(row)
        else:
            print(f"mevzuat missing law_no={law_no} name={law_name}", flush=True)
    return rows


def _split_articles(text: str) -> list[dict[str, str]]:
    pattern = re.compile(r"(?im)^\s*(MADDE|Madde)\s+([0-9]+/[A-Z]?[0-9]*|[0-9]+[A-Z]?|[0-9]+/[a-z]|[0-9]+[a-z]?)\s*[-\u2013.]")
    matches = list(pattern.finditer(text))
    if not matches:
        return [{"madde_no": "full", "madde_text": text[:15000]}] if text.strip() else []

    articles: list[dict[str, str]] = []
    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        article_text = text[start:end].strip()
        if article_text:
            articles.append({"madde_no": match.group(2), "madde_text": article_text})
    return articles


async def _fetch_content(client: httpx.AsyncClient, row: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    params = {
        "MevzuatTur": str(row.get("tur") or 1),
        "MevzuatNo": str(row.get("mevzuatNo") or ""),
        "MevzuatTertip": str(row.get("mevzuatTertip") or "5"),
    }
    await polite_delay()
    response = await _get(client, IFRAME_ENDPOINT, params=params)
    raw_html = response.text
    text = html_to_text(raw_html)
    return raw_html, _split_articles(text)


async def fetch_new(since: datetime) -> list[dict[str, Any]]:
    del since
    cfg = settings()
    records: list[dict[str, Any]] = []
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type": "application/json; charset=UTF-8",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
    }
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers=headers,
        timeout=60,
        follow_redirects=True,
    ) as client:
        home = await _get(client, "/")
        token = _extract_token(home.text)

        if cfg.mevzuat_mode.strip().lower() == "all":
            law_rows = await _list_all_laws(client, token, cfg.mevzuat_page_size, cfg.mevzuat_max_records)
        else:
            law_rows = await _priority_laws(client, token, cfg.mevzuat_max_records)

        for idx, row in enumerate(law_rows, start=1):
            law_no = str(row.get("mevzuatNo") or "")
            law_name = str(row.get("mevAdi") or law_no)
            print(f"mevzuat fetch {idx}/{len(law_rows)} no={law_no} name={law_name[:90]}", flush=True)
            raw_html, articles = await _fetch_content(client, row)
            records.append(
                legislation_record(
                    law_name=law_name,
                    law_no=law_no,
                    law_type="Kanun",
                    rg_date=row.get("resmiGazeteTarihi"),
                    rg_no=row.get("resmiGazeteSayisi"),
                    source_doc_id=f"kanun-{law_no}",
                    articles=articles,
                    metadata={**row, "raw_html_length": len(raw_html)},
                )
            )
    return records

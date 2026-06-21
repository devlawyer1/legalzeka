from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from config import settings
from sources.common import decision_record, html_to_text, polite_delay, retry_http, tr_date


BASE_URL = "https://normkararlarbilgibankasi.anayasa.gov.tr"
SEARCH_ENDPOINT = "/Ara"


@retry_http
async def _get(client: httpx.AsyncClient, url: str, params: list[tuple[str, str]] | None = None) -> str:
    response = await client.get(url, params=params)
    if response.status_code == 429:
        await polite_delay()
    response.raise_for_status()
    return response.text


def _summary_items(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    items: list[dict[str, Any]] = []
    for div in soup.find_all("div", class_="birkarar"):
        link = div.find("a", href=True)
        title = div.find("div", class_="bkararbaslik")
        info = div.find("div", class_="kararbilgileri")
        info_parts = [part.strip() for part in info.get_text("|", strip=True).split("|")] if info else []
        title_text = title.get_text(" ", strip=True) if title else ""
        esas = None
        karar = None
        match = re.search(r"E\.\s*([\d/]+)\s*,\s*K\.\s*([\d/]+)", title_text)
        if match:
            esas, karar = match.groups()
        items.append(
            {
                "url": urljoin(BASE_URL, link["href"]) if link else "",
                "title": title_text,
                "esas_no": esas,
                "karar_no": karar,
                "decision_date": info_parts[3].replace("Karar Tarihi:", "").strip()
                if len(info_parts) > 3
                else "",
                "summary": info_parts,
            }
        )
    return items


async def fetch_new(since: datetime) -> list[dict[str, Any]]:
    cfg = settings()
    records: list[dict[str, Any]] = []
    headers = {"Accept": "text/html,*/*", "Accept-Language": "tr-TR,tr;q=0.9", "User-Agent": "Mozilla/5.0"}
    async with httpx.AsyncClient(
        base_url=BASE_URL,
        headers=headers,
        timeout=60,
        follow_redirects=True,
    ) as client:
        for page in range(1, cfg.max_pages_per_run + 1):
            params = [("KararTarihiIlk", tr_date(since))]
            if page > 1:
                params.append(("page", str(page)))
            await polite_delay()
            search_html = await _get(client, SEARCH_ENDPOINT, params=params)
            summaries = _summary_items(search_html)
            if not summaries:
                break

            for item in summaries:
                if not item["url"]:
                    continue
                await polite_delay()
                raw_html = await _get(client, item["url"])
                records.append(
                    decision_record(
                        source="aym_norm",
                        source_doc_id=item["url"],
                        court="Anayasa Mahkemesi",
                        chamber="Norm Denetimi",
                        esas_no=item.get("esas_no"),
                        karar_no=item.get("karar_no"),
                        decision_date=item.get("decision_date"),
                        raw_text=html_to_text(raw_html),
                        raw_html=raw_html,
                        metadata=item,
                    )
                )
    return records

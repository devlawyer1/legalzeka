from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from config import settings
from sources.common import decision_record, html_to_text, polite_delay, retry_http


BASE_URL = "https://kararlarbilgibankasi.anayasa.gov.tr"
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
    for div in soup.find_all("div", class_="KararBulteniBirKarar"):
        link = div.find("a", href=True)
        title = div.find("h4")
        details = div.get_text("|", strip=True)
        ref_no = link.get_text(strip=True) if link else ""
        decision_date = ""
        match = re.search(r"Karar Tarihi\s*:\s*(\d{1,2}/\d{1,2}/\d{4})", details)
        if match:
            decision_date = match.group(1)
        items.append(
            {
                "url": urljoin(BASE_URL, link["href"]) if link else "",
                "title": title.get_text(" ", strip=True) if title else "",
                "reference_no": ref_no,
                "decision_date": decision_date,
                "summary": details,
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
            params = [("KararBulteni", "1")]
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
                        source="aym_bireysel",
                        source_doc_id=item["url"],
                        court="Anayasa Mahkemesi",
                        chamber="Bireysel Başvuru",
                        esas_no=item.get("reference_no"),
                        karar_no=None,
                        decision_date=item.get("decision_date"),
                        raw_text=html_to_text(raw_html),
                        raw_html=raw_html,
                        metadata=item,
                    )
                )
    return records

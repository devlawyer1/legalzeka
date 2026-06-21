from __future__ import annotations

from datetime import datetime

from sources.bedesten import fetch_bedesten_decisions


async def fetch_new(since: datetime) -> list[dict]:
    return await fetch_bedesten_decisions(
        source="bedesten_bam",
        item_type="ISTINAFHUKUK",
        court="Bölge Adliye Mahkemesi",
        since=since,
    )

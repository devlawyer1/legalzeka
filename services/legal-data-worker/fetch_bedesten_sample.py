from __future__ import annotations

import argparse
import asyncio
import math
import time
from datetime import datetime, timedelta, timezone

import psycopg

from config import settings
from embedding import ingest_records
from ingestion import update_log
from sources.bedesten import fetch_bedesten_decisions


SOURCE_CONFIG = {
    "bedesten_yargitay": ("YARGITAYKARARI", "Yargıtay"),
    "bedesten_bam": ("ISTINAFHUKUK", "Bölge Adliye Mahkemesi"),
}


async def main_async() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="bedesten_yargitay", choices=sorted(SOURCE_CONFIG))
    parser.add_argument("--target", type=int, default=500)
    parser.add_argument("--years", type=int, default=5)
    parser.add_argument("--page-size", type=int, default=10)
    args = parser.parse_args()

    cfg = settings()
    item_type, court = SOURCE_CONFIG[args.source]
    since = datetime.now(timezone.utc) - timedelta(days=365 * args.years)
    page_count = math.ceil(args.target / args.page_size)
    saved_total = 0
    started = time.perf_counter()

    with psycopg.connect(cfg.database_url) as conn:
        for page in range(1, page_count + 1):
            records = await fetch_bedesten_decisions(
                source=args.source,
                item_type=item_type,
                court=court,
                since=since,
                start_page=page,
                max_pages=1,
                page_size=args.page_size,
            )
            if not records:
                print(f"page={page} records=0 stopping", flush=True)
                break
            if saved_total + len(records) > args.target:
                records = records[: args.target - saved_total]
            saved = await ingest_records(conn, records)
            saved_total += saved
            elapsed_s = time.perf_counter() - started
            print(
                f"progress source={args.source} page={page}/{page_count} "
                f"saved_total={saved_total}/{args.target} elapsed_s={elapsed_s:.2f}",
                flush=True,
            )
            if saved_total >= args.target:
                break
            await asyncio.sleep(cfg.bedesten_page_cooldown_ms / 1000)
        update_log(conn, args.source, status="sample_ok", count=saved_total)

    elapsed_s = time.perf_counter() - started
    print(f"sample complete source={args.source} saved={saved_total} elapsed_s={elapsed_s:.2f}", flush=True)


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()

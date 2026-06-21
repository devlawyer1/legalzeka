from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from config import settings
from embedding import ingest_records


SOURCES = {
    "bedesten_yargitay",
    "bedesten_bam",
    "danistay",
    "aym_norm",
    "aym_bireysel",
    "mevzuat",
}


def _source_module(source: str):
    if source not in SOURCES:
        raise ValueError(f"Unsupported source: {source}. Valid sources: {', '.join(sorted(SOURCES))}")
    return importlib.import_module(f"sources.{source}")


def get_last_synced_at(conn: psycopg.Connection, source: str) -> datetime | None:
    with conn.cursor() as cur:
        cur.execute("SELECT last_synced_at FROM ingestion_log WHERE source = %s", (source,))
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def update_log(
    conn: psycopg.Connection,
    source: str,
    *,
    status: str,
    count: int = 0,
    synced_at: datetime | None = None,
    cursor: dict[str, Any] | None = None,
) -> None:
    synced_at = synced_at or datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ingestion_log (
                source, last_synced_at, last_run_status,
                records_fetched_last_run, last_cursor, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, now())
            ON CONFLICT (source) DO UPDATE
            SET last_synced_at = EXCLUDED.last_synced_at,
                last_run_status = EXCLUDED.last_run_status,
                records_fetched_last_run = EXCLUDED.records_fetched_last_run,
                last_cursor = ingestion_log.last_cursor || EXCLUDED.last_cursor,
                updated_at = now()
            """,
            (source, synced_at, status, count, Jsonb(cursor or {})),
        )
    conn.commit()


async def run_source(source: str, since: datetime) -> int:
    module = _source_module(source)
    records = await module.fetch_new(since)
    cfg = settings()
    with psycopg.connect(cfg.database_url) as conn:
        saved = await ingest_records(conn, records)
        update_log(conn, source, status="ok", count=saved)
    return saved


async def run_backfill(source: str, years: int) -> int:
    cfg = settings()
    fallback_since = datetime.now(timezone.utc) - timedelta(days=365 * years)
    with psycopg.connect(cfg.database_url) as conn:
        since = get_last_synced_at(conn, source) or fallback_since
        update_log(conn, source, status="running", count=0, synced_at=since)
    return await run_source(source, since)


async def run_delta(source: str) -> int:
    cfg = settings()
    fallback_since = datetime.now(timezone.utc) - timedelta(days=1)
    with psycopg.connect(cfg.database_url) as conn:
        since = get_last_synced_at(conn, source) or fallback_since
        update_log(conn, source, status="running", count=0, synced_at=since)
    return await run_source(source, since)

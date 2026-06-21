from __future__ import annotations

import json
import re
from typing import Any

import httpx
import psycopg
from psycopg.types.json import Jsonb

from config import settings


def _vector_literal(vector: list[float] | None) -> str | None:
    if vector is None:
        return None
    return "[" + ",".join(f"{float(value):.8f}" for value in vector) + "]"


def chunk_text(text: str) -> list[str]:
    cfg = settings()
    text = re.sub(r"\n{3,}", "\n\n", (text or "").strip())
    if not text:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if not current:
            current = paragraph
            continue
        if len(current) + len(paragraph) + 2 <= cfg.chunk_max_chars:
            current = f"{current}\n\n{paragraph}"
            continue
        chunks.append(current)
        overlap = current[-cfg.chunk_overlap_chars :] if cfg.chunk_overlap_chars > 0 else ""
        current = f"{overlap}\n\n{paragraph}".strip()
    if current:
        chunks.append(current)
    return chunks


async def embed_texts(texts: list[str], *, prefix: str) -> list[list[float] | None]:
    cfg = settings()
    if not texts:
        return []
    if not cfg.embedding_enabled:
        return [None for _ in texts]

    inputs = [prefix + text for text in texts]
    async with httpx.AsyncClient(base_url=cfg.embedding_base_url, timeout=120) as client:
        response = await client.post("/embed", json={"inputs": inputs})
        response.raise_for_status()
        payload = response.json()

    if isinstance(payload, dict):
        payload = payload.get("embeddings") or payload.get("data") or []
    vectors: list[list[float] | None] = []
    for item in payload:
        if isinstance(item, dict):
            vectors.append(item.get("embedding"))
        else:
            vectors.append(item)
    if len(vectors) != len(texts):
        raise ValueError(f"Embedding response length mismatch: {len(vectors)} != {len(texts)}")
    return vectors


def _jsonb(data: dict[str, Any]) -> Jsonb:
    return Jsonb(json.loads(json.dumps(data, default=str, ensure_ascii=False)))


def _upsert_decision(conn: psycopg.Connection, record: dict[str, Any]) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO decisions (
                source, court, chamber, esas_no, karar_no, decision_date,
                raw_text, raw_html, source_doc_id, metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source, source_doc_id) DO UPDATE
            SET court = EXCLUDED.court,
                chamber = EXCLUDED.chamber,
                esas_no = EXCLUDED.esas_no,
                karar_no = EXCLUDED.karar_no,
                decision_date = EXCLUDED.decision_date,
                raw_text = EXCLUDED.raw_text,
                raw_html = EXCLUDED.raw_html,
                metadata = EXCLUDED.metadata,
                fetched_at = now()
            RETURNING id
            """,
            (
                record["source"],
                record.get("court"),
                record.get("chamber"),
                record.get("esas_no"),
                record.get("karar_no"),
                record.get("decision_date"),
                record["raw_text"],
                record.get("raw_html"),
                record["source_doc_id"],
                _jsonb(record.get("metadata") or {}),
            ),
        )
        return str(cur.fetchone()[0])


def _replace_decision_chunks(
    conn: psycopg.Connection,
    decision_id: str,
    chunks: list[str],
    vectors: list[list[float] | None],
) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM decision_chunks WHERE decision_id = %s", (decision_id,))
        for index, (chunk, vector) in enumerate(zip(chunks, vectors)):
            cur.execute(
                """
                INSERT INTO decision_chunks (decision_id, chunk_index, chunk_text, embedding)
                VALUES (%s, %s, %s, %s::vector)
                """,
                (decision_id, index, chunk, _vector_literal(vector)),
            )


def _upsert_legislation(conn: psycopg.Connection, record: dict[str, Any]) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO legislation (
                law_name, law_no, law_type, rg_date, rg_no, source_doc_id, metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_doc_id) DO UPDATE
            SET law_name = EXCLUDED.law_name,
                law_no = EXCLUDED.law_no,
                law_type = EXCLUDED.law_type,
                rg_date = EXCLUDED.rg_date,
                rg_no = EXCLUDED.rg_no,
                metadata = EXCLUDED.metadata,
                fetched_at = now()
            RETURNING id
            """,
            (
                record.get("law_name"),
                record.get("law_no"),
                record.get("law_type"),
                record.get("rg_date"),
                record.get("rg_no"),
                record["source_doc_id"],
                _jsonb(record.get("metadata") or {}),
            ),
        )
        return str(cur.fetchone()[0])


def _replace_articles(
    conn: psycopg.Connection,
    legislation_id: str,
    articles: list[dict[str, str]],
    vectors: list[list[float] | None],
) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM legislation_articles WHERE legislation_id = %s", (legislation_id,))
        for article, vector in zip(articles, vectors):
            cur.execute(
                """
                INSERT INTO legislation_articles (
                    legislation_id, madde_no, madde_text, embedding
                )
                VALUES (%s, %s, %s, %s::vector)
                """,
                (
                    legislation_id,
                    article.get("madde_no"),
                    article.get("madde_text"),
                    _vector_literal(vector),
                ),
            )


async def ingest_records(conn: psycopg.Connection, records: list[dict[str, Any]]) -> int:
    saved = 0
    for record in records:
        if record.get("kind") == "decision":
            chunks = chunk_text(record.get("raw_text") or "")
            vectors = await embed_texts(chunks, prefix="passage: ")
            decision_id = _upsert_decision(conn, record)
            _replace_decision_chunks(conn, decision_id, chunks, vectors)
            saved += 1
        elif record.get("kind") == "legislation":
            articles = [
                article
                for article in record.get("articles", [])
                if (article.get("madde_text") or "").strip()
            ]
            vectors = await embed_texts(
                [article["madde_text"] for article in articles],
                prefix="passage: ",
            )
            legislation_id = _upsert_legislation(conn, record)
            _replace_articles(conn, legislation_id, articles, vectors)
            saved += 1
    conn.commit()
    return saved

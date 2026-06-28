from __future__ import annotations

import json
from typing import Any

import httpx
import psycopg
from psycopg.types.json import Jsonb

from config import settings
from legal_model import (
    article_chunks,
    decision_canonical_key,
    extract_citations,
    legislation_canonical_key,
    official_source,
    sha256,
    source_type,
    structural_chunks,
)


def _vector_literal(vector: list[float] | None) -> str | None:
    if vector is None:
        return None
    return "[" + ",".join(f"{float(value):.8f}" for value in vector) + "]"


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
        vectors.append(item.get("embedding") if isinstance(item, dict) else item)
    if len(vectors) != len(texts):
        raise ValueError(f"Embedding response length mismatch: {len(vectors)} != {len(texts)}")
    for vector in vectors:
        if vector is not None and len(vector) != 1024:
            raise ValueError(f"Legal corpus embeddings must contain 1024 values, received {len(vector)}")
    return vectors


def _jsonb(data: dict[str, Any]) -> Jsonb:
    return Jsonb(json.loads(json.dumps(data, default=str, ensure_ascii=False)))


def _source_state(conn: psycopg.Connection, canonical_key: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.id, s.content_hash, s.official_source,
                   coalesce((SELECT max(o.trust_score) FROM legal_source_origins o WHERE o.legal_source_id = s.id), 0)
            FROM legal_sources s
            WHERE s.canonical_key = %s
            FOR UPDATE
            """,
            (canonical_key,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return {
        "id": str(row[0]),
        "content_hash": row[1],
        "official_source": row[2],
        "trust_score": float(row[3] or 0),
    }


def _should_replace(state: dict[str, Any] | None, content_hash: str, official: bool, trust_score: float) -> bool:
    if state is None:
        return True
    if state["content_hash"] == content_hash:
        return False
    if official and not state["official_source"]:
        return True
    return trust_score >= state["trust_score"]


def _replace_canonical_chunks(
    conn: psycopg.Connection,
    source_id: str,
    chunks: list[dict[str, Any]],
    vectors: list[list[float] | None],
    *,
    effective_from: Any = None,
    effective_to: Any = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM legal_source_citations WHERE source_id = %s", (source_id,))
        cur.execute("DELETE FROM legal_source_chunks WHERE source_id = %s", (source_id,))
        for chunk, vector in zip(chunks, vectors):
            cur.execute(
                """
                INSERT INTO legal_source_chunks (
                    source_id, chunk_type, chunk_index, heading, content,
                    content_hash, chunk_fingerprint, article_number,
                    effective_from, effective_to, embedding, metadata
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, '{}'::jsonb)
                RETURNING id
                """,
                (
                    source_id,
                    chunk["chunk_type"],
                    chunk["chunk_index"],
                    chunk.get("heading"),
                    chunk["content"],
                    chunk["content_hash"],
                    chunk["fingerprint"],
                    chunk.get("article_number"),
                    effective_from,
                    effective_to,
                    _vector_literal(vector),
                ),
            )
            chunk_id = str(cur.fetchone()[0])
            for citation in extract_citations(chunk["content"]):
                cur.execute(
                    """
                    INSERT INTO legal_source_citations (
                        source_id, source_chunk_id, law_name, law_number,
                        article_number, citation_text, citation_hash
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (source_id, citation_hash) DO NOTHING
                    """,
                    (
                        source_id,
                        chunk_id,
                        citation["law_name"],
                        citation["law_number"],
                        citation["article_number"],
                        citation["citation_text"],
                        citation["citation_hash"],
                    ),
                )


def _upsert_normalized_source(
    conn: psycopg.Connection,
    *,
    canonical_key: str,
    content: str,
    chunks: list[dict[str, Any]],
    vectors: list[list[float] | None],
    source_type_name: str,
    title: str,
    source_name: str,
    external_id: str,
    metadata: dict[str, Any],
    court: str | None = None,
    chamber: str | None = None,
    case_number: str | None = None,
    decision_number: str | None = None,
    decision_date: Any = None,
    publication_date: Any = None,
    effective_from: Any = None,
    effective_to: Any = None,
    legal_domain: str | None = None,
    source_url: str | None = None,
    official: bool = False,
    trust_score: float = 0.6,
) -> tuple[str, bool]:
    content_hash = sha256(content)
    state = _source_state(conn, canonical_key)
    replace_content = _should_replace(state, content_hash, official, trust_score)
    with conn.cursor() as cur:
        if state is None:
            cur.execute(
                """
                INSERT INTO legal_sources (
                    source_type, jurisdiction, title, court, chamber,
                    case_number, decision_number, decision_date, publication_date,
                    effective_from, effective_to, legal_domain, source_url,
                    official_source, content, content_hash, canonical_key, metadata
                ) VALUES (%s, 'TR', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    source_type_name,
                    title,
                    court,
                    chamber,
                    case_number,
                    decision_number,
                    decision_date,
                    publication_date,
                    effective_from,
                    effective_to,
                    legal_domain,
                    source_url,
                    official,
                    content,
                    content_hash,
                    canonical_key,
                    _jsonb(metadata),
                ),
            )
            source_id = str(cur.fetchone()[0])
        else:
            source_id = state["id"]
            if replace_content:
                cur.execute(
                    """
                    UPDATE legal_sources
                    SET title = %s, court = %s, chamber = %s, case_number = %s,
                        decision_number = %s, decision_date = %s,
                        publication_date = %s, effective_from = %s, effective_to = %s,
                        legal_domain = %s, source_url = coalesce(%s, source_url),
                        official_source = official_source OR %s, content = %s,
                        content_hash = %s, metadata = metadata || %s, updated_at = now()
                    WHERE id = %s
                    """,
                    (
                        title,
                        court,
                        chamber,
                        case_number,
                        decision_number,
                        decision_date,
                        publication_date,
                        effective_from,
                        effective_to,
                        legal_domain,
                        source_url,
                        official,
                        content,
                        content_hash,
                        _jsonb(metadata),
                        source_id,
                    ),
                )

        cur.execute(
            """
            INSERT INTO legal_source_origins (
                legal_source_id, source_name, external_id, source_url,
                official_source, content_hash, trust_score, metadata
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_name, external_id) DO UPDATE
            SET legal_source_id = EXCLUDED.legal_source_id,
                source_url = EXCLUDED.source_url,
                official_source = EXCLUDED.official_source,
                content_hash = EXCLUDED.content_hash,
                trust_score = EXCLUDED.trust_score,
                metadata = EXCLUDED.metadata,
                fetched_at = now(),
                updated_at = now()
            """,
            (
                source_id,
                source_name,
                external_id,
                source_url,
                official,
                content_hash,
                trust_score,
                _jsonb(metadata),
            ),
        )

    if replace_content:
        _replace_canonical_chunks(
            conn,
            source_id,
            chunks,
            vectors,
            effective_from=effective_from,
            effective_to=effective_to,
        )
    return source_id, replace_content


def _upsert_decision(conn: psycopg.Connection, record: dict[str, Any], legal_source_id: str) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO decisions (
                source, court, chamber, esas_no, karar_no, decision_date,
                raw_text, raw_html, source_doc_id, metadata, legal_source_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source, source_doc_id) DO UPDATE
            SET court = EXCLUDED.court,
                chamber = EXCLUDED.chamber,
                esas_no = EXCLUDED.esas_no,
                karar_no = EXCLUDED.karar_no,
                decision_date = EXCLUDED.decision_date,
                raw_text = EXCLUDED.raw_text,
                raw_html = EXCLUDED.raw_html,
                metadata = EXCLUDED.metadata,
                legal_source_id = EXCLUDED.legal_source_id,
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
                legal_source_id,
            ),
        )
        return str(cur.fetchone()[0])


def _replace_decision_chunks(
    conn: psycopg.Connection,
    decision_id: str,
    chunks: list[dict[str, Any]],
    vectors: list[list[float] | None],
) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM decision_chunks WHERE decision_id = %s", (decision_id,))
        for chunk, vector in zip(chunks, vectors):
            cur.execute(
                """
                INSERT INTO decision_chunks (decision_id, chunk_index, chunk_text, embedding)
                VALUES (%s, %s, %s, %s::vector)
                """,
                (decision_id, chunk["chunk_index"], chunk["content"], _vector_literal(vector)),
            )


def _upsert_legislation(conn: psycopg.Connection, record: dict[str, Any]) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO legislation (
                law_name, law_no, law_type, rg_date, rg_no, source_doc_id, metadata
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_doc_id) DO UPDATE
            SET law_name = EXCLUDED.law_name,
                law_no = EXCLUDED.law_no,
                law_type = EXCLUDED.law_type,
                rg_date = EXCLUDED.rg_date,
                rg_no = EXCLUDED.rg_no,
                metadata = legislation.metadata || EXCLUDED.metadata,
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
    chunks: list[dict[str, Any]],
    vectors: list[list[float] | None],
) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM legislation_articles WHERE legislation_id = %s", (legislation_id,))
        for chunk, vector in zip(chunks, vectors):
            cur.execute(
                """
                INSERT INTO legislation_articles (
                    legislation_id, madde_no, madde_text, embedding
                ) VALUES (%s, %s, %s, %s::vector)
                """,
                (
                    legislation_id,
                    chunk.get("article_number"),
                    chunk["content"],
                    _vector_literal(vector),
                ),
            )


def _sync_legislation_version(
    conn: psycopg.Connection,
    record: dict[str, Any],
    legislation_id: str,
    version_source_id: str,
    chunks: list[dict[str, Any]],
) -> str:
    metadata = record.get("metadata") or {}
    effective_from = metadata.get("effective_from") or record.get("rg_date")
    effective_to = metadata.get("effective_to")
    content_hash = sha256("\n\n".join(chunk["content"] for chunk in chunks))
    fingerprint = sha256(
        f"{legislation_id}|{effective_from or 'unknown'}|{effective_to or 'current'}|{content_hash}"
    )
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO legislation_versions (
                legislation_id, legal_source_id, version_label, effective_from,
                effective_to, change_source, official_gazette_date,
                official_gazette_number, source_url, official_source,
                content_hash, version_fingerprint, date_precision, status, metadata
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, true, %s, %s, %s, %s, %s)
            ON CONFLICT (version_fingerprint) DO UPDATE
            SET metadata = legislation_versions.metadata || EXCLUDED.metadata,
                updated_at = now()
            RETURNING id
            """,
            (
                legislation_id,
                version_source_id,
                metadata.get("version_label") or (f"effective-{effective_from}" if effective_from else "observed"),
                effective_from,
                effective_to,
                metadata.get("change_source"),
                record.get("rg_date"),
                record.get("rg_no"),
                metadata.get("source_url"),
                content_hash,
                fingerprint,
                "DECLARED" if effective_from else "OBSERVED",
                "HISTORICAL" if effective_to else "CURRENT",
                _jsonb(metadata),
            ),
        )
        version_id = str(cur.fetchone()[0])
        for chunk in chunks:
            article_hash = chunk["content_hash"]
            cur.execute(
                """
                INSERT INTO legislation_article_versions (
                    legislation_version_id, article_number, article_title,
                    article_text, effective_from, effective_to, change_source,
                    content_hash, version_fingerprint, metadata
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, '{}'::jsonb)
                ON CONFLICT (version_fingerprint) DO NOTHING
                """,
                (
                    version_id,
                    chunk.get("article_number") or "full",
                    chunk.get("heading"),
                    chunk["content"],
                    effective_from,
                    effective_to,
                    metadata.get("change_source"),
                    article_hash,
                    sha256(f"{version_id}|{chunk.get('article_number') or 'full'}|{article_hash}"),
                ),
            )

        cur.execute(
            """
            WITH ordered AS (
                SELECT id,
                       row_number() OVER (
                           PARTITION BY legislation_id
                           ORDER BY effective_from DESC NULLS LAST, created_at DESC, id DESC
                       ) AS position,
                       lag(id) OVER (
                           PARTITION BY legislation_id ORDER BY effective_from NULLS FIRST, created_at, id
                       ) AS previous_id,
                       lead(id) OVER (
                           PARTITION BY legislation_id ORDER BY effective_from NULLS FIRST, created_at, id
                       ) AS next_id
                FROM legislation_versions WHERE legislation_id = %s
            )
            UPDATE legislation_versions version
            SET previous_version_id = ordered.previous_id,
                next_version_id = ordered.next_id,
                status = CASE
                    WHEN ordered.position = 1 AND version.effective_to IS NULL THEN 'CURRENT'
                    ELSE 'HISTORICAL'
                END,
                updated_at = now()
            FROM ordered WHERE ordered.id = version.id
            """,
            (legislation_id,),
        )
        cur.execute(
            """
            WITH ordered AS (
                SELECT av.id,
                       lag(av.id) OVER (
                           PARTITION BY av.article_number
                           ORDER BY av.effective_from NULLS FIRST, av.created_at, av.id
                       ) AS previous_id,
                       lead(av.id) OVER (
                           PARTITION BY av.article_number
                           ORDER BY av.effective_from NULLS FIRST, av.created_at, av.id
                       ) AS next_id
                FROM legislation_article_versions av
                JOIN legislation_versions lv ON lv.id = av.legislation_version_id
                WHERE lv.legislation_id = %s
            )
            UPDATE legislation_article_versions article
            SET previous_version_id = ordered.previous_id,
                next_version_id = ordered.next_id,
                updated_at = now()
            FROM ordered WHERE ordered.id = article.id
            """,
            (legislation_id,),
        )
    return version_id


async def ingest_records(conn: psycopg.Connection, records: list[dict[str, Any]]) -> int:
    saved = 0
    for record in records:
        if record.get("kind") == "decision":
            content = record.get("raw_text") or ""
            canonical_key = decision_canonical_key(record)
            state = _source_state(conn, canonical_key)
            official = official_source(record["source"])
            trust_score = 0.95 if official else 0.6
            needs_index = _should_replace(state, sha256(content), official, trust_score)
            chunks = structural_chunks(content) if needs_index else []
            vectors = await embed_texts(
                [chunk["content"] for chunk in chunks], prefix="passage: "
            ) if needs_index else []
            metadata = record.get("metadata") or {}
            legal_source_id, replaced = _upsert_normalized_source(
                conn,
                canonical_key=canonical_key,
                content=content,
                chunks=chunks,
                vectors=vectors,
                source_type_name=source_type(record["source"]),
                title=" ".join(
                    str(value) for value in [
                        record.get("court"),
                        record.get("chamber"),
                        record.get("esas_no"),
                        record.get("karar_no"),
                    ] if value
                ) or f"Karar {record['source_doc_id']}",
                source_name=record["source"],
                external_id=record["source_doc_id"],
                metadata=metadata,
                court=record.get("court"),
                chamber=record.get("chamber"),
                case_number=record.get("esas_no"),
                decision_number=record.get("karar_no"),
                decision_date=record.get("decision_date"),
                publication_date=record.get("decision_date"),
                legal_domain=metadata.get("legal_domain"),
                source_url=metadata.get("source_url"),
                official=official,
                trust_score=trust_score,
            )
            decision_id = _upsert_decision(conn, record, legal_source_id)
            if replaced:
                _replace_decision_chunks(conn, decision_id, chunks, vectors)
            saved += 1
        elif record.get("kind") == "legislation":
            chunks = article_chunks(record.get("articles") or [])
            content = "\n\n".join(
                f"{chunk['heading']}\n{chunk['content']}" for chunk in chunks
            )
            if not content:
                continue
            metadata = record.get("metadata") or {}
            effective_from = metadata.get("effective_from") or record.get("rg_date")
            effective_to = metadata.get("effective_to")
            main_key = legislation_canonical_key(record)
            version_key = sha256(
                f"legislation-version|{record.get('law_no')}|{effective_from or 'unknown'}|"
                f"{effective_to or 'current'}|{sha256(content)}"
            )
            main_state = _source_state(conn, main_key)
            version_state = _source_state(conn, version_key)
            needs_index = (
                _should_replace(main_state, sha256(content), True, 1.0)
                or _should_replace(version_state, sha256(content), True, 1.0)
            )
            vectors = await embed_texts(
                [chunk["content"] for chunk in chunks], prefix="passage: "
            ) if needs_index else []
            if not needs_index:
                vectors = []
            main_source_id, main_replaced = _upsert_normalized_source(
                conn,
                canonical_key=main_key,
                content=content,
                chunks=chunks if needs_index else [],
                vectors=vectors,
                source_type_name="LEGISLATION",
                title=record.get("law_name") or record.get("law_no") or record["source_doc_id"],
                source_name="mevzuat",
                external_id=record["source_doc_id"],
                metadata={**metadata, "lawNumber": record.get("law_no")},
                publication_date=record.get("rg_date"),
                effective_from=effective_from,
                legal_domain="Mevzuat",
                source_url=metadata.get("source_url"),
                official=True,
                trust_score=1.0,
            )
            version_source_id, _ = _upsert_normalized_source(
                conn,
                canonical_key=version_key,
                content=content,
                chunks=chunks if needs_index else [],
                vectors=vectors,
                source_type_name="LEGISLATION_VERSION",
                title=f"{record.get('law_name') or record.get('law_no')} - {effective_from or 'observed'}",
                source_name="mevzuat",
                external_id=f"{record['source_doc_id']}@{effective_from or sha256(content)[:12]}",
                metadata={**metadata, "lawNumber": record.get("law_no"), "versionOf": main_source_id},
                publication_date=record.get("rg_date"),
                effective_from=effective_from,
                effective_to=effective_to,
                legal_domain="Mevzuat",
                source_url=metadata.get("source_url"),
                official=True,
                trust_score=1.0,
            )
            legislation_id = _upsert_legislation(conn, record)
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE legislation SET legal_source_id = %s WHERE id = %s",
                    (main_source_id, legislation_id),
                )
                cur.execute(
                    """
                    INSERT INTO legal_source_relations (source_id, related_source_id, relation_type)
                    VALUES (%s, %s, 'VERSION_OF')
                    ON CONFLICT (source_id, related_source_id, relation_type) DO NOTHING
                    """,
                    (version_source_id, main_source_id),
                )
            if main_replaced:
                _replace_articles(conn, legislation_id, chunks, vectors)
            _sync_legislation_version(conn, record, legislation_id, version_source_id, chunks)
            saved += 1
    conn.commit()
    return saved

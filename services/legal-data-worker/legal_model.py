from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any


HEADING_TYPES = {
    "olay": "FACTS",
    "olaylar": "FACTS",
    "maddi olay": "FACTS",
    "ozet": "SUMMARY",
    "özet": "SUMMARY",
    "gerekce": "REASONING",
    "gerekçe": "REASONING",
    "hukuki degerlendirme": "LEGAL_ASSESSMENT",
    "hukuki değerlendirme": "LEGAL_ASSESSMENT",
    "degerlendirme": "LEGAL_ASSESSMENT",
    "değerlendirme": "LEGAL_ASSESSMENT",
    "hukum": "RULING",
    "hüküm": "RULING",
    "sonuc": "RULING",
    "sonuç": "RULING",
    "karsi oy": "DISSENT",
    "karşı oy": "DISSENT",
    "muhalefet serhi": "DISSENT",
    "muhalefet şerhi": "DISSENT",
    "dipnot": "FOOTNOTE",
    "dipnotlar": "FOOTNOTE",
}


def sha256(value: Any) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("I", "ı").replace("İ", "i").lower()
    return re.sub(r"\s+", " ", text).strip()


def decision_canonical_key(record: dict[str, Any]) -> str:
    identity = [
        normalize(record.get("court")),
        normalize(record.get("chamber")),
        normalize(record.get("esas_no")),
        normalize(record.get("karar_no")),
        str(record.get("decision_date") or "")[:10],
    ]
    if any(identity[2:]):
        return sha256("|".join(["decision", *identity]))
    return sha256(f"decision-content|{sha256(record.get('raw_text'))}")


def legislation_canonical_key(record: dict[str, Any]) -> str:
    return sha256(
        "|".join(
            [
                "legislation",
                normalize(record.get("law_no")),
                normalize(record.get("source_doc_id") or record.get("law_name")),
            ]
        )
    )


def source_type(source: str) -> str:
    source_name = normalize(source)
    if "aym" in source_name:
        return "CONSTITUTIONAL_COURT_DECISION"
    if "danistay" in source_name or "danıştay" in source_name:
        return "ADMINISTRATIVE_DECISION"
    if "echr" in source_name or "aihm" in source_name:
        return "ECHR_DECISION"
    return "COURT_DECISION"


def official_source(source: str) -> bool:
    return normalize(source) in {
        "bedesten_yargitay",
        "bedesten_bam",
        "danistay",
        "aym_norm",
        "aym_bireysel",
        "mevzuat",
    }


def _heading(line: str) -> tuple[str, str | None] | None:
    article = re.match(
        r"^\s*((?:gecici|geçici)\s+)?madde\s+([0-9]+(?:/[A-Za-z0-9]+)?[A-Za-z]?)\s*[-–.:]?",
        line,
        re.IGNORECASE,
    )
    if article:
        return ("TRANSITIONAL_ARTICLE" if article.group(1) else "LEGISLATION_ARTICLE", article.group(2))
    normalized = normalize(line).rstrip(":")
    chunk_type = HEADING_TYPES.get(normalized)
    return (chunk_type, None) if chunk_type else None


def structural_chunks(text: str, max_chars: int = 6000) -> list[dict[str, Any]]:
    clean = re.sub(r"\n{4,}", "\n\n\n", (text or "").replace("\r\n", "\n").strip())
    if not clean:
        return []

    sections: list[dict[str, Any]] = []
    current: dict[str, Any] = {
        "chunk_type": "GENERAL",
        "heading": None,
        "article_number": None,
        "content": "",
    }
    for line in clean.split("\n"):
        heading = _heading(line)
        if heading:
            if current["content"].strip():
                current["content"] = current["content"].strip()
                sections.append(current)
            current = {
                "chunk_type": heading[0],
                "heading": line.strip(),
                "article_number": heading[1],
                "content": "",
            }
        else:
            current["content"] = f"{current['content']}\n{line}".strip()
    if current["content"].strip():
        sections.append(current)

    split_sections: list[dict[str, Any]] = []
    for section in sections:
        content = section["content"]
        if len(content) <= max_chars:
            split_sections.append(section)
            continue
        paragraphs = [item.strip() for item in re.split(r"\n\s*\n", content) if item.strip()]
        buffer = ""
        for paragraph in paragraphs:
            if buffer and len(buffer) + len(paragraph) + 2 > max_chars:
                split_sections.append({**section, "content": buffer})
                buffer = ""
            if len(paragraph) > max_chars:
                if buffer:
                    split_sections.append({**section, "content": buffer})
                    buffer = ""
                for offset in range(0, len(paragraph), max_chars):
                    split_sections.append({**section, "content": paragraph[offset : offset + max_chars]})
            else:
                buffer = f"{buffer}\n\n{paragraph}".strip()
        if buffer:
            split_sections.append({**section, "content": buffer})

    for index, chunk in enumerate(split_sections):
        content_hash = sha256(chunk["content"])
        chunk.update(
            {
                "chunk_index": index,
                "content_hash": content_hash,
                "fingerprint": sha256(
                    "|".join(
                        [
                            chunk["chunk_type"],
                            chunk.get("article_number") or "",
                            chunk.get("heading") or "",
                            content_hash,
                        ]
                    )
                ),
            }
        )
    return split_sections


def article_chunks(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for index, article in enumerate(articles):
        text = str(article.get("madde_text") or "").strip()
        if not text:
            continue
        number = str(article.get("madde_no") or "full")
        content_hash = sha256(text)
        chunks.append(
            {
                "chunk_type": "TRANSITIONAL_ARTICLE" if normalize(number).startswith("gecici") else "LEGISLATION_ARTICLE",
                "chunk_index": index,
                "heading": f"Madde {number}",
                "article_number": number,
                "content": text,
                "content_hash": content_hash,
                "fingerprint": sha256(f"{number}|{content_hash}"),
            }
        )
    return chunks


def extract_citations(text: str) -> list[dict[str, str | None]]:
    patterns = [
        re.compile(
            r"\b(\d{3,5})\s+sayılı\s+([^\n.;]{0,100}?(?:Kanun|Kanunu|Yasa|Yasası))"
            r"[^\n.;]{0,80}?\b(\d+(?:/[A-Za-z0-9]+)?[A-Za-z]?)\.?\s*madde(?:si|sinin)?",
            re.IGNORECASE,
        ),
        re.compile(
            r"\b(\d{3,5})\s+sayılı\s+([^\n.;]{0,100}?(?:Kanun|Kanunu|Yasa|Yasası))"
            r"[^\n.;]{0,80}?\b(?:madde(?:si|sinin)?|m\.)\s*(\d+(?:/[A-Za-z0-9]+)?[A-Za-z]?)",
            re.IGNORECASE,
        ),
    ]
    citations: dict[str, dict[str, str | None]] = {}
    for pattern in patterns:
        for match in pattern.finditer(text or ""):
            citation_text = match.group(0)
            citation_hash = sha256(normalize(citation_text))
            citations[citation_hash] = {
                "law_number": match.group(1),
                "law_name": match.group(2).strip(),
                "article_number": match.group(3),
                "citation_text": citation_text,
                "citation_hash": citation_hash,
            }
    return list(citations.values())

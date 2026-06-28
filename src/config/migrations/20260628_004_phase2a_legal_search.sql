CREATE TABLE IF NOT EXISTS legal_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN (
    'LEGISLATION',
    'LEGISLATION_VERSION',
    'COURT_DECISION',
    'CONSTITUTIONAL_COURT_DECISION',
    'ADMINISTRATIVE_DECISION',
    'ECHR_DECISION'
  )),
  jurisdiction VARCHAR(80) NOT NULL DEFAULT 'TR',
  title TEXT NOT NULL,
  court VARCHAR(200),
  chamber VARCHAR(200),
  case_number VARCHAR(100),
  decision_number VARCHAR(100),
  decision_date DATE,
  publication_date DATE,
  effective_from DATE,
  effective_to DATE,
  legal_domain VARCHAR(120),
  source_url TEXT,
  official_source BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  canonical_key CHAR(64) NOT NULL UNIQUE,
  language VARCHAR(10) NOT NULL DEFAULT 'tr',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REPEALED', 'DRAFT', 'ARCHIVED')),
  visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC', 'ORGANIZATION', 'PERSONAL')),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK (
    (visibility = 'PUBLIC' AND organization_id IS NULL AND owner_user_id IS NULL)
    OR (visibility = 'ORGANIZATION' AND organization_id IS NOT NULL AND owner_user_id IS NULL)
    OR (visibility = 'PERSONAL' AND organization_id IS NULL AND owner_user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS legal_source_origins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  source_name VARCHAR(80) NOT NULL,
  external_id VARCHAR(200) NOT NULL,
  source_url TEXT,
  official_source BOOLEAN NOT NULL DEFAULT false,
  content_hash CHAR(64),
  trust_score NUMERIC(5,4) NOT NULL DEFAULT 0.5000
    CHECK (trust_score >= 0 AND trust_score <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_name, external_id)
);

CREATE TABLE IF NOT EXISTS legal_source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  chunk_type VARCHAR(40) NOT NULL CHECK (chunk_type IN (
    'TITLE',
    'FACTS',
    'SUMMARY',
    'REASONING',
    'LEGAL_ASSESSMENT',
    'RULING',
    'DISSENT',
    'LEGISLATION_ARTICLE',
    'TRANSITIONAL_ARTICLE',
    'FOOTNOTE',
    'CITATION',
    'GENERAL'
  )),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  heading TEXT,
  content TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  chunk_fingerprint CHAR(64) NOT NULL,
  article_number VARCHAR(50),
  effective_from DATE,
  effective_to DATE,
  embedding VECTOR(1024),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('turkish', coalesce(heading, '') || ' ' || content)
  ) STORED,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  UNIQUE (source_id, chunk_index),
  UNIQUE (source_id, chunk_fingerprint)
);

CREATE TABLE IF NOT EXISTS legal_source_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  source_chunk_id UUID REFERENCES legal_source_chunks(id) ON DELETE CASCADE,
  target_source_id UUID REFERENCES legal_sources(id) ON DELETE SET NULL,
  law_name VARCHAR(300),
  law_number VARCHAR(50),
  article_number VARCHAR(50),
  citation_text TEXT NOT NULL,
  citation_hash CHAR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, citation_hash)
);

CREATE TABLE IF NOT EXISTS legal_source_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  related_source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  relation_type VARCHAR(40) NOT NULL CHECK (relation_type IN (
    'CITES', 'CITED_BY', 'SAME_DECISION', 'VERSION_OF', 'SUPERSEDES', 'SUPERSEDED_BY', 'RELATED'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_id <> related_source_id),
  UNIQUE (source_id, related_source_id, relation_type)
);

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS legal_source_id UUID REFERENCES legal_sources(id) ON DELETE SET NULL;
ALTER TABLE legislation ADD COLUMN IF NOT EXISTS legal_source_id UUID REFERENCES legal_sources(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS legislation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legislation_id UUID NOT NULL REFERENCES legislation(id) ON DELETE CASCADE,
  legal_source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  version_label VARCHAR(120),
  effective_from DATE,
  effective_to DATE,
  change_source TEXT,
  official_gazette_date DATE,
  official_gazette_number VARCHAR(50),
  source_url TEXT,
  official_source BOOLEAN NOT NULL DEFAULT false,
  previous_version_id UUID REFERENCES legislation_versions(id) ON DELETE SET NULL,
  next_version_id UUID REFERENCES legislation_versions(id) ON DELETE SET NULL,
  content_hash CHAR(64) NOT NULL,
  version_fingerprint CHAR(64) NOT NULL UNIQUE,
  date_precision VARCHAR(20) NOT NULL DEFAULT 'DECLARED'
    CHECK (date_precision IN ('DECLARED', 'OBSERVED', 'UNKNOWN')),
  status VARCHAR(20) NOT NULL DEFAULT 'CURRENT'
    CHECK (status IN ('CURRENT', 'HISTORICAL', 'DRAFT')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  UNIQUE (legislation_id, legal_source_id)
);

CREATE TABLE IF NOT EXISTS legislation_article_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legislation_version_id UUID NOT NULL REFERENCES legislation_versions(id) ON DELETE CASCADE,
  legislation_article_id UUID REFERENCES legislation_articles(id) ON DELETE SET NULL,
  article_number VARCHAR(50) NOT NULL,
  article_title TEXT,
  article_text TEXT NOT NULL,
  effective_from DATE,
  effective_to DATE,
  change_source TEXT,
  previous_version_id UUID REFERENCES legislation_article_versions(id) ON DELETE SET NULL,
  next_version_id UUID REFERENCES legislation_article_versions(id) ON DELETE SET NULL,
  content_hash CHAR(64) NOT NULL,
  version_fingerprint CHAR(64) NOT NULL UNIQUE,
  embedding VECTOR(1024),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('turkish', coalesce(article_title, '') || ' ' || article_text)
  ) STORED,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS legal_corpus_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  corpus_version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO legal_corpus_state (singleton, corpus_version)
VALUES (true, 1)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS legal_search_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(100),
  query_hash CHAR(64) NOT NULL,
  query_length INTEGER NOT NULL,
  normalized_term_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  full_text_ms INTEGER NOT NULL DEFAULT 0,
  vector_search_ms INTEGER NOT NULL DEFAULT 0,
  rerank_ms INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER NOT NULL DEFAULT 0,
  embedding_provider VARCHAR(80),
  embedding_model VARCHAR(160),
  embedding_input_tokens INTEGER NOT NULL DEFAULT 0,
  embedding_estimated_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  cache_status VARCHAR(10) NOT NULL CHECK (cache_status IN ('HIT', 'MISS', 'BYPASS')),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES law_firms(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  corpus_version BIGINT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  safe_error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_sources_type_date
  ON legal_sources (source_type, decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_legal_sources_court_chamber
  ON legal_sources (court, chamber);
CREATE INDEX IF NOT EXISTS idx_legal_sources_case_decision
  ON legal_sources (case_number, decision_number);
CREATE INDEX IF NOT EXISTS idx_legal_sources_effective
  ON legal_sources (effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_legal_sources_visibility
  ON legal_sources (visibility, organization_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_legal_source_origins_source
  ON legal_source_origins (legal_source_id, official_source DESC, trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_legal_chunks_fts
  ON legal_source_chunks USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_legal_chunks_vector
  ON legal_source_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_legal_chunks_article_effective
  ON legal_source_chunks (article_number, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_legal_citations_law_article
  ON legal_source_citations (law_number, article_number);
CREATE INDEX IF NOT EXISTS idx_legislation_versions_temporal
  ON legislation_versions (legislation_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_article_versions_temporal
  ON legislation_article_versions (legislation_version_id, article_number, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_legal_search_metrics_created
  ON legal_search_metrics (created_at DESC);

-- Preserve legacy historical legislation by attaching missing laws to the current legislation table.
INSERT INTO legislation (law_name, law_no, law_type, source_doc_id, metadata)
SELECT DISTINCT ON (lv.law_number)
       lv.law_name,
       lv.law_number,
       'Kanun',
       'law-version-' || lv.law_number,
       jsonb_build_object('legacyLawVersions', true)
FROM law_versions lv
WHERE NOT EXISTS (
  SELECT 1 FROM legislation l WHERE l.law_no = lv.law_number
)
ORDER BY lv.law_number, lv.effective_from DESC
ON CONFLICT (source_doc_id) DO NOTHING;

-- Backfill decisions into the normalized registry without deleting source-specific rows.
INSERT INTO legal_sources (
  source_type, jurisdiction, title, court, chamber, case_number, decision_number,
  decision_date, publication_date, source_url, official_source, content,
  content_hash, canonical_key, metadata
)
SELECT CASE
         WHEN d.source IN ('aym_norm', 'aym_bireysel') THEN 'CONSTITUTIONAL_COURT_DECISION'
         WHEN d.source = 'danistay' THEN 'ADMINISTRATIVE_DECISION'
         ELSE 'COURT_DECISION'
       END,
       'TR',
       trim(concat_ws(' ', d.court, d.chamber, d.esas_no, d.karar_no)),
       d.court,
       d.chamber,
       d.esas_no,
       d.karar_no,
       d.decision_date,
       d.decision_date,
       d.metadata->>'source_url',
       d.source IN ('bedesten_yargitay', 'bedesten_bam', 'danistay', 'aym_norm', 'aym_bireysel'),
       d.raw_text,
       encode(digest(d.raw_text, 'sha256'), 'hex'),
       encode(digest(
         CASE
           WHEN coalesce(d.court, d.chamber, d.esas_no, d.karar_no, d.decision_date::text) IS NULL
             THEN concat_ws('|', 'decision-content', encode(digest(d.raw_text, 'sha256'), 'hex'))
           ELSE concat_ws('|', 'decision', lower(coalesce(d.court, '')), lower(coalesce(d.chamber, '')),
                lower(coalesce(d.esas_no, '')), lower(coalesce(d.karar_no, '')), coalesce(d.decision_date::text, ''))
         END,
         'sha256'
       ), 'hex'),
       coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object('legacyDecisionId', d.id)
FROM decisions d
ON CONFLICT (canonical_key) DO UPDATE
SET official_source = legal_sources.official_source OR EXCLUDED.official_source,
    updated_at = now();

UPDATE decisions d
SET legal_source_id = ls.id
FROM legal_sources ls
WHERE ls.canonical_key = encode(digest(
  CASE
    WHEN coalesce(d.court, d.chamber, d.esas_no, d.karar_no, d.decision_date::text) IS NULL
      THEN concat_ws('|', 'decision-content', encode(digest(d.raw_text, 'sha256'), 'hex'))
    ELSE concat_ws('|', 'decision', lower(coalesce(d.court, '')), lower(coalesce(d.chamber, '')),
         lower(coalesce(d.esas_no, '')), lower(coalesce(d.karar_no, '')), coalesce(d.decision_date::text, ''))
  END,
  'sha256'
), 'hex');

INSERT INTO legal_source_origins (
  legal_source_id, source_name, external_id, source_url, official_source, content_hash, trust_score, metadata, fetched_at
)
SELECT d.legal_source_id,
       d.source,
       d.source_doc_id,
       d.metadata->>'source_url',
       d.source IN ('bedesten_yargitay', 'bedesten_bam', 'danistay', 'aym_norm', 'aym_bireysel'),
       encode(digest(d.raw_text, 'sha256'), 'hex'),
       CASE WHEN d.source IN ('bedesten_yargitay', 'bedesten_bam', 'danistay', 'aym_norm', 'aym_bireysel') THEN 0.9500 ELSE 0.6000 END,
       coalesce(d.metadata, '{}'::jsonb),
       coalesce(d.fetched_at, now())
FROM decisions d
WHERE d.legal_source_id IS NOT NULL
ON CONFLICT (source_name, external_id) DO UPDATE
SET legal_source_id = EXCLUDED.legal_source_id,
    source_url = EXCLUDED.source_url,
    official_source = EXCLUDED.official_source,
    content_hash = EXCLUDED.content_hash,
    trust_score = EXCLUDED.trust_score,
    metadata = EXCLUDED.metadata,
    fetched_at = EXCLUDED.fetched_at,
    updated_at = now();

INSERT INTO legal_source_chunks (
  source_id, chunk_type, chunk_index, content, content_hash, chunk_fingerprint, embedding,
  metadata
)
SELECT d.legal_source_id,
       'GENERAL',
       dc.chunk_index,
       dc.chunk_text,
       encode(digest(dc.chunk_text, 'sha256'), 'hex'),
       encode(digest(concat_ws('|', d.legal_source_id::text, 'GENERAL', dc.chunk_index::text,
         encode(digest(dc.chunk_text, 'sha256'), 'hex')), 'sha256'), 'hex'),
       dc.embedding,
       jsonb_build_object('legacyDecisionChunkId', dc.id)
FROM decision_chunks dc
JOIN decisions d ON d.id = dc.decision_id
WHERE d.legal_source_id IS NOT NULL
ON CONFLICT (source_id, chunk_index) DO NOTHING;

-- Backfill legislation and current article snapshots into the same registry and chunk index.
WITH legislation_content AS (
  SELECT l.id,
         l.law_name,
         l.law_no,
         l.law_type,
         l.rg_date,
         l.rg_no,
         l.source_doc_id,
         l.metadata,
         coalesce(string_agg(a.madde_text, E'\n\n' ORDER BY a.madde_no, a.id), l.law_name, '') AS content
  FROM legislation l
  LEFT JOIN legislation_articles a ON a.legislation_id = l.id
  GROUP BY l.id
)
INSERT INTO legal_sources (
  source_type, jurisdiction, title, publication_date, effective_from, legal_domain,
  source_url, official_source, content, content_hash, canonical_key, metadata
)
SELECT 'LEGISLATION',
       'TR',
       coalesce(lc.law_name, lc.law_no, lc.source_doc_id),
       lc.rg_date,
       lc.rg_date,
       'Mevzuat',
       lc.metadata->>'source_url',
       true,
       lc.content,
       encode(digest(lc.content, 'sha256'), 'hex'),
       encode(digest(concat_ws('|', 'legislation', lower(coalesce(lc.law_no, '')), lower(lc.source_doc_id)), 'sha256'), 'hex'),
       coalesce(lc.metadata, '{}'::jsonb) || jsonb_build_object(
         'lawNumber', lc.law_no,
         'lawType', lc.law_type,
         'officialGazetteDate', lc.rg_date,
         'officialGazetteNumber', lc.rg_no
       )
FROM legislation_content lc
ON CONFLICT (canonical_key) DO UPDATE
SET title = EXCLUDED.title,
    official_source = true,
    updated_at = now();

UPDATE legislation l
SET legal_source_id = ls.id
FROM legal_sources ls
WHERE ls.canonical_key = encode(digest(
  concat_ws('|', 'legislation', lower(coalesce(l.law_no, '')), lower(l.source_doc_id)),
  'sha256'
), 'hex');

INSERT INTO legal_source_origins (
  legal_source_id, source_name, external_id, source_url, official_source, content_hash, trust_score, metadata
)
SELECT l.legal_source_id,
       'mevzuat',
       l.source_doc_id,
       l.metadata->>'source_url',
       true,
       ls.content_hash,
       1.0000,
       coalesce(l.metadata, '{}'::jsonb)
FROM legislation l
JOIN legal_sources ls ON ls.id = l.legal_source_id
ON CONFLICT (source_name, external_id) DO UPDATE
SET legal_source_id = EXCLUDED.legal_source_id,
    source_url = EXCLUDED.source_url,
    content_hash = EXCLUDED.content_hash,
    metadata = EXCLUDED.metadata,
    updated_at = now();

INSERT INTO legal_source_chunks (
  source_id, chunk_type, chunk_index, heading, content, content_hash, chunk_fingerprint,
  article_number, effective_from, embedding, metadata
)
SELECT l.legal_source_id,
       CASE WHEN lower(coalesce(a.madde_no, '')) LIKE 'gecici%' OR lower(coalesce(a.madde_no, '')) LIKE 'geçici%'
         THEN 'TRANSITIONAL_ARTICLE'
         ELSE 'LEGISLATION_ARTICLE'
       END,
       row_number() OVER (PARTITION BY l.id ORDER BY a.madde_no, a.id) - 1,
       concat('Madde ', coalesce(a.madde_no, '')),
       a.madde_text,
       encode(digest(a.madde_text, 'sha256'), 'hex'),
       encode(digest(concat_ws('|', l.legal_source_id::text, coalesce(a.madde_no, ''),
         encode(digest(a.madde_text, 'sha256'), 'hex')), 'sha256'), 'hex'),
       a.madde_no,
       l.rg_date,
       a.embedding,
       jsonb_build_object('legacyLegislationArticleId', a.id)
FROM legislation_articles a
JOIN legislation l ON l.id = a.legislation_id
WHERE l.legal_source_id IS NOT NULL
ON CONFLICT (source_id, chunk_index) DO NOTHING;

INSERT INTO legislation_versions (
  legislation_id, legal_source_id, version_label, effective_from, official_gazette_date,
  official_gazette_number, source_url, official_source, content_hash, version_fingerprint,
  date_precision, status, metadata
)
SELECT l.id,
       l.legal_source_id,
       'current',
       l.rg_date,
       l.rg_date,
       l.rg_no,
       l.metadata->>'source_url',
       true,
       ls.content_hash,
       encode(digest(concat_ws('|', l.id::text, coalesce(l.rg_date::text, 'unknown'), ls.content_hash), 'sha256'), 'hex'),
       CASE WHEN l.rg_date IS NULL THEN 'UNKNOWN' ELSE 'DECLARED' END,
       'CURRENT',
       jsonb_build_object('backfilledCurrentSnapshot', true)
FROM legislation l
JOIN legal_sources ls ON ls.id = l.legal_source_id
ON CONFLICT (version_fingerprint) DO NOTHING;

INSERT INTO legislation_article_versions (
  legislation_version_id, legislation_article_id, article_number, article_text,
  effective_from, content_hash, version_fingerprint, embedding, metadata
)
SELECT lv.id,
       a.id,
       coalesce(a.madde_no, 'full'),
       a.madde_text,
       lv.effective_from,
       encode(digest(a.madde_text, 'sha256'), 'hex'),
       encode(digest(concat_ws('|', lv.id::text, coalesce(a.madde_no, 'full'),
         encode(digest(a.madde_text, 'sha256'), 'hex')), 'sha256'), 'hex'),
       a.embedding,
       jsonb_build_object('backfilledCurrentSnapshot', true)
FROM legislation_articles a
JOIN legislation_versions lv ON lv.legislation_id = a.legislation_id AND lv.status = 'CURRENT'
ON CONFLICT (version_fingerprint) DO NOTHING;

-- Import the pre-existing law_versions history as explicit version sources.
WITH grouped_versions AS (
  SELECT lv.law_number,
         max(lv.law_name) AS law_name,
         lv.effective_from,
         lv.effective_to,
         string_agg(lv.article_text, E'\n\n' ORDER BY lv.article_number, lv.id) AS content,
         min(lv.source_url) AS source_url
  FROM law_versions lv
  GROUP BY lv.law_number, lv.effective_from, lv.effective_to
)
INSERT INTO legal_sources (
  source_type, jurisdiction, title, effective_from, effective_to, legal_domain,
  source_url, official_source, content, content_hash, canonical_key, status, metadata
)
SELECT 'LEGISLATION_VERSION',
       'TR',
       concat(gv.law_name, ' - ', gv.effective_from::text),
       gv.effective_from,
       gv.effective_to,
       'Mevzuat',
       gv.source_url,
       gv.source_url ILIKE '%mevzuat.gov.tr%',
       gv.content,
       encode(digest(gv.content, 'sha256'), 'hex'),
       encode(digest(concat_ws('|', 'legislation-version', gv.law_number,
         gv.effective_from::text, coalesce(gv.effective_to::text, 'current')), 'sha256'), 'hex'),
       CASE WHEN gv.effective_to IS NULL THEN 'ACTIVE' ELSE 'ARCHIVED' END,
       jsonb_build_object('lawNumber', gv.law_number, 'legacyLawVersions', true)
FROM grouped_versions gv
ON CONFLICT (canonical_key) DO NOTHING;

INSERT INTO legislation_versions (
  legislation_id, legal_source_id, version_label, effective_from, effective_to,
  source_url, official_source, content_hash, version_fingerprint, date_precision, status, metadata
)
SELECT l.id,
       ls.id,
       concat('effective-', ls.effective_from::text),
       ls.effective_from,
       ls.effective_to,
       ls.source_url,
       ls.official_source,
       ls.content_hash,
       encode(digest(concat_ws('|', l.id::text, ls.effective_from::text,
         coalesce(ls.effective_to::text, 'current'), ls.content_hash), 'sha256'), 'hex'),
       'DECLARED',
       CASE WHEN ls.effective_to IS NULL THEN 'CURRENT' ELSE 'HISTORICAL' END,
       jsonb_build_object('legacyLawVersions', true)
FROM legal_sources ls
JOIN legislation l ON l.law_no = ls.metadata->>'lawNumber'
WHERE ls.source_type = 'LEGISLATION_VERSION'
ON CONFLICT (version_fingerprint) DO NOTHING;

INSERT INTO legislation_article_versions (
  legislation_version_id, article_number, article_title, article_text,
  effective_from, effective_to, content_hash, version_fingerprint, metadata
)
SELECT v.id,
       coalesce(lv.article_number, 'full'),
       lv.article_title,
       lv.article_text,
       lv.effective_from,
       lv.effective_to,
       encode(digest(lv.article_text, 'sha256'), 'hex'),
       encode(digest(concat_ws('|', v.id::text, coalesce(lv.article_number, 'full'),
         encode(digest(lv.article_text, 'sha256'), 'hex')), 'sha256'), 'hex'),
       jsonb_build_object('legacyLawVersionId', lv.id)
FROM law_versions lv
JOIN legislation l ON l.law_no = lv.law_number
JOIN legislation_versions v
  ON v.legislation_id = l.id
 AND v.effective_from = lv.effective_from
 AND v.effective_to IS NOT DISTINCT FROM lv.effective_to
ON CONFLICT (version_fingerprint) DO NOTHING;

INSERT INTO legal_source_chunks (
  source_id, chunk_type, chunk_index, heading, content, content_hash,
  chunk_fingerprint, article_number, effective_from, effective_to, metadata
)
SELECT v.legal_source_id,
       CASE WHEN lower(av.article_number) LIKE 'gecici%' OR lower(av.article_number) LIKE 'geçici%'
         THEN 'TRANSITIONAL_ARTICLE'
         ELSE 'LEGISLATION_ARTICLE'
       END,
       row_number() OVER (PARTITION BY v.id ORDER BY av.article_number, av.id) - 1,
       coalesce(av.article_title, concat('Madde ', av.article_number)),
       av.article_text,
       av.content_hash,
       encode(digest(concat_ws('|', v.legal_source_id::text, av.article_number, av.content_hash), 'sha256'), 'hex'),
       av.article_number,
       av.effective_from,
       av.effective_to,
       jsonb_build_object('legislationArticleVersionId', av.id)
FROM legislation_article_versions av
JOIN legislation_versions v ON v.id = av.legislation_version_id
JOIN legal_sources ls ON ls.id = v.legal_source_id AND ls.source_type = 'LEGISLATION_VERSION'
ON CONFLICT (source_id, chunk_index) DO NOTHING;

WITH ordered AS (
  SELECT id,
         lag(id) OVER (PARTITION BY legislation_id ORDER BY effective_from NULLS FIRST, created_at, id) AS previous_id,
         lead(id) OVER (PARTITION BY legislation_id ORDER BY effective_from NULLS FIRST, created_at, id) AS next_id
  FROM legislation_versions
)
UPDATE legislation_versions v
SET previous_version_id = ordered.previous_id,
    next_version_id = ordered.next_id
FROM ordered
WHERE ordered.id = v.id;

WITH ordered AS (
  SELECT av.id,
         lag(av.id) OVER (
           PARTITION BY v.legislation_id, av.article_number
           ORDER BY av.effective_from NULLS FIRST, av.created_at, av.id
         ) AS previous_id,
         lead(av.id) OVER (
           PARTITION BY v.legislation_id, av.article_number
           ORDER BY av.effective_from NULLS FIRST, av.created_at, av.id
         ) AS next_id
  FROM legislation_article_versions av
  JOIN legislation_versions v ON v.id = av.legislation_version_id
)
UPDATE legislation_article_versions av
SET previous_version_id = ordered.previous_id,
    next_version_id = ordered.next_id
FROM ordered
WHERE ordered.id = av.id;

CREATE OR REPLACE FUNCTION increment_legal_corpus_version()
RETURNS trigger AS $$
BEGIN
  UPDATE legal_corpus_state
  SET corpus_version = corpus_version + 1,
      updated_at = now()
  WHERE singleton = true;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legal_sources_corpus_version ON legal_sources;
CREATE TRIGGER trg_legal_sources_corpus_version
AFTER INSERT OR UPDATE OR DELETE ON legal_sources
FOR EACH STATEMENT EXECUTE FUNCTION increment_legal_corpus_version();

DROP TRIGGER IF EXISTS trg_legal_chunks_corpus_version ON legal_source_chunks;
CREATE TRIGGER trg_legal_chunks_corpus_version
AFTER INSERT OR UPDATE OR DELETE ON legal_source_chunks
FOR EACH STATEMENT EXECUTE FUNCTION increment_legal_corpus_version();

DROP TRIGGER IF EXISTS trg_legislation_versions_corpus_version ON legislation_versions;
CREATE TRIGGER trg_legislation_versions_corpus_version
AFTER INSERT OR UPDATE OR DELETE ON legislation_versions
FOR EACH STATEMENT EXECUTE FUNCTION increment_legal_corpus_version();

DROP TRIGGER IF EXISTS trg_article_versions_corpus_version ON legislation_article_versions;
CREATE TRIGGER trg_article_versions_corpus_version
AFTER INSERT OR UPDATE OR DELETE ON legislation_article_versions
FOR EACH STATEMENT EXECUTE FUNCTION increment_legal_corpus_version();

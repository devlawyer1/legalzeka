const { pool } = require('../../config/db');
const {
  decisionCanonicalKey,
  legislationCanonicalKey,
  normalizeTurkish,
  sha256,
  sourceTypeForProvider,
} = require('./normalization');
const { extractLegalCitations, structuralChunk } = require('./structuralChunker');

function vectorLiteral(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return null;
  return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function officialProvider(sourceName) {
  return [
    'bedesten_yargitay',
    'bedesten_bam',
    'danistay',
    'aym_norm',
    'aym_bireysel',
    'mevzuat',
  ].includes(normalizeTurkish(sourceName).replace(/\s+/g, '_'));
}

async function inTransaction(db, callback) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  const shouldRelease = client !== db;
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (shouldRelease) client.release();
  }
}

class LegalSourceIngestionService {
  constructor({ db = pool, embedTexts = null, chunker = structuralChunk } = {}) {
    this.db = db;
    this.embedTexts = embedTexts;
    this.chunker = chunker;
  }

  async _replaceIndex(client, sourceId, content, options = {}) {
    const chunks = options.articles?.length
      ? options.articles.map((article, index) => {
          const articleText = String(article.text || article.articleText || '').trim();
          const articleNumber = String(article.number || article.articleNumber || 'full');
          const contentHash = sha256(articleText);
          const transitional = normalizeTurkish(articleNumber).startsWith('gecici')
            || normalizeTurkish(articleNumber).startsWith('geçici');
          return {
            type: transitional ? 'TRANSITIONAL_ARTICLE' : 'LEGISLATION_ARTICLE',
            chunkIndex: index,
            heading: article.title || article.articleTitle || `Madde ${articleNumber}`,
            articleNumber,
            content: articleText,
            contentHash,
            fingerprint: sha256(`${articleNumber}|${contentHash}`),
          };
        }).filter((chunk) => chunk.content)
      : this.chunker(content);

    const vectors = this.embedTexts && chunks.length
      ? await this.embedTexts(chunks.map((chunk) => `passage: ${chunk.content}`))
      : chunks.map(() => null);
    if (!Array.isArray(vectors) || vectors.length !== chunks.length) {
      throw new Error('Embedding batch size does not match structural chunks.');
    }

    await client.query('DELETE FROM legal_source_citations WHERE source_id = $1', [sourceId]);
    await client.query('DELETE FROM legal_source_chunks WHERE source_id = $1', [sourceId]);

    for (const [index, chunk] of chunks.entries()) {
      const vector = vectors[index];
      if (vector && vector.length !== 1024) {
        throw new Error(`Legal corpus embeddings must contain 1024 values; received ${vector.length}.`);
      }
      const inserted = await client.query(
        `INSERT INTO legal_source_chunks (
           source_id, chunk_type, chunk_index, heading, content, content_hash,
           chunk_fingerprint, article_number, effective_from, effective_to,
           embedding, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, $12)
         RETURNING id`,
        [
          sourceId,
          chunk.type,
          chunk.chunkIndex,
          chunk.heading || null,
          chunk.content,
          chunk.contentHash,
          chunk.fingerprint,
          chunk.articleNumber || null,
          options.effectiveFrom || null,
          options.effectiveTo || null,
          vectorLiteral(vector),
          options.chunkMetadata || {},
        ]
      );
      const chunkId = inserted.rows[0].id;
      for (const citation of extractLegalCitations(chunk.content)) {
        await client.query(
          `INSERT INTO legal_source_citations (
             source_id, source_chunk_id, law_name, law_number, article_number,
             citation_text, citation_hash
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (source_id, citation_hash) DO NOTHING`,
          [
            sourceId,
            chunkId,
            citation.lawName,
            citation.lawNumber,
            citation.articleNumber,
            citation.citationText,
            citation.citationHash,
          ]
        );
      }
    }
    return { chunkCount: chunks.length, embeddedCount: vectors.filter(Boolean).length };
  }

  async _upsertSource(client, input, indexOptions = {}) {
    const content = String(input.content || '').trim();
    if (!content) throw new Error('Legal source content cannot be empty.');
    const contentHash = sha256(content);
    const officialSource = input.officialSource ?? officialProvider(input.sourceName);
    const trustScore = Number(input.trustScore ?? (officialSource ? 0.95 : 0.6));

    const existingResult = await client.query(
      `SELECT s.*,
              coalesce((
                SELECT max(o.trust_score) FROM legal_source_origins o WHERE o.legal_source_id = s.id
              ), 0) AS current_trust_score
       FROM legal_sources s
       WHERE s.canonical_key = $1
       FOR UPDATE`,
      [input.canonicalKey]
    );
    let source = existingResult.rows[0] || null;
    let canonicalChanged = !source;

    if (!source) {
      const inserted = await client.query(
        `INSERT INTO legal_sources (
           source_type, jurisdiction, title, court, chamber, case_number,
           decision_number, decision_date, publication_date, effective_from,
           effective_to, legal_domain, source_url, official_source, content,
           content_hash, canonical_key, language, status, visibility,
           organization_id, owner_user_id, metadata
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
           $21, $22, $23
         ) RETURNING *`,
        [
          input.sourceType,
          input.jurisdiction || 'TR',
          input.title,
          input.court || null,
          input.chamber || null,
          input.caseNumber || null,
          input.decisionNumber || null,
          input.decisionDate || null,
          input.publicationDate || input.decisionDate || null,
          input.effectiveFrom || null,
          input.effectiveTo || null,
          input.legalDomain || null,
          input.sourceUrl || null,
          officialSource,
          content,
          contentHash,
          input.canonicalKey,
          input.language || 'tr',
          input.status || 'ACTIVE',
          input.visibility || 'PUBLIC',
          input.organizationId || null,
          input.ownerUserId || null,
          input.metadata || {},
        ]
      );
      source = inserted.rows[0];
    } else if (source.content_hash !== contentHash) {
      const shouldReplaceCanonical = officialSource && !source.official_source
        ? true
        : trustScore >= Number(source.current_trust_score || 0);
      if (shouldReplaceCanonical) {
        const updated = await client.query(
          `UPDATE legal_sources
           SET title = $2,
               court = $3,
               chamber = $4,
               case_number = $5,
               decision_number = $6,
               decision_date = $7,
               publication_date = $8,
               effective_from = $9,
               effective_to = $10,
               legal_domain = $11,
               source_url = coalesce($12, source_url),
               official_source = official_source OR $13,
               content = $14,
               content_hash = $15,
               metadata = metadata || $16::jsonb,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            source.id,
            input.title,
            input.court || null,
            input.chamber || null,
            input.caseNumber || null,
            input.decisionNumber || null,
            input.decisionDate || null,
            input.publicationDate || input.decisionDate || null,
            input.effectiveFrom || null,
            input.effectiveTo || null,
            input.legalDomain || null,
            input.sourceUrl || null,
            officialSource,
            content,
            contentHash,
            input.metadata || {},
          ]
        );
        source = updated.rows[0];
        canonicalChanged = true;
      }
    }

    await client.query(
      `INSERT INTO legal_source_origins (
         legal_source_id, source_name, external_id, source_url, official_source,
         content_hash, trust_score, metadata, fetched_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, now()))
       ON CONFLICT (source_name, external_id) DO UPDATE
       SET legal_source_id = EXCLUDED.legal_source_id,
           source_url = EXCLUDED.source_url,
           official_source = EXCLUDED.official_source,
           content_hash = EXCLUDED.content_hash,
           trust_score = EXCLUDED.trust_score,
           metadata = EXCLUDED.metadata,
           fetched_at = EXCLUDED.fetched_at,
           updated_at = now()`,
      [
        source.id,
        input.sourceName,
        input.externalId,
        input.sourceUrl || null,
        officialSource,
        contentHash,
        trustScore,
        input.originMetadata || input.metadata || {},
        input.fetchedAt || null,
      ]
    );

    const chunkCountResult = await client.query(
      'SELECT count(*)::int AS count FROM legal_source_chunks WHERE source_id = $1',
      [source.id]
    );
    let indexing = { chunkCount: Number(chunkCountResult.rows[0].count), embeddedCount: 0 };
    if (canonicalChanged || indexing.chunkCount === 0) {
      indexing = await this._replaceIndex(client, source.id, source.content, indexOptions);
    }

    return {
      sourceId: source.id,
      contentHash: source.content_hash,
      canonicalChanged,
      duplicate: !canonicalChanged,
      ...indexing,
    };
  }

  async ingestDecision(record) {
    return inTransaction(this.db, async (client) => {
      const content = record.content || record.rawText;
      const sourceName = record.sourceName || record.source;
      const externalId = record.externalId || record.sourceDocumentId || record.sourceDocId;
      if (!sourceName || !externalId) throw new Error('Decision sourceName and externalId are required.');
      return this._upsertSource(client, {
        sourceType: sourceTypeForProvider(sourceName, record.sourceType),
        canonicalKey: decisionCanonicalKey({ ...record, content }),
        title: record.title || [
          record.court,
          record.chamber,
          record.caseNumber || record.esasNo,
          record.decisionNumber || record.kararNo,
        ].filter(Boolean).join(' ') || `Karar ${externalId}`,
        content,
        sourceName,
        externalId,
        sourceUrl: record.sourceUrl,
        officialSource: record.officialSource,
        trustScore: record.trustScore,
        court: record.court,
        chamber: record.chamber,
        caseNumber: record.caseNumber || record.esasNo,
        decisionNumber: record.decisionNumber || record.kararNo,
        decisionDate: record.decisionDate,
        publicationDate: record.publicationDate,
        legalDomain: record.legalDomain,
        jurisdiction: record.jurisdiction,
        visibility: record.visibility,
        organizationId: record.organizationId,
        ownerUserId: record.ownerUserId,
        metadata: record.metadata,
        originMetadata: record.originMetadata,
        fetchedAt: record.fetchedAt,
      });
    });
  }

  async ingestLegislation(record) {
    return inTransaction(this.db, async (client) => {
      const sourceName = record.sourceName || 'mevzuat';
      const externalId = record.externalId || record.sourceDocumentId || `kanun-${record.lawNumber}`;
      const articles = (record.articles || []).map((article) => ({
        number: String(article.number || article.articleNumber || article.maddeNo || 'full'),
        title: article.title || article.articleTitle || null,
        text: String(article.text || article.articleText || article.maddeText || '').trim(),
      })).filter((article) => article.text);
      const content = record.content || articles
        .map((article) => `${article.title || `Madde ${article.number}`}\n${article.text}`)
        .join('\n\n');
      if (!content) throw new Error('Legislation content cannot be empty.');

      const legislationResult = await client.query(
        `INSERT INTO legislation (
           law_name, law_no, law_type, rg_date, rg_no, source_doc_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source_doc_id) DO UPDATE
         SET law_name = EXCLUDED.law_name,
             law_no = EXCLUDED.law_no,
             law_type = EXCLUDED.law_type,
             rg_date = EXCLUDED.rg_date,
             rg_no = EXCLUDED.rg_no,
             metadata = legislation.metadata || EXCLUDED.metadata,
             fetched_at = now()
         RETURNING id`,
        [
          record.lawName || record.title,
          record.lawNumber || record.lawNo,
          record.lawType || 'Kanun',
          record.officialGazetteDate || record.effectiveFrom || null,
          record.officialGazetteNumber || null,
          externalId,
          record.metadata || {},
        ]
      );
      const legislationId = legislationResult.rows[0].id;
      const main = await this._upsertSource(client, {
        sourceType: 'LEGISLATION',
        canonicalKey: legislationCanonicalKey({ ...record, externalId }),
        title: record.lawName || record.title || record.lawNumber,
        content,
        sourceName,
        externalId,
        sourceUrl: record.sourceUrl,
        officialSource: record.officialSource ?? true,
        trustScore: record.trustScore ?? 1,
        publicationDate: record.officialGazetteDate,
        effectiveFrom: record.effectiveFrom || record.officialGazetteDate,
        effectiveTo: null,
        legalDomain: record.legalDomain || 'Mevzuat',
        metadata: {
          ...(record.metadata || {}),
          lawNumber: record.lawNumber || record.lawNo,
          lawType: record.lawType || 'Kanun',
          legislationId,
        },
      }, {
        articles,
        effectiveFrom: record.effectiveFrom || record.officialGazetteDate,
      });
      await client.query('UPDATE legislation SET legal_source_id = $2 WHERE id = $1', [legislationId, main.sourceId]);

      const effectiveFrom = record.effectiveFrom || record.officialGazetteDate || null;
      const effectiveTo = record.effectiveTo || null;
      const versionCanonicalKey = sha256([
        'legislation-version',
        record.lawNumber || record.lawNo || externalId,
        effectiveFrom || 'unknown',
        effectiveTo || 'current',
        sha256(content),
      ].join('|'));
      const versionSource = await this._upsertSource(client, {
        sourceType: 'LEGISLATION_VERSION',
        canonicalKey: versionCanonicalKey,
        title: `${record.lawName || record.title || record.lawNumber} - ${effectiveFrom || 'tarihsiz sürüm'}`,
        content,
        sourceName,
        externalId: `${externalId}@${effectiveFrom || sha256(content).slice(0, 12)}`,
        sourceUrl: record.sourceUrl,
        officialSource: record.officialSource ?? true,
        trustScore: record.trustScore ?? 1,
        publicationDate: record.officialGazetteDate,
        effectiveFrom,
        effectiveTo,
        legalDomain: record.legalDomain || 'Mevzuat',
        status: effectiveTo ? 'ARCHIVED' : 'ACTIVE',
        metadata: {
          ...(record.metadata || {}),
          lawNumber: record.lawNumber || record.lawNo,
          legislationId,
          versionOf: main.sourceId,
        },
      }, { articles, effectiveFrom, effectiveTo });

      const versionFingerprint = sha256(`${legislationId}|${effectiveFrom || 'unknown'}|${effectiveTo || 'current'}|${sha256(content)}`);
      const versionResult = await client.query(
        `INSERT INTO legislation_versions (
           legislation_id, legal_source_id, version_label, effective_from,
           effective_to, change_source, official_gazette_date,
           official_gazette_number, source_url, official_source, content_hash,
           version_fingerprint, date_precision, status, metadata
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15
         )
         ON CONFLICT (version_fingerprint) DO UPDATE
         SET source_url = coalesce(EXCLUDED.source_url, legislation_versions.source_url),
             metadata = legislation_versions.metadata || EXCLUDED.metadata,
             updated_at = now()
         RETURNING id`,
        [
          legislationId,
          versionSource.sourceId,
          record.versionLabel || (effectiveFrom ? `effective-${effectiveFrom}` : 'observed'),
          effectiveFrom,
          effectiveTo,
          record.changeSource || null,
          record.officialGazetteDate || null,
          record.officialGazetteNumber || null,
          record.sourceUrl || null,
          record.officialSource ?? true,
          sha256(content),
          versionFingerprint,
          record.datePrecision || (effectiveFrom ? 'DECLARED' : 'OBSERVED'),
          effectiveTo ? 'HISTORICAL' : 'CURRENT',
          record.metadata || {},
        ]
      );
      const versionId = versionResult.rows[0].id;

      for (const article of articles) {
        const articleHash = sha256(article.text);
        await client.query(
          `INSERT INTO legislation_article_versions (
             legislation_version_id, article_number, article_title, article_text,
             effective_from, effective_to, change_source, content_hash,
             version_fingerprint, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (version_fingerprint) DO NOTHING`,
          [
            versionId,
            article.number,
            article.title,
            article.text,
            effectiveFrom,
            effectiveTo,
            record.changeSource || null,
            articleHash,
            sha256(`${versionId}|${article.number}|${articleHash}`),
            {},
          ]
        );
      }

      await client.query(
        `WITH ordered AS (
           SELECT id,
                  row_number() OVER (
                    PARTITION BY legislation_id ORDER BY effective_from DESC NULLS LAST, created_at DESC, id DESC
                  ) AS position,
                  lag(id) OVER (
                    PARTITION BY legislation_id ORDER BY effective_from NULLS FIRST, created_at, id
                  ) AS previous_id,
                  lead(id) OVER (
                    PARTITION BY legislation_id ORDER BY effective_from NULLS FIRST, created_at, id
                  ) AS next_id
           FROM legislation_versions WHERE legislation_id = $1
         )
         UPDATE legislation_versions version
         SET previous_version_id = ordered.previous_id,
             next_version_id = ordered.next_id,
             status = CASE
               WHEN ordered.position = 1 AND version.effective_to IS NULL THEN 'CURRENT'
               ELSE 'HISTORICAL'
             END,
             updated_at = now()
         FROM ordered WHERE ordered.id = version.id`,
        [legislationId]
      );

      await client.query(
        `WITH ordered AS (
           SELECT av.id,
                  lag(av.id) OVER (
                    PARTITION BY av.article_number ORDER BY av.effective_from NULLS FIRST, av.created_at, av.id
                  ) AS previous_id,
                  lead(av.id) OVER (
                    PARTITION BY av.article_number ORDER BY av.effective_from NULLS FIRST, av.created_at, av.id
                  ) AS next_id
           FROM legislation_article_versions av
           JOIN legislation_versions lv ON lv.id = av.legislation_version_id
           WHERE lv.legislation_id = $1
         )
         UPDATE legislation_article_versions article
         SET previous_version_id = ordered.previous_id,
             next_version_id = ordered.next_id,
             updated_at = now()
         FROM ordered WHERE ordered.id = article.id`,
        [legislationId]
      );

      await client.query(
        `INSERT INTO legal_source_relations (source_id, related_source_id, relation_type)
         VALUES ($1, $2, 'VERSION_OF')
         ON CONFLICT (source_id, related_source_id, relation_type) DO NOTHING`,
        [versionSource.sourceId, main.sourceId]
      );

      return {
        legislationId,
        sourceId: main.sourceId,
        versionSourceId: versionSource.sourceId,
        versionId,
        duplicate: main.duplicate && versionSource.duplicate,
        chunkCount: versionSource.chunkCount,
        embeddedCount: main.embeddedCount + versionSource.embeddedCount,
      };
    });
  }
}

module.exports = { LegalSourceIngestionService, officialProvider };

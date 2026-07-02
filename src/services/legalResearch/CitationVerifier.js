const { performance } = require('node:perf_hooks');
const { tokenizeTurkish } = require('../legalSearch/normalization');

function temporalValidity(source, chunk, effectiveAt) {
  if (!effectiveAt || !['LEGISLATION', 'LEGISLATION_VERSION'].includes(source.source_type)) return true;
  const start = chunk.effective_from || source.effective_from;
  const end = chunk.effective_to || source.effective_to;
  return (!start || String(start).slice(0, 10) <= effectiveAt)
    && (!end || String(end).slice(0, 10) > effectiveAt);
}

function overlap(claimText, sourceText) {
  const claimTerms = [...new Set(tokenizeTurkish(claimText))];
  const sourceTerms = new Set(tokenizeTurkish(sourceText));
  const matched = claimTerms.filter((term) => sourceTerms.has(term));
  return {
    matched,
    score: claimTerms.length ? matched.length / claimTerms.length : 0,
  };
}

class CitationVerifier {
  constructor({ repository, verifierModel = null } = {}) {
    if (!repository) throw new Error('CitationVerifier requires a legal source repository.');
    this.repository = repository;
    this.verifierModel = verifierModel;
  }

  async verify({ claimKey, claimText, sourceId, supportType, candidate, accessScope, effectiveAt }) {
    const started = performance.now();
    const resolved = typeof this.repository.getSourceChunk === 'function'
      ? await this.repository.getSourceChunk(sourceId, candidate?.chunkId, accessScope)
      : null;
    const source = resolved?.source || await this.repository.getSource(sourceId, accessScope);
    if (!source) {
      return { verificationStatus: 'REJECTED', reason: 'SOURCE_NOT_ACCESSIBLE', durationMs: performance.now() - started };
    }
    const chunk = resolved?.chunk || source.chunks.find((item) => item.id === candidate?.chunkId);
    if (!chunk) {
      return { verificationStatus: 'REJECTED', reason: 'CHUNK_SOURCE_MISMATCH', durationMs: performance.now() - started };
    }
    const excerpt = String(candidate?.excerpt || '');
    if (!excerpt || !chunk.content.includes(excerpt)) {
      return { verificationStatus: 'REJECTED', reason: 'EXCERPT_NOT_GROUNDED', durationMs: performance.now() - started };
    }
    if (!temporalValidity(source, chunk, effectiveAt)) {
      return { verificationStatus: 'REJECTED', reason: 'VERSION_NOT_EFFECTIVE', durationMs: performance.now() - started };
    }

    const lexical = overlap(claimText, chunk.content);
    let verificationStatus = lexical.matched.length >= 2 || lexical.score >= 0.12
      ? 'VERIFIED'
      : lexical.matched.length === 1 ? 'PARTIAL' : 'REJECTED';
    let reason = verificationStatus === 'REJECTED' ? 'CLAIM_SOURCE_OVERLAP_TOO_LOW' : 'LEXICAL_SUPPORT';
    let verifierCost = 0;
    if (this.verifierModel) {
      const result = await this.verifierModel({
        claimText,
        sourceExcerpt: excerpt,
        supportType,
      });
      if (result?.status) verificationStatus = result.status;
      if (result?.reason) reason = result.reason;
      verifierCost = Number(result?.estimatedCost || 0);
    }

    return {
      claimKey,
      sourceId,
      chunkId: chunk.id,
      sourceExcerpt: excerpt,
      sourcePageOrSection: chunk.heading || chunk.chunk_type,
      supportType,
      verificationStatus,
      overlapScore: lexical.score,
      reason,
      verifierCost,
      durationMs: performance.now() - started,
      source: {
        sourceId: source.id,
        sourceType: source.source_type,
        title: source.title,
        court: source.court,
        chamber: source.chamber,
        caseNumber: source.case_number,
        decisionNumber: source.decision_number,
        decisionDate: source.decision_date,
        officialSource: source.official_source,
        sourceUrl: source.source_url || source.origins.find((origin) => origin.source_url)?.source_url || null,
      },
    };
  }
}

module.exports = { CitationVerifier, overlap, temporalValidity };

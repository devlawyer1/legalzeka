# Phase 3 Drafting and Evidence

## Scope

The canonical petition workflow is `legal_drafts` plus immutable `legal_draft_versions` and
`legal_draft_sections`. Existing `petitions` rows are promoted by migration 006. The legacy
entry point opens the same Draft Studio, so new work is not written to a parallel petition model.

## Safety model

- Draft and template reads are scoped to the personal owner or an authorized organization.
- Source IDs are resolved through the Phase 2 legal-source repository and excerpts must exist
  verbatim in the selected chunk.
- Evidence, claims, sections, and relations must belong to the same Matter.
- AI output is strict JSON. Unknown source or evidence IDs are rejected.
- AI produces `PENDING` suggestions only. Accepting a suggestion creates a new immutable version;
  rejecting one does not change the document.
- Deadline, limitation, forfeiture, and mediation concerns produce structured
  `calculationRequired` entries without a final calculation.
- Audit metadata excludes prompts and document content.

## API

The authenticated API is under `/api/v1`:

- `/drafts`, `/drafts/:draftId`, `/drafts/:draftId/versions`
- `/drafts/:draftId/generate-plan`, `/generate-section`, `/analyze`
- `/drafts/:draftId/suggestions/*`
- `/drafts/:draftId/source-search`, `/citations`
- `/drafts/:draftId/export/docx`, `/export/pdf`
- `/cases/:caseId/evidence-matrix`, `/claims`, `/evidence`, `/evidence-relations`

## Operations

Run migration 006 through the normal migration command only after backing up the target database.
The migration is idempotent and was designed for PostgreSQL. PDF containers install DejaVu Sans
for Turkish glyph coverage. DOCX and PDF exports contain the current version and grounded source
endnotes; internal IDs, provider metadata, and prompts are omitted.

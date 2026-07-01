-- Phase 7: isolated education and academic research workspaces.

CREATE TABLE IF NOT EXISTS learning_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_type VARCHAR(30) NOT NULL CHECK (workspace_type IN ('STUDENT','ACADEMIC','COURSE','RESEARCH_PROJECT')),
  organization_id UUID REFERENCES law_firms(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  legal_domain VARCHAR(120),
  academic_level VARCHAR(30) CHECK (academic_level IS NULL OR academic_level IN ('UNDERGRADUATE','GRADUATE','DOCTORAL','PROFESSIONAL','OTHER')),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT learning_workspace_scope_ck CHECK (organization_id IS NOT NULL OR owner_user_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  course_code VARCHAR(80),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  term VARCHAR(120),
  instructor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  enrollment_policy VARCHAR(30) NOT NULL DEFAULT 'INVITE_ONLY' CHECK (enrollment_policy IN ('INVITE_ONLY','ORGANIZATION','OPEN')),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN ('INSTRUCTOR','TEACHING_ASSISTANT','STUDENT','OBSERVER')),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED','ACTIVE','REMOVED')),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS course_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('TEACHING_ASSISTANT','STUDENT','OBSERVER')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learning_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  parent_topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS study_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  content_json JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  plain_text TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  current_version_id UUID,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS study_note_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content_json JSONB NOT NULL,
  plain_text TEXT NOT NULL DEFAULT '',
  change_summary VARCHAR(500),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (note_id, version_number)
);

ALTER TABLE study_notes DROP CONSTRAINT IF EXISTS study_notes_current_version_fk;
ALTER TABLE study_notes ADD CONSTRAINT study_notes_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES study_note_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS study_note_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
  operation VARCHAR(40) NOT NULL CHECK (operation IN ('SUMMARIZE','SIMPLIFY','EXAMPLE','COMPARE','FLASHCARDS','QUIZ')),
  suggested_content JSONB NOT NULL,
  suggested_plain_text TEXT NOT NULL DEFAULT '',
  source_ids UUID[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  ai_usage_id UUID,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  collection_type VARCHAR(30) NOT NULL CHECK (collection_type IN ('READING_LIST','CASEBOOK','BIBLIOGRAPHY','RESEARCH_CORPUS','CUSTOM')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES source_collections(id) ON DELETE CASCADE,
  legal_source_id UUID REFERENCES legal_sources(id) ON DELETE SET NULL,
  legal_source_chunk_id UUID REFERENCES legal_source_chunks(id) ON DELETE SET NULL,
  external_source_metadata JSONB,
  title VARCHAR(500) NOT NULL,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT source_collection_item_kind_ck CHECK (
    legal_source_id IS NOT NULL OR external_source_metadata IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS source_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  legal_source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES legal_source_chunks(id) ON DELETE CASCADE,
  annotation_type VARCHAR(30) NOT NULL CHECK (annotation_type IN ('HIGHLIGHT','COMMENT','QUESTION','ARGUMENT','COUNTER_ARGUMENT','METHOD_NOTE')),
  content TEXT NOT NULL,
  start_offset INTEGER,
  end_offset INTEGER,
  tags TEXT[] NOT NULL DEFAULT '{}',
  visibility VARCHAR(20) NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','COURSE','WORKSPACE')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (start_offset IS NULL OR start_offset >= 0),
  CHECK (end_offset IS NULL OR end_offset >= start_offset)
);

CREATE TABLE IF NOT EXISTS case_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  legal_source_id UUID REFERENCES legal_sources(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  court VARCHAR(200),
  case_number VARCHAR(100),
  decision_number VARCHAR(100),
  decision_date DATE,
  facts TEXT,
  legal_issue TEXT,
  holding TEXT,
  reasoning TEXT,
  dissent TEXT,
  significance TEXT,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (verification_status IN ('DRAFT','AI_SUGGESTED','VERIFIED','SOURCE_MISSING')),
  pending_suggestion JSONB,
  current_version_id UUID,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_brief_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID NOT NULL REFERENCES case_briefs(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content JSONB NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_status VARCHAR(30) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (brief_id, version_number)
);

ALTER TABLE case_briefs DROP CONSTRAINT IF EXISTS case_briefs_current_version_fk;
ALTER TABLE case_briefs ADD CONSTRAINT case_briefs_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES case_brief_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS case_brief_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID NOT NULL REFERENCES case_briefs(id) ON DELETE CASCADE,
  field_name VARCHAR(40) NOT NULL CHECK (field_name IN ('facts','legalIssue','holding','reasoning','dissent','significance')),
  legal_source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES legal_source_chunks(id) ON DELETE CASCADE,
  excerpt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (brief_id, field_name, chunk_id)
);

CREATE TABLE IF NOT EXISTS learning_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  source_id UUID REFERENCES legal_sources(id) ON DELETE SET NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  card_type VARCHAR(30) NOT NULL CHECK (card_type IN ('FLASHCARD','DEFINITION','CASE_RULE','ARTICLE','COMPARISON')),
  difficulty VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quiz_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  quiz_type VARCHAR(30) NOT NULL CHECK (quiz_type IN ('PRACTICE','SELF_ASSESSMENT','COURSE_ASSIGNMENT','MOCK_EXAM')),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  ai_policy VARCHAR(40) NOT NULL DEFAULT 'AI_ALLOWED' CHECK (ai_policy IN ('AI_ALLOWED','AI_ALLOWED_WITH_DISCLOSURE','AI_LIMITED','AI_PROHIBITED')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_set_id UUID NOT NULL REFERENCES quiz_sets(id) ON DELETE CASCADE,
  question_type VARCHAR(30) NOT NULL CHECK (question_type IN ('MULTIPLE_CHOICE','TRUE_FALSE','SHORT_ANSWER','ISSUE_SPOTTING','CASE_ANALYSIS')),
  prompt TEXT NOT NULL,
  options JSONB,
  answer_schema JSONB NOT NULL,
  explanation TEXT,
  source_ids UUID[] NOT NULL DEFAULT '{}',
  difficulty VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  points NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (points >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_set_id UUID NOT NULL REFERENCES quiz_sets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','SUBMITTED','REVIEWED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMPTZ,
  score NUMERIC(10,2),
  max_score NUMERIC(10,2),
  feedback JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  answer JSONB NOT NULL,
  score NUMERIC(8,2),
  feedback JSONB,
  citation_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS moot_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  facts TEXT NOT NULL,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_ids UUID[] NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  rubric JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS moot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES moot_scenarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_role VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','ABANDONED')),
  transcript_summary TEXT,
  scorecard JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS moot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES moot_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('USER','ASSISTANT')),
  content TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  rubric_feedback JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES learning_workspaces(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  abstract TEXT,
  research_question TEXT,
  hypothesis TEXT,
  methodology TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING','ACTIVE','ANALYSIS','WRITING','COMPLETED','ARCHIVED')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN ('OWNER','RESEARCHER','REVIEWER','OBSERVER')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS research_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN ('LITERATURE_NOTE','CASE_NOTE','LEGISLATION_NOTE','METHOD_NOTE','FINDING','COUNTER_FINDING','LIMITATION')),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  legal_source_id UUID REFERENCES legal_sources(id) ON DELETE SET NULL,
  chunk_id UUID REFERENCES legal_source_chunks(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coding_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  definition JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, name, version_number)
);

CREATE TABLE IF NOT EXISTS coded_source_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  schema_id UUID NOT NULL REFERENCES coding_schemas(id) ON DELETE RESTRICT,
  schema_version INTEGER NOT NULL,
  legal_source_id UUID NOT NULL REFERENCES legal_sources(id) ON DELETE RESTRICT,
  coded_values JSONB NOT NULL,
  coded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','REVIEWED','DISPUTED')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, schema_id, legal_source_id, coded_by)
);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assignment_type VARCHAR(30) NOT NULL DEFAULT 'ESSAY' CHECK (assignment_type IN ('ESSAY','CASE_BRIEF','QUIZ','MOOT','RESEARCH')),
  due_at TIMESTAMPTZ,
  rubric JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_collection_id UUID REFERENCES source_collections(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED','ARCHIVED')),
  ai_policy VARCHAR(40) NOT NULL DEFAULT 'AI_ALLOWED' CHECK (ai_policy IN ('AI_ALLOWED','AI_ALLOWED_WITH_DISCLOSURE','AI_LIMITED','AI_PROHIBITED')),
  late_submission_policy VARCHAR(30) NOT NULL DEFAULT 'BLOCK' CHECK (late_submission_policy IN ('BLOCK','ALLOW','ALLOW_WITH_FLAG')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  attachment_document_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','GRADED','RETURNED')),
  ai_disclosure JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  grade NUMERIC(8,2),
  feedback TEXT,
  ai_suggested_grade NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assignment_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS education_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES learning_workspaces(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL,
  operation VARCHAR(80) NOT NULL,
  provider VARCHAR(80),
  model VARCHAR(160),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(14,8) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  safe_error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE study_note_suggestions DROP CONSTRAINT IF EXISTS study_note_suggestions_usage_fk;
ALTER TABLE study_note_suggestions ADD CONSTRAINT study_note_suggestions_usage_fk
  FOREIGN KEY (ai_usage_id) REFERENCES education_ai_usage(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION reject_education_version_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'education versions are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS study_note_versions_immutable ON study_note_versions;
CREATE TRIGGER study_note_versions_immutable BEFORE UPDATE OR DELETE ON study_note_versions
FOR EACH ROW EXECUTE FUNCTION reject_education_version_mutation();

DROP TRIGGER IF EXISTS case_brief_versions_immutable ON case_brief_versions;
CREATE TRIGGER case_brief_versions_immutable BEFORE UPDATE OR DELETE ON case_brief_versions
FOR EACH ROW EXECUTE FUNCTION reject_education_version_mutation();

DROP TRIGGER IF EXISTS coding_schemas_immutable ON coding_schemas;
CREATE TRIGGER coding_schemas_immutable BEFORE UPDATE OR DELETE ON coding_schemas
FOR EACH ROW EXECUTE FUNCTION reject_education_version_mutation();

CREATE OR REPLACE FUNCTION mark_case_brief_source_missing() RETURNS trigger AS $$
BEGIN
  IF OLD.legal_source_id IS NOT NULL AND NEW.legal_source_id IS NULL THEN
    NEW.verification_status := 'SOURCE_MISSING';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS case_brief_source_missing ON case_briefs;
CREATE TRIGGER case_brief_source_missing BEFORE UPDATE OF legal_source_id ON case_briefs
FOR EACH ROW EXECUTE FUNCTION mark_case_brief_source_missing();

CREATE INDEX IF NOT EXISTS idx_learning_workspaces_owner ON learning_workspaces(owner_user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_learning_workspaces_org ON learning_workspaces(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_course_members_user ON course_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_learning_topics_workspace ON learning_topics(workspace_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_study_notes_workspace ON study_notes(workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_source_collections_workspace ON source_collections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_source_annotations_workspace ON source_annotations(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_briefs_workspace ON case_briefs(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_cards_workspace ON learning_cards(workspace_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sets_workspace ON quiz_sets(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_members_user ON research_project_members(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_coded_items_project ON coded_source_items(project_id, schema_id, legal_source_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id, due_at);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions(student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_education_ai_usage_workspace ON education_ai_usage(workspace_id, created_at DESC);

-- Education plans are additive; existing subscriptions and plans are untouched.
INSERT INTO subscription_plans (plan_name, max_search_limit, max_seats, price, duration_days, feature_entitlements)
VALUES
  ('Student', 250, 1, 0, 30, '{"EDU_WORKSPACE":true,"EDU_CASE_BRIEF":true,"EDU_FLASHCARDS":true,"EDU_QUIZ":true,"EDU_MOOT":true,"ACADEMIC_RESEARCH":false,"ACADEMIC_COURSE":false,"ACADEMIC_EXPORT":true,"PROFESSIONAL_MATTER":false,"PRACTICE_MANAGEMENT":false,"AGENT_WORKFLOWS":false}'::jsonb),
  ('Academic', 1000, 5, 0, 30, '{"EDU_WORKSPACE":true,"EDU_CASE_BRIEF":true,"EDU_FLASHCARDS":true,"EDU_QUIZ":true,"EDU_MOOT":true,"ACADEMIC_RESEARCH":true,"ACADEMIC_COURSE":true,"ACADEMIC_EXPORT":true,"PROFESSIONAL_MATTER":false,"PRACTICE_MANAGEMENT":false,"AGENT_WORKFLOWS":true}'::jsonb),
  ('Institution', -1, 100, 0, 30, '{"EDU_WORKSPACE":true,"EDU_CASE_BRIEF":true,"EDU_FLASHCARDS":true,"EDU_QUIZ":true,"EDU_MOOT":true,"ACADEMIC_RESEARCH":true,"ACADEMIC_COURSE":true,"ACADEMIC_EXPORT":true,"PROFESSIONAL_MATTER":false,"PRACTICE_MANAGEMENT":false,"AGENT_WORKFLOWS":true}'::jsonb)
ON CONFLICT (plan_name) DO NOTHING;

UPDATE subscription_plans
SET feature_entitlements = coalesce(feature_entitlements, '{}'::jsonb) ||
  '{"EDU_WORKSPACE":true,"EDU_CASE_BRIEF":true,"EDU_FLASHCARDS":true,"EDU_QUIZ":true,"EDU_MOOT":true,"ACADEMIC_RESEARCH":true,"ACADEMIC_COURSE":true,"ACADEMIC_EXPORT":true,"PROFESSIONAL_MATTER":true,"PRACTICE_MANAGEMENT":true,"AGENT_WORKFLOWS":true}'::jsonb
WHERE plan_name IN ('Profesyonel','Kurumsal')
  AND NOT (coalesce(feature_entitlements, '{}'::jsonb) ? 'EDU_WORKSPACE');

ALTER TABLE agent_workflows DROP CONSTRAINT IF EXISTS agent_workflows_type_ck;
ALTER TABLE agent_workflows ADD CONSTRAINT agent_workflows_type_ck CHECK (workflow_type IN (
  'MATTER_INTAKE','DOCUMENT_REVIEW','EVIDENCE_GAP_REVIEW','LEGAL_RESEARCH','RESEARCH_MONITOR',
  'DRAFT_REVIEW','DEADLINE_RISK','CLIENT_UPDATE','CUSTOM','CASE_BRIEF_ASSISTANT',
  'STUDY_NOTE_REVIEW','QUIZ_GENERATOR','MOOT_COURT_COACH','RESEARCH_SOURCE_MONITOR',
  'ACADEMIC_CODING_ASSISTANT'
));

WITH templates(id, version_id, name, description, workflow_type) AS (
  VALUES
    ('70000000-0000-4000-8000-000000000001'::uuid,'71000000-0000-4000-8000-000000000001'::uuid,'Case brief assistant','Produces a source-bounded brief preview only.','CASE_BRIEF_ASSISTANT'),
    ('70000000-0000-4000-8000-000000000002'::uuid,'71000000-0000-4000-8000-000000000002'::uuid,'Study note review','Suggests note revisions without applying them.','STUDY_NOTE_REVIEW'),
    ('70000000-0000-4000-8000-000000000003'::uuid,'71000000-0000-4000-8000-000000000003'::uuid,'Quiz generator','Generates source-grounded draft questions.','QUIZ_GENERATOR'),
    ('70000000-0000-4000-8000-000000000004'::uuid,'71000000-0000-4000-8000-000000000004'::uuid,'Moot court coach','Provides bounded coaching and rubric feedback.','MOOT_COURT_COACH'),
    ('70000000-0000-4000-8000-000000000005'::uuid,'71000000-0000-4000-8000-000000000005'::uuid,'Research source monitor','Creates source collection proposals only.','RESEARCH_SOURCE_MONITOR'),
    ('70000000-0000-4000-8000-000000000006'::uuid,'71000000-0000-4000-8000-000000000006'::uuid,'Academic coding assistant','Suggests coding values without overwriting researcher data.','ACADEMIC_CODING_ASSISTANT')
)
INSERT INTO agent_workflows (id,scope_type,is_system_template,name,description,workflow_type,status,current_version_id)
SELECT id,'SYSTEM',true,name,description,workflow_type,'DRAFT',NULL FROM templates
ON CONFLICT (id) DO NOTHING;

WITH templates(workflow_id, version_id) AS (
  VALUES
    ('70000000-0000-4000-8000-000000000001'::uuid,'71000000-0000-4000-8000-000000000001'::uuid),
    ('70000000-0000-4000-8000-000000000002'::uuid,'71000000-0000-4000-8000-000000000002'::uuid),
    ('70000000-0000-4000-8000-000000000003'::uuid,'71000000-0000-4000-8000-000000000003'::uuid),
    ('70000000-0000-4000-8000-000000000004'::uuid,'71000000-0000-4000-8000-000000000004'::uuid),
    ('70000000-0000-4000-8000-000000000005'::uuid,'71000000-0000-4000-8000-000000000005'::uuid),
    ('70000000-0000-4000-8000-000000000006'::uuid,'71000000-0000-4000-8000-000000000006'::uuid)
)
INSERT INTO agent_workflow_versions (
  id,workflow_id,version_number,definition,tool_policy,model_policy,budget_policy,trigger_policy,checksum
)
SELECT version_id,workflow_id,1,
  '{"steps":[{"id":"start","type":"START"},{"id":"end","type":"END"}]}'::jsonb,
  '{"mode":"ALLOWLIST","allowedTools":[]}'::jsonb,
  '{"taskType":"EDUCATION_PREVIEW","maxInputTokens":8000,"maxOutputTokens":2000,"maxCalls":2,"maxEstimatedCost":0.5,"timeout":60000}'::jsonb,
  '{"maxToolCalls":0,"maxProposals":2,"maxRunMs":180000}'::jsonb,
  '{"events":[],"cooldownSeconds":600}'::jsonb,
  encode(digest((workflow_id::text || ':phase7:v1'),'sha256'),'hex')
FROM templates
ON CONFLICT (id) DO NOTHING;

UPDATE agent_workflows workflow
SET current_version_id = template.version_id
FROM (VALUES
  ('70000000-0000-4000-8000-000000000001'::uuid,'71000000-0000-4000-8000-000000000001'::uuid),
  ('70000000-0000-4000-8000-000000000002'::uuid,'71000000-0000-4000-8000-000000000002'::uuid),
  ('70000000-0000-4000-8000-000000000003'::uuid,'71000000-0000-4000-8000-000000000003'::uuid),
  ('70000000-0000-4000-8000-000000000004'::uuid,'71000000-0000-4000-8000-000000000004'::uuid),
  ('70000000-0000-4000-8000-000000000005'::uuid,'71000000-0000-4000-8000-000000000005'::uuid),
  ('70000000-0000-4000-8000-000000000006'::uuid,'71000000-0000-4000-8000-000000000006'::uuid)
) AS template(workflow_id, version_id)
WHERE workflow.id = template.workflow_id AND workflow.current_version_id IS NULL;

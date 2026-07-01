const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { getTestDatabaseUrl } = require('../helpers/testDatabase');

const databaseUrl = getTestDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET = 'phase7-integration-only-secret';

const { migrate } = require('../../src/utils/migrate');
const { pool: appPool } = require('../../src/config/db');
const app = require('../../src/app');
const { buildAccessContext } = require('../../src/services/accessContext');
const { createEducationServices } = require('../../src/services/education');
const { assertSafeSchema } = require('../../src/services/education/AcademicResearchService');

const adminPool = new Pool({ connectionString: databaseUrl });
const silentLogger = { log() {} };

class FakeEducationModel {
  constructor() { this.outputs = []; this.calls = 0; }
  push(output, usage = {}) { this.outputs.push({ output, ...usage }); }
  async call() {
    this.calls += 1;
    if (!this.outputs.length) throw Object.assign(new Error('No fake model output queued.'), { code: 'FAKE_OUTPUT_REQUIRED' });
    return { provider: 'fake', model: 'fake-education-v1', inputTokens: 40, outputTokens: 20, estimatedCost: 0.002, ...this.outputs.shift() };
  }
}

async function resetDatabase() {
  await adminPool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await adminPool.query('CREATE SCHEMA public');
  await migrate({ dbPool: adminPool, logger: silentLogger });
}

async function seedUser(email) {
  const id = crypto.randomUUID();
  const role = await adminPool.query("SELECT id FROM roles WHERE role_name='Users'");
  await adminPool.query(
    `INSERT INTO users (id,role_id,first_name,last_name,email,password_hash,is_active)
     VALUES ($1,$2,'Phase','Seven',$3,'unused',true)`, [id, role.rows[0].id, email]
  );
  return id;
}

async function seedFirm(ownerId, name) {
  const id = crypto.randomUUID();
  await adminPool.query('INSERT INTO law_firms (id,name,owner_id,is_active) VALUES ($1,$2,$3,true)', [id, name, ownerId]);
  await adminPool.query("INSERT INTO firm_users (firm_id,user_id,firm_role,is_active) VALUES ($1,$2,'kurucu',true)", [id, ownerId]);
  return id;
}

async function addMember(firmId, userId, role = 'avukat') {
  await adminPool.query('INSERT INTO firm_users (firm_id,user_id,firm_role,is_active) VALUES ($1,$2,$3,true)', [firmId, userId, role]);
}

async function subscribe(userId, planName) {
  await adminPool.query(
    `INSERT INTO user_subscriptions (user_id,plan_id,start_date,end_date,is_active)
     SELECT $1,id,CURRENT_DATE,CURRENT_DATE+30,true FROM subscription_plans WHERE plan_name=$2`, [userId, planName]
  );
}

async function seedSource({ title, type = 'COURT_DECISION', visibility = 'PUBLIC', organizationId = null, ownerUserId = null, court = 'Yargitay 9. Hukuk Dairesi', caseNumber = '2026/100', decisionNumber = '2026/200', decisionDate = '2026-06-01', content = 'Isverenin esit davranma borcu vardir. Fesih olculu ve gerekceli olmalidir.' }) {
  const id = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(`${id}:${content}`).digest('hex');
  await adminPool.query(
    `INSERT INTO legal_sources (
       id,source_type,title,court,case_number,decision_number,decision_date,official_source,
       content,content_hash,canonical_key,visibility,organization_id,owner_user_id,source_url
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13,$14)`,
    [id, type, title, court, caseNumber, decisionNumber, decisionDate, content, hash,
      crypto.createHash('sha256').update(`canonical:${id}`).digest('hex'), visibility, organizationId, ownerUserId,
      type === 'LEGISLATION' ? null : `https://official.example/${id}`]
  );
  const chunkId = crypto.randomUUID();
  await adminPool.query(
    `INSERT INTO legal_source_chunks (id,source_id,chunk_type,chunk_index,heading,content,content_hash,chunk_fingerprint)
     VALUES ($1,$2,$3,0,'Gerekce',$4,$5,$6)`,
    [chunkId, id, type === 'LEGISLATION' ? 'LEGISLATION_ARTICLE' : 'REASONING', content, hash,
      crypto.createHash('sha256').update(`chunk:${id}`).digest('hex')]
  );
  return { id, chunkId, content, title };
}

async function context(userId) { return buildAccessContext(userId, { db: appPool }); }
function token(userId) { return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' }); }
async function api(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    headers: { ...(options.auth ? { Authorization: `Bearer ${options.auth}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { response, data: await response.json().catch(() => null) };
}

test('Phase 7 education and academic workspaces', async (t) => {
  let server;
  t.after(async () => {
    await new Promise((resolve) => server?.close(resolve) || resolve());
    await appPool.end(); await adminPool.end();
  });

  await resetDatabase();
  const owner = await seedUser('phase7-owner@example.test');
  const academic = await seedUser('phase7-academic@example.test');
  const student = await seedUser('phase7-student@example.test');
  const studentTwo = await seedUser('phase7-student-two@example.test');
  const outsider = await seedUser('phase7-outsider@example.test');
  const firmA = await seedFirm(owner, 'Phase 7 Institution A');
  const firmB = await seedFirm(outsider, 'Phase 7 Institution B');
  await addMember(firmA, academic, 'ortak');
  await subscribe(academic, 'Academic');
  await subscribe(student, 'Student');
  await subscribe(studentTwo, 'Student');

  const ownerCtx = await context(owner);
  const academicCtx = await context(academic);
  const studentCtx = await context(student);
  const studentTwoCtx = await context(studentTwo);
  const outsiderCtx = await context(outsider);
  const fake = new FakeEducationModel();
  const services = createEducationServices({ db: appPool, model: fake });
  const source = await seedSource({ title: 'Grounded labor decision' });
  const incompleteSource = await seedSource({ title: 'Legislation without URL', type: 'LEGISLATION', court: null, caseNumber: null, decisionNumber: null, decisionDate: null, content: 'Madde 5 esitlik ilkesini duzenler.' });
  const foreignSource = await seedSource({ title: 'Foreign private source', visibility: 'ORGANIZATION', organizationId: firmB });

  await t.test('migration 010 is recorded, idempotent and seeds passive agents', async () => {
    const migration = await adminPool.query("SELECT checksum FROM schema_migrations WHERE version='20260630_010_phase7_education_academia'");
    assert.equal(migration.rows[0].checksum.length, 64);
    assert.equal((await migrate({ dbPool: adminPool, logger: silentLogger })).applied, 0);
    const templates = await adminPool.query("SELECT count(*)::int AS count,bool_and(status='DRAFT') AS passive FROM agent_workflows WHERE workflow_type IN ('CASE_BRIEF_ASSISTANT','STUDY_NOTE_REVIEW','QUIZ_GENERATOR','MOOT_COURT_COACH','RESEARCH_SOURCE_MONITOR','ACADEMIC_CODING_ASSISTANT')");
    assert.deepEqual(templates.rows[0], { count: 6, passive: true });
  });

  let studentWorkspace;
  await t.test('personal student workspace is visible only to its owner', async () => {
    studentWorkspace = await services.workspaceService.create({ workspaceType: 'STUDENT', title: 'Student private', academicLevel: 'UNDERGRADUATE' }, studentCtx);
    assert.equal((await services.workspaceService.get(studentWorkspace.id, studentCtx)).id, studentWorkspace.id);
    await assert.rejects(services.workspaceService.get(studentWorkspace.id, outsiderCtx), (error) => error.code === 'LEARNING_WORKSPACE_NOT_FOUND');
    assert.equal((await services.workspaceService.list(outsiderCtx, { workspaceType: 'STUDENT' })).items.length, 0);
  });

  let project;
  await t.test('organization academic workspace is isolated from another tenant', async () => {
    project = await services.researchService.createProject({ organizationId: firmA, title: 'Tenant research' }, academicCtx);
    await assert.rejects(services.researchService.getProject(project.id, outsiderCtx), (error) => error.code === 'LEARNING_WORKSPACE_NOT_FOUND');
  });

  await t.test('student plan is denied by the professional finance backend', async () => {
    server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const result = await api(base, '/api/v1/invoices', { auth: token(student) });
    assert.equal(result.response.status, 403);
    assert.equal(result.data.code, 'FEATURE_NOT_ENTITLED');
  });

  await t.test('education entitlement is enforced by backend service', async () => {
    const denied = await services.entitlements.has(studentCtx, 'ACADEMIC_RESEARCH');
    assert.equal(denied, false);
    await assert.rejects(services.researchService.createProject({ title: 'Forbidden' }, studentCtx), (error) => error.code === 'FEATURE_NOT_ENTITLED');
  });

  let brief;
  await t.test('case brief accepts only a real accessible source', async () => {
    brief = await services.briefService.create(studentWorkspace.id, { legalSourceId: source.id }, studentCtx);
    assert.equal(brief.case_number, '2026/100');
    await assert.rejects(services.briefService.create(studentWorkspace.id, { legalSourceId: crypto.randomUUID() }, studentCtx), (error) => error.code === 'LEGAL_SOURCE_NOT_FOUND');
  });

  await t.test('invented decision number is rejected', async () => {
    await assert.rejects(services.briefService.create(studentWorkspace.id, { legalSourceId: source.id, decisionNumber: '2099/999' }, studentCtx), (error) => error.code === 'SOURCE_METADATA_MISMATCH');
  });

  await t.test('generated case brief is grounded in a real source chunk', async () => {
    const citations = ['facts','legalIssue','holding','reasoning','significance'].map((field) => ({ field, sourceId: source.id, chunkId: source.chunkId, excerpt: 'esit davranma borcu' }));
    fake.push({
      facts: 'Isveren esit davranma islemi yapmistir.',
      legalIssue: 'Esit davranma borcu uygulanir.',
      holding: 'Fesih olculu ve gerekceli olmalidir.',
      reasoning: 'Isverenin esit davranma borcu ve olculu fesih ilkesi belirleyicidir.',
      dissent: null,
      significance: 'Esit davranma borcu ile olculu fesih denetimi onemlidir.',
      citations,
    });
    const generated = await services.briefService.generate(brief.id, studentCtx);
    assert.equal(generated.status, 'AI_SUGGESTED');
    assert.ok(generated.suggestion.citations.every((item) => item.chunkId === source.chunkId));
  });

  await t.test('case brief acceptance creates an immutable version', async () => {
    const updated = await services.briefService.update(brief.id, { acceptSuggestion: true }, studentCtx);
    assert.equal(updated.verification_status, 'VERIFIED');
    const versions = await adminPool.query('SELECT * FROM case_brief_versions WHERE brief_id=$1 ORDER BY version_number', [brief.id]);
    assert.equal(versions.rowCount, 2);
    await assert.rejects(adminPool.query("UPDATE case_brief_versions SET content='{}' WHERE id=$1", [versions.rows[0].id]), /immutable/);
  });

  let note;
  await t.test('study note AI output remains a pending suggestion', async () => {
    note = await services.noteService.create(studentWorkspace.id, { title: 'Original note', plainText: 'Original', contentJson: { type: 'doc', content: [] } }, studentCtx);
    fake.push({ contentJson: { type: 'doc', content: [{ type: 'paragraph' }] }, plainText: 'Suggested', sourceIds: [source.id] });
    const suggestion = await services.noteService.suggest(note.id, { operation: 'SIMPLIFY', sourceIds: [source.id] }, studentCtx);
    assert.equal(suggestion.status, 'PENDING');
    assert.equal((await services.noteService.get(note.id, studentCtx)).plain_text, 'Original');
  });

  await t.test('flashcards cannot use another tenant source', async () => {
    await assert.rejects(services.quizService.generateFlashcards(studentWorkspace.id, { sourceIds: [foreignSource.id], count: 2 }, studentCtx), (error) => error.code === 'LEGAL_SOURCE_NOT_FOUND');
  });

  let objectiveQuiz;
  await t.test('quiz explanation remains linked to a real source', async () => {
    objectiveQuiz = await services.quizService.createQuiz(studentWorkspace.id, {
      title: 'Grounded quiz', quizType: 'SELF_ASSESSMENT', questions: [{ questionType: 'MULTIPLE_CHOICE', prompt: 'Ilke nedir?', options: [{ id: 'a', text: 'Esitlik' }, { id: 'b', text: 'Belirsizlik' }], answerSchema: { correctOptionId: 'a' }, explanation: 'Esit davranma borcu kaynaktadir.', sourceIds: [source.id], points: 5 }],
    }, studentCtx);
    const row = await adminPool.query('SELECT source_ids,explanation FROM quiz_questions WHERE quiz_set_id=$1', [objectiveQuiz.id]);
    assert.deepEqual(row.rows[0].source_ids, [source.id]); assert.match(row.rows[0].explanation, /kaynaktadir/);
  });

  await t.test('multiple choice requires exactly one valid answer', async () => {
    await assert.rejects(services.quizService.createQuiz(studentWorkspace.id, { title: 'Bad quiz', questions: [{ questionType: 'MULTIPLE_CHOICE', prompt: 'Bad', options: [{ id: 'a', text: 'A' }], answerSchema: { correctOptionId: 'missing' }, explanation: 'Grounded', sourceIds: [source.id] }] }, studentCtx), (error) => error.code === 'INVALID_MULTIPLE_CHOICE_SCHEMA');
  });

  let writtenQuiz;
  await t.test('short answer receives rubric-based advisory scoring', async () => {
    writtenQuiz = await services.quizService.createQuiz(studentWorkspace.id, { title: 'Written quiz', questions: [{ questionType: 'SHORT_ANSWER', prompt: 'Esitligi acikla', answerSchema: { rubric: { legalRule: 2, sourceUse: 2 }, modelAnswer: 'Esit davranma' }, explanation: 'Kaynak esitlik ilkesini destekler.', sourceIds: [source.id], points: 4 }] }, studentCtx);
    const attempt = await services.quizService.createAttempt(writtenQuiz.id, studentCtx);
    const question = await adminPool.query('SELECT id FROM quiz_questions WHERE quiz_set_id=$1', [writtenQuiz.id]);
    fake.push({ score: 3, feedback: 'Kural dogru, kaynak kullanimi gelistirilmeli.', citationIds: [source.id] });
    const submitted = await services.quizService.submitAttempt(attempt.id, { answers: [{ questionId: question.rows[0].id, answer: { text: 'Esit davranma borcu vardir.' } }] }, studentCtx);
    assert.equal(Number(submitted.score), 3); assert.equal(submitted.feedback.advisoryAiScores, true);
  });

  let course;
  await t.test('course invitation is single-use', async () => {
    course = await services.courseService.create({ title: 'Labor Law 101', status: 'ACTIVE' }, academicCtx);
    const invitation = await services.courseService.invite(course.id, { email: 'phase7-student@example.test', role: 'STUDENT' }, academicCtx);
    assert.equal((await services.courseService.acceptInvitation(invitation.token, studentCtx)).status, 'ACTIVE');
    await assert.rejects(services.courseService.acceptInvitation(invitation.token, studentCtx), (error) => error.code === 'COURSE_INVITATION_INVALID');
  });

  let assignment;
  let secondSubmission;
  await t.test('AI evaluation never finalizes an official assignment grade', async () => {
    assignment = await services.courseService.createAssignment(course.id, { title: 'Essay', status: 'PUBLISHED', aiPolicy: 'AI_ALLOWED', rubric: {}, lateSubmissionPolicy: 'ALLOW' }, academicCtx);
    const submission = await services.courseService.submit(assignment.id, { content: { text: 'Student work' } }, studentCtx);
    assert.equal(submission.grade, null); assert.equal(submission.graded_by, null);
  });

  await t.test('student cannot view another student submission', async () => {
    const invitation = await services.courseService.invite(course.id, { email: 'phase7-student-two@example.test', role: 'STUDENT' }, academicCtx);
    await services.courseService.acceptInvitation(invitation.token, studentTwoCtx);
    secondSubmission = await services.courseService.submit(assignment.id, { content: { text: 'Second private work' } }, studentTwoCtx);
    await assert.rejects(services.courseService.getSubmission(secondSubmission.id, studentCtx), (error) => error.code === 'COURSE_PERMISSION_DENIED');
  });

  await t.test('unauthorized user cannot grade a submission', async () => {
    await assert.rejects(services.courseService.grade(secondSubmission.id, { grade: 90 }, studentTwoCtx), (error) => error.code === 'COURSE_PERMISSION_DENIED');
    assert.equal(Number((await services.courseService.grade(secondSubmission.id, { grade: 90, feedback: 'Reviewed' }, academicCtx)).grade), 90);
  });

  await t.test('AI prohibited assignment blocks generation endpoints', async () => {
    const blocked = await services.courseService.createAssignment(course.id, { title: 'Closed AI exam', status: 'PUBLISHED', aiPolicy: 'AI_PROHIBITED' }, academicCtx);
    await assert.rejects(services.quizService.createQuiz(studentWorkspace.id, { title: 'Forbidden generation', assignmentId: blocked.id, generate: true, sourceIds: [source.id] }, studentCtx), (error) => error.code === 'AI_POLICY_PROHIBITS_OPERATION');
  });

  let scenario;
  await t.test('moot assistant cannot invent a source ID', async () => {
    scenario = await services.mootService.createScenario({ workspaceId: studentWorkspace.id, title: 'Moot', facts: 'Farazi olay', sourceIds: [source.id], roles: ['CLAIMANT','RESPONDENT'], status: 'ACTIVE' }, studentCtx);
    const session = await services.mootService.startSession(scenario.id, { selectedRole: 'CLAIMANT' }, studentCtx);
    fake.push({ response: 'Karsi gorus', citations: [{ sourceId: crypto.randomUUID() }], rubricFeedback: { summary: 'Kisa' } });
    await assert.rejects(services.mootService.message(session.id, { message: 'Arguman' }, studentCtx), (error) => error.code === 'AI_SOURCE_OUT_OF_SCOPE');
  });

  await t.test('non-member cannot view a research project', async () => {
    await assert.rejects(services.researchService.getProject(project.id, studentCtx), (error) => error.code === 'LEARNING_WORKSPACE_NOT_FOUND');
    await assert.rejects(services.researchService.getProject(project.id, ownerCtx), (error) => error.code === 'LEARNING_WORKSPACE_NOT_FOUND');
    assert.equal((await services.workspaceService.list(ownerCtx, { workspaceType: 'RESEARCH_PROJECT' })).items.some((item) => item.project_id === project.id), false);
  });

  await t.test('coding schema rejects arbitrary code', async () => {
    assert.throws(() => assertSafeSchema({ type: 'object', script: 'return process.env' }), (error) => error.code === 'ARBITRARY_CODE_REJECTED');
  });

  let schemaV1;
  await t.test('coded record preserves the original schema version', async () => {
    const definition = { type: 'object', required: ['claimAccepted'], properties: { claimAccepted: { type: 'boolean' }, category: { type: 'string' } } };
    schemaV1 = await services.researchService.createCodingSchema(project.id, { name: 'Decision coding', definition, status: 'ACTIVE' }, academicCtx);
    const coded = await services.researchService.codeSource(project.id, { schemaId: schemaV1.id, legalSourceId: source.id, codedValues: { claimAccepted: true, category: 'labor' } }, academicCtx);
    await services.researchService.createCodingSchema(project.id, { name: 'Decision coding', definition: { ...definition, properties: { ...definition.properties, damages: { type: 'boolean' } } } }, academicCtx);
    assert.equal(coded.schema_version, 1);
    assert.equal((await adminPool.query('SELECT schema_version FROM coded_source_items WHERE id=$1', [coded.id])).rows[0].schema_version, 1);
  });

  await t.test('one researcher does not overwrite another researcher coding', async () => {
    await adminPool.query("INSERT INTO research_project_members (project_id,user_id,role,permissions) VALUES ($1,$2,'RESEARCHER','{\"read\":true,\"write\":true}'::jsonb)", [project.id, student]);
    await services.researchService.codeSource(project.id, { schemaId: schemaV1.id, legalSourceId: source.id, codedValues: { claimAccepted: false, category: 'counter' } }, studentCtx);
    const rows = await adminPool.query('SELECT coded_by,coded_values FROM coded_source_items WHERE project_id=$1 AND schema_id=$2 AND legal_source_id=$3', [project.id, schemaV1.id, source.id]);
    assert.equal(rows.rowCount, 2); assert.equal(new Set(rows.rows.map((row) => row.coded_by)).size, 2);
  });

  await t.test('CSV export contains only the requested project scope', async () => {
    const other = await services.researchService.createProject({ organizationId: firmB, title: 'Other tenant project' }, outsiderCtx);
    const otherSchema = await services.researchService.createCodingSchema(other.id, { name: 'Other', definition: { type: 'object', properties: { flag: { type: 'boolean' } } } }, outsiderCtx);
    await services.researchService.codeSource(other.id, { schemaId: otherSchema.id, legalSourceId: foreignSource.id, codedValues: { flag: true } }, outsiderCtx);
    const csv = (await services.exportService.exportProject(project.id, 'CSV', academicCtx)).buffer.toString('utf8');
    assert.match(csv, /Grounded labor decision/); assert.doesNotMatch(csv, /Foreign private source/);
  });

  await t.test('RIS and BibTeX mark missing metadata without inventing it', async () => {
    await services.researchService.codeSource(project.id, { schemaId: schemaV1.id, legalSourceId: incompleteSource.id, codedValues: { claimAccepted: true, category: 'statute' } }, academicCtx);
    const ris = (await services.exportService.exportProject(project.id, 'RIS', academicCtx)).buffer.toString('utf8');
    const bib = (await services.exportService.exportProject(project.id, 'BIBTEX', academicCtx)).buffer.toString('utf8');
    assert.match(ris, /missing metadata: sourceUrl/); assert.match(bib, /missing metadata: sourceUrl/);
  });

  await t.test('professional Matter document cannot be read or attached through education', async () => {
    const caseId = crypto.randomUUID(); const documentId = crypto.randomUUID();
    await adminPool.query("INSERT INTO cases (id,firm_id,law_firm_id,scope_type,konu,esas_no,mahkeme,is_active) VALUES ($1,$2,$2,'ORGANIZATION','Private matter','2026/7','Test',true)", [caseId, firmA]);
    await adminPool.query("INSERT INTO case_documents (id,case_id,firm_id,document_name,file_url,file_name,title,uploaded_by,processing_status) VALUES ($1,$2,$3,'secret.pdf','private','secret.pdf','Secret',$4,'COMPLETED')", [documentId, caseId, firmA, owner]);
    await assert.rejects(services.access.getSource(documentId, null, studentCtx), (error) => error.code === 'LEGAL_SOURCE_NOT_FOUND');
    const attachmentAssignment = await services.courseService.createAssignment(course.id, { title: 'Attachment', status: 'PUBLISHED', lateSubmissionPolicy: 'ALLOW' }, academicCtx);
    await assert.rejects(services.courseService.submit(attachmentAssignment.id, { content: { text: 'x' }, attachmentDocumentId: documentId }, studentCtx), (error) => error.code === 'PROFESSIONAL_DOCUMENT_FORBIDDEN');
  });

  await t.test('education agent templates cannot submit assignments', async () => {
    const definitions = await adminPool.query("SELECT version.definition FROM agent_workflows workflow JOIN agent_workflow_versions version ON version.id=workflow.current_version_id WHERE workflow.workflow_type IN ('CASE_BRIEF_ASSISTANT','STUDY_NOTE_REVIEW','QUIZ_GENERATOR','MOOT_COURT_COACH','RESEARCH_SOURCE_MONITOR','ACADEMIC_CODING_ASSISTANT')");
    assert.ok(definitions.rows.every((row) => row.definition.steps.every((step) => step.type !== 'CREATE_PROPOSAL' && step.tool !== 'assignment.submit')));
  });

  await t.test('quiz AI token and cost usage is recorded', async () => {
    fake.push({ questions: [{ questionType: 'MULTIPLE_CHOICE', prompt: 'Generated?', options: [{ id: 'yes', text: 'Yes' }, { id: 'no', text: 'No' }], answerSchema: { correctOptionId: 'yes' }, explanation: 'Source supports yes.', sourceIds: [source.id], difficulty: 'EASY', points: 1 }] }, { inputTokens: 75, outputTokens: 35, estimatedCost: 0.01 });
    const generated = await services.quizService.createQuiz(studentWorkspace.id, { title: 'Measured quiz', generate: true, sourceIds: [source.id], questionCount: 1 }, studentCtx);
    const usage = await adminPool.query('SELECT * FROM education_ai_usage WHERE id=$1', [generated.aiUsageId]);
    assert.equal(usage.rows[0].input_tokens, 75); assert.equal(Number(usage.rows[0].estimated_cost), 0.01);
  });

  await t.test('audit metadata never contains the full student answer', async () => {
    const secretAnswer = 'VERY_PRIVATE_STUDENT_ANSWER_7Q9';
    const quiz = await services.quizService.createQuiz(studentWorkspace.id, { title: 'Audit quiz', questions: [{ questionType: 'TRUE_FALSE', prompt: 'True?', answerSchema: { correctAnswer: true }, explanation: 'Grounded explanation', sourceIds: [source.id], points: 1 }] }, studentCtx);
    const attempt = await services.quizService.createAttempt(quiz.id, studentCtx);
    const question = await adminPool.query('SELECT id FROM quiz_questions WHERE quiz_set_id=$1', [quiz.id]);
    await services.quizService.submitAttempt(attempt.id, { answers: [{ questionId: question.rows[0].id, answer: { value: secretAnswer } }] }, studentCtx);
    const audit = await adminPool.query("SELECT metadata::text FROM audit_logs WHERE action='QUIZ_ATTEMPT_SUBMITTED' ORDER BY created_at DESC LIMIT 1");
    assert.doesNotMatch(audit.rows[0].metadata, new RegExp(secretAnswer));
  });

  await t.test('study note DOCX and PDF exports contain no internal metadata fields', async () => {
    const docx = await services.exportService.exportNote(note.id, 'DOCX', studentCtx);
    const pdf = await services.exportService.exportNote(note.id, 'PDF', studentCtx);
    assert.ok(docx.buffer.length > 100); assert.ok(pdf.buffer.length > 100);
    assert.equal(docx.filename.endsWith('.docx'), true); assert.equal(pdf.filename.endsWith('.pdf'), true);
  });
});

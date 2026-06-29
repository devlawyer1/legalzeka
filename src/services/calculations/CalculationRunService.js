const crypto = require('node:crypto');
const { pool } = require('../../config/db');
const { canonicalize } = require('./RuleValidator');
const { DraftService, organizationIds } = require('../drafting/DraftService');

function runError(status, message, code) { return Object.assign(new Error(message), { status, code }); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex'); }

class CalculationRunService {
  constructor({ db = pool, draftService = null } = {}) {
    this.db = db; this.draftService = draftService || new DraftService({ db });
  }

  async resolveScope(input, accessContext, permission = 'write', { db = this.db } = {}) {
    if (input.caseId) {
      const matter = await this.draftService.findMatter(input.caseId, accessContext, permission, { db });
      if (!matter) throw runError(404, 'Matter bulunamadı veya erişim yok.', 'MATTER_NOT_FOUND');
      if (input.organizationId && input.organizationId !== matter.law_firm_id) throw runError(403, 'Matter başka bir kapsama ait.', 'MATTER_SCOPE_MISMATCH');
      if (input.draftId) {
        const draft = await this.draftService.findAccessibleDraft(input.draftId, accessContext, permission, { db });
        if (!draft || draft.case_id !== matter.id) throw runError(404, 'Draft bulunamadı veya Matter ile eşleşmiyor.', 'DRAFT_NOT_FOUND');
      }
      return { matter, organizationId: matter.scope_type === 'ORGANIZATION' ? matter.law_firm_id : null, ownerUserId: matter.scope_type === 'PERSONAL' ? matter.owner_user_id : null };
    }
    if (input.draftId) throw runError(400, 'Draft bağlantısı için caseId gerekli.', 'CASE_REQUIRED_FOR_DRAFT');
    if (input.organizationId) {
      if (!organizationIds(accessContext, permission).includes(input.organizationId) && !accessContext.isSystemAdmin) throw runError(403, 'Büro kapsamına erişim yok.', 'ORGANIZATION_FORBIDDEN');
      return { matter: null, organizationId: input.organizationId, ownerUserId: null };
    }
    return { matter: null, organizationId: null, ownerUserId: accessContext.userId };
  }

  accessPredicate(accessContext, values, alias = 'run') {
    if (accessContext.isSystemAdmin) return 'TRUE';
    values.push(accessContext.userId); const owner = values.length;
    values.push(organizationIds(accessContext)); const orgs = values.length;
    return `((${alias}.organization_id IS NULL AND ${alias}.owner_user_id = $${owner}) OR ${alias}.organization_id = ANY($${orgs}::uuid[]))`;
  }

  async create({ input, calculationType, output, effectiveAt, idempotencyKey, accessContext, parentRunId = null }) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const scope = await this.resolveScope(input, accessContext, 'write', { db: client });
      if (idempotencyKey) {
        const existing = await client.query('SELECT id FROM calculation_runs WHERE user_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL', [accessContext.userId, idempotencyKey]);
        if (existing.rows[0]) { await client.query('COMMIT'); return this.get(existing.rows[0].id, accessContext); }
      }
      const rule = output.rule || null;
      const snapshot = {
        engineVersion: 1, calculationType, effectiveAt, input: canonicalize(input),
        rule: rule ? { id: rule.id, ruleSetId: rule.rule_set_id, versionNumber: rule.version_number, effectiveFrom: rule.effective_from, effectiveTo: rule.effective_to, checksum: rule.checksum, legalReference: rule.legal_reference, officialSourceReference: rule.official_source_reference, definition: rule.rule_definition, inputSchema: rule.input_schema, outputSchema: rule.output_schema } : null,
        ...(output.snapshot || {}),
      };
      const resultHash = hash({ status: output.status, result: output.result || {}, steps: output.steps || [], warnings: output.warnings || [], snapshot });
      const inserted = await client.query(
        `INSERT INTO calculation_runs (
          user_id, organization_id, owner_user_id, case_id, draft_id, parent_run_id,
          calculation_type, rule_set_id, rule_version_id, status, input_data, result_data,
          rule_snapshot, effective_at, idempotency_key, result_hash, calculated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,now()) RETURNING *`,
        [accessContext.userId, scope.organizationId, scope.ownerUserId, input.caseId || null, input.draftId || null, parentRunId,
          calculationType, rule?.rule_set_id || null, rule?.id || null, output.status, JSON.stringify(input), JSON.stringify(output.result || {}), JSON.stringify(snapshot), effectiveAt, idempotencyKey || null, resultHash]
      );
      const run = inserted.rows[0];
      for (const [index, step] of (output.steps || []).entries()) {
        await client.query(
          `INSERT INTO calculation_steps (calculation_run_id, step_number, step_code, title, input_snapshot, operation, result, explanation, legal_source_id)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9)`,
          [run.id, index + 1, step.stepCode, step.title, JSON.stringify(step.inputSnapshot || {}), step.operation, JSON.stringify(step.result || {}), step.explanation, step.legalSourceId || null]
        );
      }
      for (const item of output.warnings || []) {
        await client.query(
          `INSERT INTO calculation_warnings (calculation_run_id, warning_code, severity, message, field_name, metadata)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [run.id, item.warningCode, item.severity, item.message, item.fieldName || null, JSON.stringify(item.metadata || {})]
        );
      }
      if (input.caseId) await client.query("INSERT INTO calculation_links (calculation_run_id, case_id, draft_id, relation_type) VALUES ($1,$2,$3,'CASE_CONTEXT') ON CONFLICT DO NOTHING", [run.id, input.caseId, input.draftId || null]);
      if (input.draftId) await client.query("INSERT INTO calculation_links (calculation_run_id, case_id, draft_id, relation_type) VALUES ($1,$2,$3,'DRAFT_CONTEXT') ON CONFLICT DO NOTHING", [run.id, input.caseId, input.draftId]);
      await client.query('COMMIT');
      return this.get(run.id, accessContext);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async list(accessContext, { caseId = null, limit = 50 } = {}) {
    const values = []; const filters = ['run.deleted_at IS NULL', this.accessPredicate(accessContext, values)];
    if (caseId) { values.push(caseId); filters.push(`run.case_id = $${values.length}`); }
    values.push(Math.max(1, Math.min(Number(limit) || 50, 200)));
    const { rows } = await this.db.query(
      `SELECT run.*, rule_set.rule_code, version.version_number, version.legal_reference
       FROM calculation_runs run LEFT JOIN legal_rule_sets rule_set ON rule_set.id = run.rule_set_id
       LEFT JOIN legal_rule_versions version ON version.id = run.rule_version_id
       WHERE ${filters.join(' AND ')} ORDER BY run.created_at DESC LIMIT $${values.length}`, values
    );
    return rows;
  }

  async get(id, accessContext, { db = this.db } = {}) {
    const values = [id]; const access = this.accessPredicate(accessContext, values);
    const result = await db.query(`SELECT * FROM calculation_runs run WHERE run.id = $1 AND run.deleted_at IS NULL AND ${access}`, values);
    if (!result.rows[0]) throw runError(404, 'Hesaplama bulunamadı.', 'CALCULATION_NOT_FOUND');
    const steps = await db.query('SELECT * FROM calculation_steps WHERE calculation_run_id = $1 ORDER BY step_number', [id]);
    const warnings = await db.query('SELECT * FROM calculation_warnings WHERE calculation_run_id = $1 ORDER BY created_at', [id]);
    const links = await db.query('SELECT * FROM calculation_links WHERE calculation_run_id = $1 ORDER BY created_at', [id]);
    return { ...result.rows[0], steps: steps.rows, warnings: warnings.rows, links: links.rows };
  }

  async void(id, accessContext) {
    const current = await this.get(id, accessContext);
    if (current.status === 'VOID') return current;
    await this.db.query("UPDATE calculation_runs SET status = 'VOID', deleted_at = now(), updated_at = now() WHERE id = $1", [id]);
    return { ...current, status: 'VOID' };
  }

  async confirm(id, accessContext) {
    const current = await this.get(id, accessContext);
    if (current.status === 'CONFIRMED') return current;
    if (current.status !== 'CALCULATED') throw runError(409, 'Yalnızca kesin hesaplar onaylanabilir.', 'CALCULATION_NOT_CONFIRMABLE');
    const { rows } = await this.db.query("UPDATE calculation_runs SET status = 'CONFIRMED', confirmed_by = $2, confirmed_at = now(), updated_at = now() WHERE id = $1 AND status = 'CALCULATED' RETURNING *", [id, accessContext.userId]);
    return this.get(rows[0].id, accessContext);
  }

  async createDeadline(id, accessContext) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const run = await this.get(id, accessContext, { db: client });
      if (run.status !== 'CONFIRMED') throw runError(409, 'Deadline için hesap onaylanmalı.', 'CALCULATION_NOT_CONFIRMED');
      const finalDate = run.result_data.finalDate;
      if (!finalDate) throw runError(409, 'Hesap sonucu bir nihai tarih içermiyor.', 'FINAL_DATE_MISSING');
      const existing = await client.query('SELECT * FROM deadline_alerts WHERE calculation_run_id = $1', [id]);
      if (existing.rows[0]) { await client.query('COMMIT'); return existing.rows[0]; }
      const warnings = run.warnings.map((item) => ({ code: item.warning_code, severity: item.severity, message: item.message }));
      const inserted = await client.query(
        `INSERT INTO deadline_alerts (firm_id, owner_user_id, case_id, title, description, deadline_date,
           alert_type, priority, source, source_ref, created_by, calculation_run_id, rule_version_id, calculation_warnings)
         VALUES ($1,$2,$3,$4,$5,$6,'hukuki_sure','high','calculation',$7,$8,$9,$10,$11::jsonb) RETURNING *`,
        [run.organization_id, run.owner_user_id, run.case_id, 'Hesaplamadan oluşturulan hukuki süre', `Kural sürümü: ${run.rule_snapshot?.rule?.versionNumber || '-'}`, finalDate, id, accessContext.userId, id, run.rule_version_id, JSON.stringify(warnings)]
      );
      await client.query("INSERT INTO calculation_links (calculation_run_id, case_id, deadline_id, relation_type) VALUES ($1,$2,$3,'DEADLINE') ON CONFLICT DO NOTHING", [id, run.case_id, inserted.rows[0].id]);
      await client.query('COMMIT'); return inserted.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async createTask(id, accessContext) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN'); const run = await this.get(id, accessContext, { db: client });
      if (run.status !== 'CONFIRMED') throw runError(409, 'Görev için hesap onaylanmalı.', 'CALCULATION_NOT_CONFIRMED');
      const existing = await client.query('SELECT * FROM tasks WHERE calculation_run_id = $1', [id]);
      if (existing.rows[0]) { await client.query('COMMIT'); return existing.rows[0]; }
      const inserted = await client.query(
        `INSERT INTO tasks (id, firm_id, owner_user_id, case_id, atayan_id, baslik, aciklama, son_tarih, oncelik, durum, calculation_run_id, rule_version_id)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,'Yüksek','Yapılacak',$8,$9) RETURNING *`,
        [run.organization_id, run.owner_user_id, run.case_id, accessContext.userId, 'Hesaplama sonucu için işlem', `Kaynak hesap: ${id}`, run.result_data.finalDate || null, id, run.rule_version_id]
      );
      await client.query("INSERT INTO calculation_links (calculation_run_id, case_id, task_id, relation_type) VALUES ($1,$2,$3,'TASK') ON CONFLICT DO NOTHING", [id, run.case_id, inserted.rows[0].id]);
      await client.query('COMMIT'); return inserted.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async linkDraft(id, draftId, accessContext) {
    const run = await this.get(id, accessContext);
    const draft = await this.draftService.findAccessibleDraft(draftId, accessContext, 'write');
    if (!draft || (run.case_id && draft.case_id !== run.case_id)) throw runError(404, 'Draft bulunamadı veya hesapla eşleşmiyor.', 'DRAFT_NOT_FOUND');
    await this.db.query("INSERT INTO calculation_links (calculation_run_id, case_id, draft_id, draft_version_id, relation_type) VALUES ($1,$2,$3,$4,'DRAFT_NOTE') ON CONFLICT DO NOTHING", [id, draft.case_id, draftId, draft.current_version_id]);
    return this.get(id, accessContext);
  }
}

module.exports = { CalculationRunService, hash, runError };

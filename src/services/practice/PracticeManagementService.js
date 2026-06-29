const crypto = require('node:crypto');
const Decimal = require('decimal.js');
const { pool } = require('../../config/db');
const AuditLogService = require('../AuditLogService');
const { canUseOrganization } = require('../accessContext');
const { storage } = require('../storage');
const { requirePermission } = require('./PermissionService');
const { PracticeNotificationService } = require('./NotificationService');

function practiceError(message, status = 400, code = 'PRACTICE_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ@.+ -]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digest(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(normalize(value)).digest('hex');
}

function sensitiveReference(value) {
  if (!value) return { encrypted: null, hash: null };
  const hash = digest(value);
  const key = process.env.PRACTICE_SENSITIVE_KEY;
  if (!key || key.length < 16) return { encrypted: null, hash };
  const material = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', material, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`, hash };
}

function clampLimit(limit, fallback = 50, max = 100) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function mapStatusToLegacyStage(status) {
  switch (status) {
    case 'PROPOSAL': return 'teklif_hazirlaniyor';
    case 'WON': return 'sozlesme_imzalandi';
    case 'LOST':
    case 'ARCHIVED': return 'iptal';
    default: return 'ilk_gorusme';
  }
}

function toMoney(value) {
  const decimal = new Decimal(value || 0);
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw practiceError('Para tutari negatif veya gecersiz olamaz.', 400, 'INVALID_AMOUNT');
  }
  return decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function roleCanReadWrite(permission) {
  return permission === 'write' || permission === 'admin' ? 'write' : 'read';
}

class PracticeManagementService {
  constructor({ db = pool, notifications = new PracticeNotificationService({ db }) } = {}) {
    this.db = db;
    this.notifications = notifications;
  }

  organizationIds(context, permission = 'read') {
    if (context?.isSystemAdmin && context.memberships?.length === 0) return [];
    return (context?.memberships || [])
      .filter((membership) => {
        if (permission === 'admin') return membership.canAdmin;
        if (permission === 'write') return membership.canWrite;
        return membership.canRead;
      })
      .map((membership) => membership.lawFirmId);
  }

  resolveOrganization(context, requestedId, permissionName = 'CRM_READ') {
    const organizationId = requestedId || this.organizationIds(context, 'read')[0];
    if (!organizationId) throw practiceError('Buro secimi gerekir.', 400, 'ORGANIZATION_REQUIRED');
    requirePermission(context, organizationId, permissionName);
    return organizationId;
  }

  async audit(req, action, entityType, entityId, metadata = {}, db = this.db) {
    await AuditLogService.record({
      db,
      req,
      action,
      entityType,
      entityId,
      lawFirmId: metadata.organizationId || req?.matter?.law_firm_id || null,
      caseId: metadata.caseId || null,
      metadata,
    });
  }

  async matter(caseId, context, permission = 'read', db = this.db) {
    const { rows } = await db.query('SELECT * FROM cases WHERE id = $1 AND is_active = true LIMIT 1', [caseId]);
    const matter = rows[0];
    if (!matter) throw practiceError('Matter bulunamadi.', 404, 'MATTER_NOT_FOUND');
    if (matter.scope_type === 'PERSONAL') {
      if (context?.isSystemAdmin || matter.owner_user_id === context.userId) return matter;
      throw practiceError('Matter bulunamadi.', 404, 'MATTER_NOT_FOUND');
    }
    if (!canUseOrganization(context, matter.law_firm_id, roleCanReadWrite(permission))) {
      throw practiceError('Matter bulunamadi.', 404, 'MATTER_NOT_FOUND');
    }
    return matter;
  }

  async assertUserInOrganization(userId, organizationId, db = this.db) {
    if (!userId) return true;
    const { rowCount } = await db.query(
      `SELECT 1 FROM firm_users
       WHERE firm_id = $1 AND user_id = $2 AND is_active = true
       LIMIT 1`,
      [organizationId, userId]
    );
    if (!rowCount) throw practiceError('Atanan kullanici bu tenant icinde degil.', 403, 'ASSIGNEE_OUT_OF_TENANT');
    return true;
  }

  async createLead(input, context, { req } = {}) {
    const organizationId = this.resolveOrganization(context, input.organizationId, 'CRM_WRITE');
    if (input.assignedTo) await this.assertUserInOrganization(input.assignedTo, organizationId);
    const id = crypto.randomUUID();
    const status = input.status || 'NEW';
    const { rows } = await this.db.query(
      `INSERT INTO leads (
         id, firm_id, organization_id, name, full_name, email, phone, company_name,
         contact_info, subject, estimated_value, stage, status, source, legal_domain,
         summary, assigned_to, next_action_at, notes, created_by
       )
       VALUES ($1,$2,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$14,$17)
       RETURNING *`,
      [
        id,
        organizationId,
        input.fullName,
        input.email || null,
        input.phone || null,
        input.companyName || null,
        [input.email, input.phone].filter(Boolean).join(' / ') || null,
        input.summary || input.legalDomain || 'Yeni aday muvekkil',
        input.estimatedValue || 0,
        mapStatusToLegacyStage(status),
        status,
        input.source || null,
        input.legalDomain || null,
        input.summary || null,
        input.assignedTo || null,
        input.nextActionAt || null,
        context.userId,
      ]
    );
    await this.audit(req, 'LEAD_CREATED', 'lead', id, { organizationId, status });
    return rows[0];
  }

  async listLeads(context, filters = {}) {
    const limit = clampLimit(filters.limit);
    const offset = Math.max(Number(filters.offset) || 0, 0);
    const params = [];
    const clauses = ['l.deleted_at IS NULL'];
    if (filters.organizationId) {
      requirePermission(context, filters.organizationId, 'CRM_READ');
      params.push(filters.organizationId);
      clauses.push(`COALESCE(l.organization_id, l.firm_id) = $${params.length}`);
    } else {
      const orgs = this.organizationIds(context);
      params.push(orgs);
      clauses.push(`COALESCE(l.organization_id, l.firm_id) = ANY($${params.length}::uuid[])`);
    }
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`l.status = $${params.length}`);
    }
    params.push(limit, offset);
    const { rows } = await this.db.query(
      `SELECT l.*, COALESCE(l.full_name, l.name) AS display_name
       FROM leads l
       WHERE ${clauses.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  async getLead(leadId, context, db = this.db) {
    const { rows } = await db.query('SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [leadId]);
    const lead = rows[0];
    if (!lead) throw practiceError('Lead bulunamadi.', 404, 'LEAD_NOT_FOUND');
    requirePermission(context, lead.organization_id || lead.firm_id, 'CRM_READ');
    return lead;
  }

  async createClient(input, context, { req, db = this.db } = {}) {
    const personal = Boolean(input.personal);
    const organizationId = personal ? null : this.resolveOrganization(context, input.organizationId, 'CRM_WRITE');
    const identity = sensitiveReference(input.identityReference);
    const tax = sensitiveReference(input.taxReference);
    const { rows } = await db.query(
      `INSERT INTO clients (
         organization_id, owner_user_id, client_type, full_name, company_name,
         identity_reference_encrypted, identity_reference_hash,
         tax_reference_encrypted, tax_reference_hash,
         email, phone, address, status, created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,'ACTIVE'),$14)
       RETURNING *`,
      [
        organizationId,
        personal ? context.userId : null,
        input.clientType || 'PERSON',
        input.fullName || null,
        input.companyName || null,
        identity.encrypted,
        identity.hash,
        tax.encrypted,
        tax.hash,
        input.email || null,
        input.phone || null,
        input.address || null,
        input.status || 'ACTIVE',
        context.userId,
      ]
    );
    await this.audit(req, 'CLIENT_CREATED', 'client', rows[0].id, { organizationId, personal }, db);
    return rows[0];
  }

  async listClients(context, filters = {}) {
    const limit = clampLimit(filters.limit);
    const params = [context.userId];
    const clauses = ['c.deleted_at IS NULL'];
    if (filters.organizationId) {
      requirePermission(context, filters.organizationId, 'CRM_READ');
      params.push(filters.organizationId);
      clauses.push(`c.organization_id = $${params.length}`);
    } else {
      params.push(this.organizationIds(context));
      clauses.push(`(c.owner_user_id = $1 OR c.organization_id = ANY($${params.length}::uuid[]))`);
    }
    params.push(limit);
    const { rows } = await this.db.query(
      `SELECT c.* FROM clients c
       WHERE ${clauses.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return rows;
  }

  async getClient(clientId, context, db = this.db) {
    const { rows } = await db.query('SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [clientId]);
    const client = rows[0];
    if (!client) throw practiceError('Client bulunamadi.', 404, 'CLIENT_NOT_FOUND');
    if (client.owner_user_id) {
      if (client.owner_user_id !== context.userId && !context.isSystemAdmin) {
        throw practiceError('Client bulunamadi.', 404, 'CLIENT_NOT_FOUND');
      }
    } else {
      if (!canUseOrganization(context, client.organization_id, 'read')) {
        throw practiceError('Client bulunamadi.', 404, 'CLIENT_NOT_FOUND');
      }
    }
    return client;
  }

  async createConflictCheck(input, context, { req } = {}) {
    const organizationId = this.resolveOrganization(context, input.organizationId, 'CRM_WRITE');
    const rawTerms = [
      ...(input.queryTerms || []),
      input.name,
      input.email,
      input.phone,
      input.identityReference,
      input.taxReference,
    ].filter(Boolean);
    if (input.leadId) {
      const lead = await this.getLead(input.leadId, context);
      rawTerms.push(lead.full_name || lead.name, lead.email, lead.phone, lead.company_name);
    }
    if (input.clientId) {
      const client = await this.getClient(input.clientId, context);
      rawTerms.push(client.full_name, client.company_name, client.email, client.phone);
    }
    const terms = [...new Set(rawTerms.map((term) => String(term).trim()).filter(Boolean))];
    const normalized = terms.map(normalize).filter(Boolean);
    const matches = await this.findConflictMatches(organizationId, terms, normalized);
    const status = matches.length > 0 ? 'POTENTIAL_CONFLICT' : 'PENDING';
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO conflict_checks (
           organization_id, requested_by, case_id, lead_id, client_id,
           query_terms, status, result_summary
         )
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
         RETURNING *`,
        [
          organizationId,
          context.userId,
          input.caseId || null,
          input.leadId || null,
          input.clientId || null,
          JSON.stringify(terms),
          status,
          matches.length ? `${matches.length} potential match(es) require human review.` : 'No automatic conflict decision. Human review is required.',
        ]
      );
      const check = rows[0];
      for (const match of matches) {
        await client.query(
          `INSERT INTO conflict_check_matches (
             conflict_check_id, matched_entity_type, matched_entity_id,
             matched_name, match_reason, score, metadata
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          [check.id, match.type, match.id, match.name, match.reason, match.score, JSON.stringify(match.metadata || {})]
        );
      }
      await this.audit(req, 'CONFLICT_CHECK_CREATED', 'conflict_check', check.id, { organizationId, status, matchCount: matches.length }, client);
      await client.query('COMMIT');
      return { ...check, matches };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findConflictMatches(organizationId, terms, normalizedTerms) {
    const matches = [];
    const add = (candidate, type, name, reason, score, metadata = {}) => {
      if (!name) return;
      const key = `${type}:${candidate.id}:${reason}`;
      if (matches.some((item) => item.key === key)) return;
      matches.push({ key, type, id: candidate.id, name, reason, score, metadata });
    };

    const { rows: clients } = await this.db.query(
      `SELECT id, full_name, company_name, email, phone, identity_reference_hash, tax_reference_hash
       FROM clients
       WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId]
    );
    const { rows: leads } = await this.db.query(
      `SELECT id, COALESCE(full_name, name) AS full_name, company_name, email, phone
       FROM leads
       WHERE COALESCE(organization_id, firm_id) = $1 AND deleted_at IS NULL`,
      [organizationId]
    );
    const { rows: cases } = await this.db.query(
      `SELECT id, konu, taraf_davaci, taraf_davali, esas_no
       FROM cases
       WHERE law_firm_id = $1 AND scope_type = 'ORGANIZATION' AND is_active = true`,
      [organizationId]
    );

    const sensitiveHashes = terms.map(digest).filter(Boolean);
    for (const client of clients) {
      const names = [client.full_name, client.company_name].filter(Boolean);
      for (const name of names) {
        const n = normalize(name);
        if (normalizedTerms.includes(n)) add(client, 'CLIENT', name, 'Exact normalized client name', 1);
        else if (normalizedTerms.some((term) => term && (n.includes(term) || term.includes(n)))) add(client, 'CLIENT', name, 'Similar client name', 0.78);
      }
      if (client.email && normalizedTerms.includes(normalize(client.email))) add(client, 'CLIENT', client.full_name || client.company_name || client.email, 'Email match', 0.96);
      if (client.phone && normalizedTerms.includes(normalize(client.phone))) add(client, 'CLIENT', client.full_name || client.company_name || client.phone, 'Phone match', 0.94);
      if (sensitiveHashes.includes(client.identity_reference_hash) || sensitiveHashes.includes(client.tax_reference_hash)) {
        add(client, 'CLIENT', client.full_name || client.company_name, 'Sensitive reference hash match', 0.98);
      }
    }
    for (const lead of leads) {
      const name = lead.full_name || lead.company_name;
      const n = normalize(name);
      if (normalizedTerms.includes(n)) add(lead, 'LEAD', name, 'Prior lead exact name', 0.9);
      else if (normalizedTerms.some((term) => term && (n.includes(term) || term.includes(n)))) add(lead, 'LEAD', name, 'Prior lead similar name', 0.72);
    }
    for (const matter of cases) {
      for (const name of [matter.taraf_davaci, matter.taraf_davali].filter(Boolean)) {
        const n = normalize(name);
        if (normalizedTerms.includes(n)) add(matter, 'MATTER_PARTY', name, 'Matter party exact name', 0.95, { caseNumber: matter.esas_no });
        else if (normalizedTerms.some((term) => term && (n.includes(term) || term.includes(n)))) {
          add(matter, 'MATTER_PARTY', name, 'Matter party similar name', 0.75, { caseNumber: matter.esas_no });
        }
      }
    }
    return matches.sort((a, b) => b.score - a.score).map(({ key, ...item }) => item);
  }

  async reviewConflictCheck(checkId, input, context, { req } = {}) {
    const { rows } = await this.db.query('SELECT * FROM conflict_checks WHERE id = $1 LIMIT 1', [checkId]);
    const check = rows[0];
    if (!check) throw practiceError('Conflict check bulunamadi.', 404, 'CONFLICT_CHECK_NOT_FOUND');
    requirePermission(context, check.organization_id, 'CONFLICT_REVIEW');
    if (input.status === 'OVERRIDDEN' && !input.reviewNote) {
      throw practiceError('Override icin gerekce zorunludur.', 400, 'OVERRIDE_REASON_REQUIRED');
    }
    const status = input.status;
    if (!['CLEAR', 'POTENTIAL_CONFLICT', 'CONFIRMED_CONFLICT', 'OVERRIDDEN'].includes(status)) {
      throw practiceError('Gecersiz conflict review status.', 400, 'INVALID_CONFLICT_STATUS');
    }
    const { rows: updatedRows } = await this.db.query(
      `UPDATE conflict_checks
       SET status = $1, result_summary = COALESCE($2, result_summary),
           review_note = $3, reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [status, input.resultSummary || null, input.reviewNote || null, context.userId, checkId]
    );
    await this.audit(req, status === 'OVERRIDDEN' ? 'CONFLICT_OVERRIDE' : 'CONFLICT_CHECK_REVIEWED', 'conflict_check', checkId, {
      organizationId: check.organization_id,
      status,
    });
    return updatedRows[0];
  }

  async convertLead(leadId, input, context, { req } = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [leadId]);
      const lead = rows[0];
      if (!lead) throw practiceError('Lead bulunamadi.', 404, 'LEAD_NOT_FOUND');
      const organizationId = lead.organization_id || lead.firm_id;
      requirePermission(context, organizationId, 'CRM_WRITE');
      if (lead.converted_client_id && lead.converted_case_id) {
        await client.query('COMMIT');
        return {
          lead,
          client: (await this.getClient(lead.converted_client_id, context)).id ? await this.getClient(lead.converted_client_id, context) : null,
          case: (await client.query('SELECT * FROM cases WHERE id = $1', [lead.converted_case_id])).rows[0],
          duplicate: false,
          idempotent: true,
        };
      }
      const conflict = await this.requireReviewedConflict({ leadId, organizationId, conflictCheckId: input.conflictCheckId }, client);
      let clientRecord;
      if (input.clientId) {
        clientRecord = await this.getClient(input.clientId, context, client);
        if (clientRecord.organization_id !== organizationId) throw practiceError('Client tenant ile uyusmuyor.', 403, 'CLIENT_TENANT_MISMATCH');
      } else {
        clientRecord = await this.createClient({
          organizationId,
          clientType: input.clientType || (lead.company_name ? 'COMPANY' : 'PERSON'),
          fullName: lead.full_name || lead.name,
          companyName: lead.company_name,
          email: lead.email,
          phone: lead.phone,
          address: input.address,
        }, context, { req, db: client });
      }
      const caseId = input.caseId || crypto.randomUUID();
      let matter;
      if (input.caseId) {
        matter = await this.matter(input.caseId, context, 'write', client);
      } else {
        const caseInput = input.case || {};
        const { rows: caseRows } = await client.query(
          `INSERT INTO cases (
             id, firm_id, law_firm_id, scope_type, esas_no, mahkeme, konu,
             taraf_davaci, taraf_davali, durum, atanan_avukat_id, notlar
           )
           VALUES ($1,$2,$2,'ORGANIZATION',$3,$4,$5,$6,$7,'Acik',$8,$9)
           RETURNING *`,
          [
            caseId,
            organizationId,
            caseInput.esasNo || `CRM-${new Date().getFullYear()}-${lead.id.slice(0, 8)}`,
            caseInput.mahkeme || 'Belirlenecek',
            caseInput.konu || lead.summary || lead.subject || 'Yeni muvekkil dosyasi',
            caseInput.tarafDavaci || lead.full_name || lead.name,
            caseInput.tarafDavali || caseInput.opponent || 'Belirlenecek',
            caseInput.atananAvukatId || lead.assigned_to || context.userId,
            [lead.summary, lead.notes].filter(Boolean).join('\n\n') || null,
          ]
        );
        matter = caseRows[0];
      }
      await client.query(
        `INSERT INTO matter_clients (case_id, client_id, relationship_type, is_primary)
         VALUES ($1,$2,'CLIENT',true)
         ON CONFLICT (case_id, client_id) DO UPDATE SET is_primary = TRUE`,
        [matter.id, clientRecord.id]
      );
      for (const userId of [...new Set([context.userId, lead.assigned_to].filter(Boolean))]) {
        await this.assertUserInOrganization(userId, organizationId, client);
        await client.query(
          `INSERT INTO matter_team_members (case_id, user_id, role, billing_role, active)
           VALUES ($1,$2,$3,$4,true)
           ON CONFLICT (case_id, user_id) DO UPDATE SET active = TRUE, updated_at = CURRENT_TIMESTAMP`,
          [matter.id, userId, userId === context.userId ? 'RESPONSIBLE_LAWYER' : 'TEAM_MEMBER', 'LAWYER']
        );
      }
      const { rows: leadRows } = await client.query(
        `UPDATE leads
         SET status = 'WON', stage = 'sozlesme_imzalandi',
             converted_client_id = $1, converted_case_id = $2,
             converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [clientRecord.id, matter.id, lead.id]
      );
      await this.audit(req, 'LEAD_CONVERTED', 'lead', lead.id, {
        organizationId,
        caseId: matter.id,
        clientId: clientRecord.id,
        conflictStatus: conflict.status,
      }, client);
      await client.query('COMMIT');
      return { lead: leadRows[0], client: clientRecord, case: matter, conflict };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async requireReviewedConflict({ leadId, organizationId, conflictCheckId }, db) {
    const params = [organizationId];
    let clause = 'organization_id = $1';
    if (conflictCheckId) {
      params.push(conflictCheckId);
      clause += ` AND id = $${params.length}`;
    } else {
      params.push(leadId);
      clause += ` AND lead_id = $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT * FROM conflict_checks
       WHERE ${clause}
       ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      params
    );
    const check = rows[0];
    if (!check || !['CLEAR', 'OVERRIDDEN'].includes(check.status)) {
      throw practiceError('Lead conversion icin CLEAR veya OVERRIDDEN conflict review gerekir.', 409, 'CONFLICT_REVIEW_REQUIRED');
    }
    return check;
  }

  async dashboard(context, organizationId) {
    const orgId = this.resolveOrganization(context, organizationId, 'CRM_READ');
    const { rows } = await this.db.query(
      `SELECT
        (SELECT COUNT(*)::int FROM cases WHERE law_firm_id = $1 AND is_active = true) AS active_matters,
        (SELECT COUNT(*)::int FROM deadline_alerts WHERE organization_id = $1 AND deleted_at IS NULL AND is_acknowledged = false AND deadline_date <= NOW() + INTERVAL '14 days') AS upcoming_deadlines,
        (SELECT COUNT(*)::int FROM hearings WHERE firm_id = $1 AND COALESCE(scheduled_at, hearing_date, tarih_saat) >= NOW() AND COALESCE(cancelled_at, NULL) IS NULL) AS upcoming_hearings,
        (SELECT COUNT(*)::int FROM tasks WHERE organization_id = $1 AND deleted_at IS NULL AND status IN ('TODO','IN_PROGRESS','BLOCKED')) AS open_tasks,
        (SELECT COUNT(*)::int FROM invoices WHERE organization_id = $1 AND deleted_at IS NULL AND status IN ('ISSUED','PARTIALLY_PAID','OVERDUE')) AS open_invoices,
        (SELECT COALESCE(SUM(paid_total),0)::numeric FROM invoices WHERE organization_id = $1 AND deleted_at IS NULL) AS paid_total,
        (SELECT COALESCE(SUM(balance),0)::numeric FROM invoices WHERE organization_id = $1 AND deleted_at IS NULL) AS balance_total,
        (SELECT COUNT(*)::int FROM leads WHERE COALESCE(organization_id, firm_id) = $1 AND deleted_at IS NULL AND status = 'NEW') AS new_leads,
        (SELECT COUNT(*)::int FROM conflict_checks WHERE organization_id = $1 AND status IN ('PENDING','POTENTIAL_CONFLICT')) AS conflict_reviews`,
      [orgId]
    );
    return { organizationId: orgId, ...rows[0] };
  }

  async listTeam(caseId, context) {
    await this.matter(caseId, context, 'read');
    const { rows } = await this.db.query(
      `SELECT mtm.*, u.first_name, u.last_name, u.email
       FROM matter_team_members mtm
       JOIN users u ON u.id = mtm.user_id
       WHERE mtm.case_id = $1 AND mtm.active = true
       ORDER BY mtm.created_at`,
      [caseId]
    );
    return rows;
  }

  async addTeamMember(caseId, input, context, { req } = {}) {
    const matter = await this.matter(caseId, context, 'admin');
    requirePermission(context, matter.law_firm_id, 'MATTER_ADMIN');
    await this.assertUserInOrganization(input.userId, matter.law_firm_id);
    const { rows } = await this.db.query(
      `INSERT INTO matter_team_members (case_id, user_id, role, billing_role, hourly_rate_snapshot, permissions, active)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,true)
       ON CONFLICT (case_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, billing_role = EXCLUDED.billing_role,
           hourly_rate_snapshot = EXCLUDED.hourly_rate_snapshot,
           permissions = EXCLUDED.permissions, active = true, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [caseId, input.userId, input.role || 'TEAM_MEMBER', input.billingRole || null, input.hourlyRateSnapshot || null, JSON.stringify(input.permissions || {})]
    );
    await this.audit(req, 'MATTER_TEAM_UPDATED', 'matter_team_member', rows[0].id, { organizationId: matter.law_firm_id, caseId });
    return rows[0];
  }

  async createTask(caseId, input, context, { req } = {}) {
    const matter = await this.matter(caseId, context, 'write');
    const organizationId = matter.law_firm_id;
    if (organizationId) requirePermission(context, organizationId, 'TASK_ASSIGN');
    if (input.assignedTo && organizationId) await this.assertUserInOrganization(input.assignedTo, organizationId);
    const id = crypto.randomUUID();
    const status = input.status || 'TODO';
    const completedAt = status === 'COMPLETED' ? new Date() : null;
    const { rows } = await this.db.query(
      `INSERT INTO tasks (
         id, firm_id, organization_id, owner_user_id, case_id,
         atayan_id, atanan_id, baslik, aciklama, son_tarih, oncelik, durum,
         title, description, status, priority, assigned_to, created_by, due_at,
         completed_at, source_type, source_id, estimated_minutes
       )
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$7,$8,$12,$13,$6,$5,$9,$14,$15,$16,$17)
       RETURNING *`,
      [
        id,
        organizationId,
        matter.owner_user_id || null,
        caseId,
        context.userId,
        input.assignedTo || null,
        input.title,
        input.description || null,
        input.dueAt || null,
        input.priority || 'NORMAL',
        status,
        status,
        input.priority || 'NORMAL',
        completedAt,
        input.sourceType || 'MANUAL',
        input.sourceId || null,
        input.estimatedMinutes || null,
      ]
    );
    await this.audit(req, 'TASK_CREATED', 'task', id, { organizationId, caseId, assigned: Boolean(input.assignedTo) });
    if (input.assignedTo) {
      await this.audit(req, 'TASK_ASSIGNED', 'task', id, { organizationId, caseId, assignedTo: input.assignedTo });
      await this.notifications.notify({
        organizationId,
        recipientUserId: input.assignedTo,
        eventType: 'TASK_ASSIGNED',
        title: 'Yeni gorev atandi',
        entityType: 'task',
        entityId: id,
        idempotencyKey: `task:${id}:assigned:${input.assignedTo}`,
      });
    }
    return rows[0];
  }

  async listTasks(caseId, context, filters = {}) {
    await this.matter(caseId, context, 'read');
    const limit = clampLimit(filters.limit);
    const { rows } = await this.db.query(
      `SELECT * FROM practice_tasks
       WHERE case_id = $1 AND deleted_at IS NULL
       ORDER BY due_at NULLS LAST, created_at DESC
       LIMIT $2`,
      [caseId, limit]
    );
    return rows;
  }

  async updateTask(taskId, input, context, { req } = {}) {
    const current = (await this.db.query('SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL', [taskId])).rows[0];
    if (!current) throw practiceError('Task bulunamadi.', 404, 'TASK_NOT_FOUND');
    const matter = await this.matter(current.case_id, context, 'write');
    if (input.assignedTo && matter.law_firm_id) await this.assertUserInOrganization(input.assignedTo, matter.law_firm_id);
    const status = input.status || current.status;
    const { rows } = await this.db.query(
      `UPDATE tasks
       SET title = COALESCE($1, title), baslik = COALESCE($1, baslik),
           description = COALESCE($2, description), aciklama = COALESCE($2, aciklama),
           status = COALESCE($3, status), durum = COALESCE($3, durum),
           priority = COALESCE($4, priority), oncelik = COALESCE($4, oncelik),
           assigned_to = COALESCE($5, assigned_to), atanan_id = COALESCE($5, atanan_id),
           due_at = COALESCE($6, due_at), son_tarih = COALESCE($6, son_tarih),
           completed_at = CASE WHEN $3 = 'COMPLETED' AND completed_at IS NULL THEN CURRENT_TIMESTAMP ELSE completed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [input.title || null, input.description || null, input.status || null, input.priority || null, input.assignedTo || null, input.dueAt || null, taskId]
    );
    if (status === 'COMPLETED' && current.status !== 'COMPLETED') {
      await this.audit(req, 'TASK_COMPLETED', 'task', taskId, { organizationId: matter.law_firm_id, caseId: matter.id });
    }
    return rows[0];
  }

  async createHearing(caseId, input, context, { req } = {}) {
    const matter = await this.matter(caseId, context, 'write');
    if (!matter.law_firm_id) throw practiceError('DuruÅŸma icin organizasyon matter gerekir.', 400, 'ORGANIZATION_MATTER_REQUIRED');
    const id = crypto.randomUUID();
    const { rows } = await this.db.query(
      `INSERT INTO hearings (
         id, case_id, firm_id, tarih_saat, hearing_date, scheduled_at,
         court, hearing_type, timezone, location, online_meeting_url,
         notlar, notes, status, created_by
       )
       VALUES ($1,$2,$3,$4,$4,$4,$5,$6,COALESCE($7,'Europe/Istanbul'),$8,$9,$10,$10,COALESCE($11,'SCHEDULED'),$12)
       RETURNING *`,
      [id, caseId, matter.law_firm_id, input.scheduledAt, input.court || matter.mahkeme || null, input.hearingType || null, input.timezone || 'Europe/Istanbul', input.location || null, input.onlineMeetingUrl || null, input.notes || null, input.status || 'SCHEDULED', context.userId]
    );
    await this.audit(req, 'HEARING_CREATED', 'hearing', id, { organizationId: matter.law_firm_id, caseId });
    return rows[0];
  }

  async listHearings(caseId, context) {
    await this.matter(caseId, context, 'read');
    const { rows } = await this.db.query(
      `SELECT * FROM hearings WHERE case_id = $1 ORDER BY COALESCE(scheduled_at, hearing_date, tarih_saat) ASC`,
      [caseId]
    );
    return rows;
  }

  async updateHearing(hearingId, input, context, { req } = {}) {
    const current = (await this.db.query('SELECT * FROM hearings WHERE id = $1', [hearingId])).rows[0];
    if (!current) throw practiceError('Hearing bulunamadi.', 404, 'HEARING_NOT_FOUND');
    const matter = await this.matter(current.case_id, context, 'write');
    const { rows } = await this.db.query(
      `UPDATE hearings
       SET scheduled_at = COALESCE($1, scheduled_at), hearing_date = COALESCE($1, hearing_date), tarih_saat = COALESCE($1, tarih_saat),
           court = COALESCE($2, court), hearing_type = COALESCE($3, hearing_type),
           timezone = COALESCE($4, timezone), location = COALESCE($5, location),
           online_meeting_url = COALESCE($6, online_meeting_url),
           notes = COALESCE($7, notes), notlar = COALESCE($7, notlar),
           status = COALESCE($8, status),
           cancelled_at = CASE WHEN $8 = 'CANCELLED' AND cancelled_at IS NULL THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [input.scheduledAt || null, input.court || null, input.hearingType || null, input.timezone || null, input.location || null, input.onlineMeetingUrl || null, input.notes || null, input.status || null, hearingId]
    );
    await this.audit(req, 'HEARING_UPDATED', 'hearing', hearingId, { organizationId: matter.law_firm_id, caseId: matter.id });
    return rows[0];
  }

  async listDeadlines(caseId, context) {
    await this.matter(caseId, context, 'read');
    const { rows } = await this.db.query(
      `SELECT * FROM matter_deadlines WHERE case_id = $1 ORDER BY due_at ASC`,
      [caseId]
    );
    return rows;
  }

  async createDeadline(caseId, input, context, { req } = {}) {
    const matter = await this.matter(caseId, context, 'write');
    const { rows } = await this.db.query(
      `INSERT INTO deadline_alerts (
         firm_id, organization_id, owner_user_id, case_id, title, description,
         deadline_date, alert_type, priority, source, created_by, confirmed, status
       )
       VALUES ($1,$1,$2,$3,$4,$5,$6,'practice',$7,'manual',$8,true,'UPCOMING')
       RETURNING *`,
      [matter.law_firm_id || null, matter.owner_user_id || null, caseId, input.title, input.description || null, input.dueAt, input.priority || 'normal', context.userId]
    );
    return rows[0];
  }

  async createTimeEntry(input, context, { req } = {}) {
    const matter = input.caseId ? await this.matter(input.caseId, context, 'write') : null;
    const organizationId = matter?.law_firm_id || input.organizationId || null;
    if (organizationId) requirePermission(context, organizationId, 'CRM_READ');
    const userId = input.userId || context.userId;
    if (organizationId) await this.assertUserInOrganization(userId, organizationId);
    if (userId !== context.userId) {
      if (organizationId) requirePermission(context, organizationId, 'TIME_APPROVE');
      else if (!context.isSystemAdmin) throw practiceError('Baska kullanici icin zaman kaydi olusturulamaz.', 403, 'PERMISSION_DENIED');
    }
    const started = input.startedAt ? new Date(input.startedAt) : null;
    const ended = input.endedAt ? new Date(input.endedAt) : null;
    let duration = input.durationMinutes ?? null;
    if (started && ended) {
      if (ended <= started) throw practiceError('Bitis baslangictan sonra olmalidir.', 400, 'INVALID_DURATION');
      duration = Math.round((ended.getTime() - started.getTime()) / 60000);
    }
    if (duration !== null && duration < 0) throw practiceError('Sure negatif olamaz.', 400, 'INVALID_DURATION');
    const hourly = toMoney(input.hourlyRateSnapshot || await this.hourlyRate(input.caseId, userId));
    const amount = input.billable === false || !duration ? new Decimal(0) : hourly.mul(duration).div(60).toDecimalPlaces(2);
    const { rows } = await this.db.query(
      `INSERT INTO time_entries (
         organization_id, owner_user_id, case_id, user_id, task_id, description,
         started_at, ended_at, duration_minutes, billable,
         hourly_rate_snapshot, amount, currency, status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,'DRAFT'))
       RETURNING *`,
      [
        organizationId,
        matter?.owner_user_id || (!organizationId ? context.userId : null),
        input.caseId || null,
        userId,
        input.taskId || null,
        input.description || null,
        started,
        ended,
        duration,
        input.billable !== false,
        hourly.toFixed(2),
        amount.toFixed(2),
        input.currency || 'TRY',
        input.status || 'DRAFT',
      ]
    );
    await this.audit(req, 'TIME_ENTRY_CREATED', 'time_entry', rows[0].id, { organizationId, caseId: input.caseId || null });
    return rows[0];
  }

  async stopTimeEntry(id, input, context, { req } = {}) {
    const current = (await this.db.query(
      'SELECT * FROM time_entries WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [id]
    )).rows[0];
    if (!current) throw practiceError('Time entry bulunamadi.', 404, 'TIME_ENTRY_NOT_FOUND');
    if (current.status === 'INVOICED') {
      throw practiceError('Faturalandirilmis time entry degistirilemez.', 409, 'INVOICED_ENTRY_IMMUTABLE');
    }
    if (!current.started_at || current.ended_at) {
      throw practiceError('Yalnizca aktif timer durdurulabilir.', 409, 'TIMER_NOT_ACTIVE');
    }
    if (current.user_id !== context.userId) {
      if (current.organization_id) requirePermission(context, current.organization_id, 'TIME_APPROVE');
      else if (!context.isSystemAdmin) throw practiceError('Bu timer durdurulamaz.', 403, 'PERMISSION_DENIED');
    }
    const endedAt = input?.endedAt ? new Date(input.endedAt) : new Date();
    const startedAt = new Date(current.started_at);
    if (endedAt <= startedAt) throw practiceError('Bitis baslangictan sonra olmalidir.', 400, 'INVALID_DURATION');
    const duration = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
    const hourly = toMoney(current.hourly_rate_snapshot || 0);
    const amount = current.billable
      ? hourly.mul(duration).div(60).toDecimalPlaces(2)
      : new Decimal(0);
    const { rows } = await this.db.query(
      `UPDATE time_entries
       SET ended_at = $1, duration_minutes = $2, amount = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [endedAt, duration, amount.toFixed(2), id]
    );
    await this.audit(req, 'TIME_ENTRY_STOPPED', 'time_entry', id, {
      organizationId: current.organization_id,
      caseId: current.case_id,
    });
    return rows[0];
  }

  async hourlyRate(caseId, userId) {
    if (!caseId || !userId) return '0';
    const { rows } = await this.db.query(
      `SELECT hourly_rate_snapshot FROM matter_team_members
       WHERE case_id = $1 AND user_id = $2 AND active = true`,
      [caseId, userId]
    );
    return rows[0]?.hourly_rate_snapshot || '0';
  }

  async approveTimeEntry(id, context, { req } = {}) {
    const current = (await this.db.query('SELECT * FROM time_entries WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0];
    if (!current) throw practiceError('Time entry bulunamadi.', 404, 'TIME_ENTRY_NOT_FOUND');
    if (current.organization_id) requirePermission(context, current.organization_id, 'TIME_APPROVE');
    else if (!context.isSystemAdmin && current.owner_user_id !== context.userId && current.user_id !== context.userId) {
      throw practiceError('Time entry bulunamadi.', 404, 'TIME_ENTRY_NOT_FOUND');
    }
    const { rows } = await this.db.query("UPDATE time_entries SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *", [id]);
    await this.audit(req, 'TIME_ENTRY_APPROVED', 'time_entry', id, { organizationId: current.organization_id, caseId: current.case_id });
    return rows[0];
  }

  async updateTimeEntry(id, input, context) {
    const current = (await this.db.query('SELECT * FROM time_entries WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0];
    if (!current) throw practiceError('Time entry bulunamadi.', 404, 'TIME_ENTRY_NOT_FOUND');
    if (current.organization_id) requirePermission(context, current.organization_id, 'CRM_READ');
    else if (!context.isSystemAdmin && current.owner_user_id !== context.userId && current.user_id !== context.userId) {
      throw practiceError('Time entry bulunamadi.', 404, 'TIME_ENTRY_NOT_FOUND');
    }
    if (current.status === 'INVOICED') {
      throw practiceError('Faturalandirilmis time entry sessizce degistirilemez.', 409, 'INVOICED_ENTRY_IMMUTABLE');
    }
    const { rows } = await this.db.query(
      `UPDATE time_entries
       SET description = COALESCE($1, description),
           duration_minutes = COALESCE($2, duration_minutes),
           billable = COALESCE($3, billable),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [input.description || null, input.durationMinutes ?? null, input.billable ?? null, id]
    );
    return rows[0];
  }

  async createExpense(input, context, { req } = {}) {
    const matter = input.caseId ? await this.matter(input.caseId, context, 'write') : null;
    const organizationId = matter?.law_firm_id || input.organizationId || null;
    if (organizationId) requirePermission(context, organizationId, 'CRM_READ');
    const userId = input.userId || context.userId;
    if (organizationId) await this.assertUserInOrganization(userId, organizationId);
    if (userId !== context.userId) {
      if (organizationId) requirePermission(context, organizationId, 'EXPENSE_APPROVE');
      else if (!context.isSystemAdmin) throw practiceError('Baska kullanici icin masraf kaydi olusturulamaz.', 403, 'PERMISSION_DENIED');
    }
    if (input.receiptDocumentId) {
      const { rows: documents } = await this.db.query(
        `SELECT case_id FROM case_documents
         WHERE id = $1 AND deleted_at IS NULL
         LIMIT 1`,
        [input.receiptDocumentId]
      );
      if (!documents[0] || !input.caseId || documents[0].case_id !== input.caseId) {
        throw practiceError('Makbuz belgesi ayni matter icinde olmalidir.', 403, 'RECEIPT_SCOPE_MISMATCH');
      }
    }
    const amount = toMoney(input.amount);
    const { rows } = await this.db.query(
      `INSERT INTO expenses (
         organization_id, owner_user_id, case_id, user_id, category, description,
         expense_date, amount, currency, billable, receipt_document_id, status
       )
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,CURRENT_DATE),$8,$9,$10,$11,COALESCE($12,'DRAFT'))
       RETURNING *`,
      [
        organizationId,
        matter?.owner_user_id || (!organizationId ? context.userId : null),
        input.caseId || null,
        userId,
        input.category || null,
        input.description || null,
        input.expenseDate || null,
        amount.toFixed(2),
        input.currency || 'TRY',
        input.billable !== false,
        input.receiptDocumentId || null,
        input.status || 'DRAFT',
      ]
    );
    await this.audit(req, 'EXPENSE_CREATED', 'expense', rows[0].id, { organizationId: rows[0].organization_id, caseId: input.caseId || null });
    return rows[0];
  }

  async approveExpense(id, context, { req } = {}) {
    const current = (await this.db.query('SELECT * FROM expenses WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0];
    if (!current) throw practiceError('Expense bulunamadi.', 404, 'EXPENSE_NOT_FOUND');
    if (current.organization_id) requirePermission(context, current.organization_id, 'EXPENSE_APPROVE');
    else if (!context.isSystemAdmin && current.owner_user_id !== context.userId && current.user_id !== context.userId) {
      throw practiceError('Expense bulunamadi.', 404, 'EXPENSE_NOT_FOUND');
    }
    const { rows } = await this.db.query("UPDATE expenses SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *", [id]);
    await this.audit(req, 'EXPENSE_APPROVED', 'expense', id, { organizationId: current.organization_id, caseId: current.case_id });
    return rows[0];
  }

  async createFeeAgreement(input, context) {
    const organizationId = this.resolveOrganization(context, input.organizationId, 'INVOICE_CREATE');
    if (input.caseId) {
      const matter = await this.matter(input.caseId, context, 'read');
      if (matter.law_firm_id !== organizationId) {
        throw practiceError('Ucret sozlesmesi matter tenant uyusmuyor.', 403, 'MATTER_TENANT_MISMATCH');
      }
    }
    if (input.clientId) {
      const client = await this.getClient(input.clientId, context);
      if (client.organization_id !== organizationId) {
        throw practiceError('Ucret sozlesmesi client tenant uyusmuyor.', 403, 'CLIENT_TENANT_MISMATCH');
      }
    }
    const { rows } = await this.db.query(
      `INSERT INTO fee_agreements (
         organization_id, client_id, case_id, agreement_type, currency,
         fixed_amount, hourly_rate, success_rate, terms, status, signed_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'DRAFT'),$11)
       RETURNING *`,
      [organizationId, input.clientId || null, input.caseId || null, input.agreementType || 'OTHER', input.currency || 'TRY', input.fixedAmount || null, input.hourlyRate || null, input.successRate || null, input.terms || null, input.status || 'DRAFT', input.signedAt || null]
    );
    return rows[0];
  }

  async createInvoice(input, context, { req } = {}) {
    const organizationId = this.resolveOrganization(context, input.organizationId, 'INVOICE_CREATE');
    if (input.caseId) {
      const matter = await this.matter(input.caseId, context, 'read');
      if (matter.law_firm_id !== organizationId) throw practiceError('Invoice matter tenant uyusmuyor.', 403, 'MATTER_TENANT_MISMATCH');
    }
    const clientRecord = input.clientId ? await this.getClient(input.clientId, context) : null;
    if (clientRecord && clientRecord.organization_id !== organizationId) {
      throw practiceError('Invoice client tenant uyusmuyor.', 403, 'CLIENT_TENANT_MISMATCH');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const items = await this.buildInvoiceItems(input.items || [], { organizationId, caseId: input.caseId || null }, client);
      if (items.length === 0) throw practiceError('Fatura kalemi gerekir.', 400, 'INVOICE_ITEMS_REQUIRED');
      const totals = items.reduce((acc, item) => ({
        subtotal: acc.subtotal.plus(item.subtotal),
        tax: acc.tax.plus(item.taxTotal),
        total: acc.total.plus(item.total),
      }), { subtotal: new Decimal(0), tax: new Decimal(0), total: new Decimal(0) });
      const invoiceNumber = input.invoiceNumber || `LZ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const { rows } = await client.query(
        `INSERT INTO invoices (
           firm_id, organization_id, client_id, case_id, client_name, invoice_number,
           amount, tax_rate, total_amount, issue_date, due_date, status, notes,
           currency, subtotal, tax_total, total, paid_total, balance, created_by
         )
         VALUES ($1,$1,$2,$3,$4,$5,$6,0,$8,$9,$10,'DRAFT',$11,$12,$6,$7,$8,0,$8,$13)
         RETURNING *`,
        [
          organizationId,
          input.clientId || null,
          input.caseId || null,
          input.clientName || clientRecord?.company_name || clientRecord?.full_name || 'Muvekkil',
          invoiceNumber,
          totals.subtotal.toFixed(2),
          totals.tax.toFixed(2),
          totals.total.toFixed(2),
          input.issueDate || new Date(),
          input.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          input.notes || null,
          input.currency || 'TRY',
          context.userId,
        ]
      );
      const invoice = rows[0];
      for (const item of items) {
        await client.query(
          `INSERT INTO invoice_items (
             invoice_id, source_type, source_id, description, quantity, unit_price,
             tax_rate, subtotal, tax_total, total
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [invoice.id, item.sourceType, item.sourceId || null, item.description, item.quantity, item.unitPrice, item.taxRate, item.subtotal.toFixed(2), item.taxTotal.toFixed(2), item.total.toFixed(2)]
        );
      }
      await this.audit(req, 'INVOICE_CREATED', 'invoice', invoice.id, { organizationId, caseId: input.caseId || null, itemCount: items.length }, client);
      await client.query('COMMIT');
      return invoice;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async buildInvoiceItems(items, scope, db) {
    const built = [];
    for (const item of items) {
      const sourceType = item.sourceType || 'CUSTOM';
      if (sourceType === 'TIME_ENTRY') {
        const entry = (await db.query(
          `SELECT * FROM time_entries WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
          [item.sourceId, scope.organizationId]
        )).rows[0];
        if (!entry || entry.status !== 'APPROVED' || !entry.billable) throw practiceError('Time entry faturalamaya uygun degil.', 400, 'TIME_ENTRY_NOT_BILLABLE');
        if (scope.caseId && entry.case_id !== scope.caseId) throw practiceError('Baska matter time entry faturalandirilamaz.', 400, 'INVOICE_SCOPE_MISMATCH');
        built.push(this.invoiceLine({ sourceType, sourceId: entry.id, description: entry.description || 'Zaman kaydi', quantity: 1, unitPrice: entry.amount, taxRate: item.taxRate || 0 }));
      } else if (sourceType === 'EXPENSE') {
        const expense = (await db.query(
          `SELECT * FROM expenses WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
          [item.sourceId, scope.organizationId]
        )).rows[0];
        if (!expense || expense.status !== 'APPROVED' || !expense.billable) throw practiceError('Masraf faturalamaya uygun degil.', 400, 'EXPENSE_NOT_BILLABLE');
        if (scope.caseId && expense.case_id !== scope.caseId) throw practiceError('Baska matter masrafi faturalandirilamaz.', 400, 'INVOICE_SCOPE_MISMATCH');
        built.push(this.invoiceLine({ sourceType, sourceId: expense.id, description: expense.description || expense.category || 'Masraf', quantity: 1, unitPrice: expense.amount, taxRate: item.taxRate || 0 }));
      } else {
        built.push(this.invoiceLine({ sourceType, sourceId: item.sourceId || null, description: item.description || 'Fatura kalemi', quantity: item.quantity || 1, unitPrice: item.unitPrice || item.amount || 0, taxRate: item.taxRate || 0 }));
      }
    }
    return built;
  }

  invoiceLine({ sourceType, sourceId, description, quantity, unitPrice, taxRate }) {
    const qty = new Decimal(quantity || 1);
    const price = toMoney(unitPrice);
    const rate = new Decimal(taxRate || 0);
    const subtotal = qty.mul(price).toDecimalPlaces(2);
    const taxTotal = subtotal.mul(rate).div(100).toDecimalPlaces(2);
    return { sourceType, sourceId, description, quantity: qty.toString(), unitPrice: price.toFixed(2), taxRate: rate.toString(), subtotal, taxTotal, total: subtotal.plus(taxTotal).toDecimalPlaces(2) };
  }

  async issueInvoice(invoiceId, context, { req } = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const invoice = (await client.query('SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [invoiceId])).rows[0];
      if (!invoice) throw practiceError('Invoice bulunamadi.', 404, 'INVOICE_NOT_FOUND');
      requirePermission(context, invoice.organization_id, 'INVOICE_ISSUE');
      if (invoice.status !== 'DRAFT') {
        throw practiceError('Yalnizca taslak fatura kesilebilir.', 409, 'INVOICE_NOT_DRAFT');
      }
      const { rows } = await client.query(
        `UPDATE invoices
         SET status = 'ISSUED', issued_at = COALESCE(issued_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [invoiceId]
      );
      const items = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
      for (const item of items.rows) {
        if (item.source_type === 'TIME_ENTRY') await client.query("UPDATE time_entries SET status = 'INVOICED' WHERE id = $1", [item.source_id]);
        if (item.source_type === 'EXPENSE') await client.query("UPDATE expenses SET status = 'INVOICED' WHERE id = $1", [item.source_id]);
      }
      await this.audit(req, 'INVOICE_ISSUED', 'invoice', invoiceId, { organizationId: invoice.organization_id, caseId: invoice.case_id }, client);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordPayment(invoiceId, input, context, { req } = {}) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const invoice = (await client.query('SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [invoiceId])).rows[0];
      if (!invoice) throw practiceError('Invoice bulunamadi.', 404, 'INVOICE_NOT_FOUND');
      requirePermission(context, invoice.organization_id, 'PAYMENT_RECORD');
      if (!['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
        throw practiceError('Yalnizca kesilmis faturaya odeme kaydedilebilir.', 409, 'INVOICE_NOT_PAYABLE');
      }
      const amount = toMoney(input.amount);
      const balance = new Decimal(invoice.balance || invoice.total || 0);
      if (amount.gt(balance)) throw practiceError('Odeme bakiyeyi asamaz.', 400, 'PAYMENT_EXCEEDS_BALANCE');
      const { rows } = await client.query(
        `INSERT INTO payments (firm_id, organization_id, invoice_id, amount, currency, payment_date, payment_method, reference_no, reference, notes, status)
         VALUES ($1,$1,$2,$3,$4,COALESCE($5,CURRENT_DATE),$6,$7,$7,$8,'RECORDED')
         RETURNING *`,
        [invoice.organization_id, invoiceId, amount.toFixed(2), input.currency || invoice.currency || 'TRY', input.paymentDate || null, input.paymentMethod || null, input.reference || null, input.notes || null]
      );
      const paid = new Decimal(invoice.paid_total || 0).plus(amount).toDecimalPlaces(2);
      const nextBalance = balance.minus(amount).toDecimalPlaces(2);
      const status = nextBalance.eq(0) ? 'PAID' : 'PARTIALLY_PAID';
      await client.query(
        `UPDATE invoices SET paid_total = $1, balance = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [paid.toFixed(2), nextBalance.toFixed(2), status, invoiceId]
      );
      await this.audit(req, 'PAYMENT_RECORDED', 'payment', rows[0].id, { organizationId: invoice.organization_id, invoiceId }, client);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteInvoice(invoiceId, context) {
    const invoice = (await this.db.query('SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL', [invoiceId])).rows[0];
    if (!invoice) throw practiceError('Invoice bulunamadi.', 404, 'INVOICE_NOT_FOUND');
    requirePermission(context, invoice.organization_id, 'INVOICE_CREATE');
    if (invoice.status === 'PAID') throw practiceError('PAID fatura normal sekilde silinemez.', 409, 'PAID_INVOICE_IMMUTABLE');
    await this.db.query("UPDATE invoices SET deleted_at = CURRENT_TIMESTAMP, status = 'CANCELLED' WHERE id = $1", [invoiceId]);
    return true;
  }

  async exportInvoicePdf(invoiceId, context) {
    const invoice = (await this.db.query('SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL', [invoiceId])).rows[0];
    if (!invoice) throw practiceError('Invoice bulunamadi.', 404, 'INVOICE_NOT_FOUND');
    requirePermission(context, invoice.organization_id, 'FINANCE_REPORT');
    const text = `Invoice ${invoice.invoice_number || invoice.id} total ${invoice.total || invoice.total_amount} ${invoice.currency || 'TRY'}`;
    return Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n2 0 obj<< /Length ${text.length + 48} >>stream\nBT /F1 12 Tf 50 750 Td (${text.replace(/[()]/g, '')}) Tj ET\nendstream\nendobj\ntrailer<<>>\n%%EOF`);
  }

  async invitePortal(input, context, { req } = {}) {
    const clientRecord = await this.getClient(input.clientId, context);
    const matter = await this.matter(input.caseId, context, 'read');
    requirePermission(context, matter.law_firm_id, 'PORTAL_INVITE');
    await this.assertMatterClient(matter.id, clientRecord.id);
    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await this.db.query(
      `INSERT INTO client_portal_access (
         client_id, case_id, status, invited_by, invited_at,
         invitation_token_hash, invitation_expires_at
       )
       VALUES ($1,$2,'INVITED',$3,CURRENT_TIMESTAMP,$4,CURRENT_TIMESTAMP + INTERVAL '7 days')
       RETURNING *`,
      [clientRecord.id, matter.id, context.userId, tokenHash]
    );
    await this.notifications.notify({
      organizationId: matter.law_firm_id,
      recipientEmail: clientRecord.email || input.email,
      eventType: 'PORTAL_INVITE',
      title: 'Muvekkil portali daveti',
      entityType: 'portal_access',
      entityId: rows[0].id,
      idempotencyKey: `portal:${rows[0].id}:invite`,
      email: true,
    });
    await this.audit(req, 'PORTAL_INVITED', 'portal_access', rows[0].id, { organizationId: matter.law_firm_id, caseId: matter.id });
    return { access: rows[0], invitationToken: token };
  }

  async acceptPortalInvitation(token, context, { req } = {}) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await this.db.query(
      `UPDATE client_portal_access
       SET user_id = $1, status = 'ACTIVE', accepted_at = CURRENT_TIMESTAMP,
           invitation_token_hash = NULL
       WHERE invitation_token_hash = $2
         AND status = 'INVITED'
         AND accepted_at IS NULL
         AND revoked_at IS NULL
         AND invitation_expires_at > CURRENT_TIMESTAMP
       RETURNING *`,
      [context.userId, tokenHash]
    );
    if (!rows[0]) throw practiceError('Portal daveti gecersiz veya suresi dolmus.', 404, 'PORTAL_INVITE_NOT_FOUND');
    await this.audit(req, 'PORTAL_ACCESS_ACCEPTED', 'portal_access', rows[0].id, { caseId: rows[0].case_id });
    return rows[0];
  }

  async revokePortalAccess(accessId, context, { req } = {}) {
    const current = (await this.db.query('SELECT cpa.*, c.law_firm_id FROM client_portal_access cpa JOIN cases c ON c.id = cpa.case_id WHERE cpa.id = $1', [accessId])).rows[0];
    if (!current) throw practiceError('Portal erisimi bulunamadi.', 404, 'PORTAL_ACCESS_NOT_FOUND');
    requirePermission(context, current.law_firm_id, 'PORTAL_INVITE');
    const { rows } = await this.db.query(
      `UPDATE client_portal_access
       SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [accessId]
    );
    await this.audit(req, 'PORTAL_ACCESS_REVOKED', 'portal_access', accessId, { organizationId: current.law_firm_id, caseId: current.case_id });
    return rows[0];
  }

  async sharePortalItem(input, context, { req } = {}) {
    const matter = await this.matter(input.caseId, context, 'read');
    requirePermission(context, matter.law_firm_id, 'PORTAL_SHARE');
    await this.assertMatterClient(input.caseId, input.clientId);
    const { rows } = await this.db.query(
      `INSERT INTO client_portal_shared_items (case_id, client_id, item_type, item_id, title, shared_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [input.caseId, input.clientId, input.itemType, input.itemId || null, input.title, context.userId]
    );
    await this.audit(req, 'PORTAL_ITEM_SHARED', 'portal_shared_item', rows[0].id, { organizationId: matter.law_firm_id, caseId: input.caseId, itemType: input.itemType });
    return rows[0];
  }

  async assertMatterClient(caseId, clientId) {
    const { rowCount } = await this.db.query('SELECT 1 FROM matter_clients WHERE case_id = $1 AND client_id = $2', [caseId, clientId]);
    if (!rowCount) throw practiceError('Client bu matter ile iliskili degil.', 403, 'CLIENT_MATTER_MISMATCH');
  }

  async listPortalCases(context) {
    const { rows } = await this.db.query(
      `SELECT c.id, c.konu, c.esas_no, c.mahkeme, cpa.client_id
       FROM client_portal_access cpa
       JOIN cases c ON c.id = cpa.case_id
       WHERE cpa.user_id = $1 AND cpa.status = 'ACTIVE' AND cpa.revoked_at IS NULL`,
      [context.userId]
    );
    return rows;
  }

  async getPortalCase(caseId, context) {
    const access = (await this.db.query(
      `SELECT * FROM client_portal_access
       WHERE case_id = $1 AND user_id = $2 AND status = 'ACTIVE' AND revoked_at IS NULL
       LIMIT 1`,
      [caseId, context.userId]
    )).rows[0];
    if (!access) throw practiceError('Portal matter bulunamadi.', 404, 'PORTAL_CASE_NOT_FOUND');
    const [updates, items, messages] = await Promise.all([
      this.db.query(
        `SELECT mu.id, mu.title, mu.content, mu.created_at
         FROM matter_updates mu
         JOIN client_portal_shared_items shared
           ON shared.case_id = mu.case_id
          AND shared.client_id = $2
          AND shared.item_type = 'UPDATE'
          AND shared.item_id = mu.id
          AND shared.revoked_at IS NULL
         WHERE mu.case_id = $1 AND mu.visibility = 'CLIENT_VISIBLE'
         ORDER BY mu.created_at DESC`,
        [caseId, access.client_id]
      ),
      this.db.query(
        `SELECT * FROM client_portal_shared_items
         WHERE case_id = $1 AND client_id = $2 AND revoked_at IS NULL
         ORDER BY shared_at DESC`,
        [caseId, access.client_id]
      ),
      this.db.query(
        `SELECT id, sender_type, subject, created_at FROM portal_messages
         WHERE case_id = $1 AND client_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [caseId, access.client_id]
      ),
    ]);
    return { access, updates: updates.rows, sharedItems: items.rows, messages: messages.rows };
  }

  async getPortalDocument(caseId, documentId, context, { req } = {}) {
    const portal = await this.getPortalCase(caseId, context);
    const shared = portal.sharedItems.find((item) => item.item_type === 'DOCUMENT' && item.item_id === documentId);
    if (!shared) throw practiceError('Portal dokumani bulunamadi.', 404, 'PORTAL_DOCUMENT_NOT_SHARED');
    const { rows } = await this.db.query(
      `SELECT id, case_id, document_name, original_filename, file_name, title,
              document_type, uploaded_at, storage_key, file_url, detected_mime_type
       FROM case_documents
       WHERE id = $1 AND case_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [documentId, caseId]
    );
    if (!rows[0]) throw practiceError('Dokuman bulunamadi.', 404, 'DOCUMENT_NOT_FOUND');
    await this.audit(req, 'PORTAL_DOCUMENT_DOWNLOADED', 'case_document', documentId, {
      caseId,
      clientId: portal.access.client_id,
    });
    return rows[0];
  }

  async openPortalDocument(caseId, documentId, context, { req } = {}) {
    const document = await this.getPortalDocument(caseId, documentId, context, { req });
    let file;
    try {
      file = await storage.openReadStream(document.storage_key || document.file_url);
    } catch (_) {
      throw practiceError('Dokuman dosyasi bulunamadi.', 404, 'DOCUMENT_FILE_NOT_FOUND');
    }
    return { document, ...file };
  }

  async createMatterUpdate(caseId, input, context, { req } = {}) {
    const matter = await this.matter(caseId, context, 'write');
    const { rows } = await this.db.query(
      `INSERT INTO matter_updates (case_id, title, content, visibility, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [caseId, input.title, input.content, input.visibility || 'INTERNAL', context.userId]
    );
    await this.audit(req, 'MATTER_UPDATE_CREATED', 'matter_update', rows[0].id, { organizationId: matter.law_firm_id, caseId, visibility: rows[0].visibility });
    return rows[0];
  }

  async sendPortalMessage(input, context, { req } = {}) {
    let senderType = input.senderType || 'FIRM';
    if (senderType === 'CLIENT') {
      const portal = await this.getPortalCase(input.caseId, context);
      input.clientId = portal.access.client_id;
    } else {
      const matter = await this.matter(input.caseId, context, 'read');
      await this.assertMatterClient(input.caseId, input.clientId);
      if (!matter.law_firm_id) throw practiceError('Portal mesajlari organizasyon matter gerektirir.', 400, 'ORGANIZATION_MATTER_REQUIRED');
    }
    const { rows } = await this.db.query(
      `INSERT INTO portal_messages (case_id, client_id, sender_user_id, sender_type, subject, body)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, case_id, client_id, sender_user_id, sender_type, subject, created_at`,
      [input.caseId, input.clientId, context.userId, senderType, input.subject || null, input.body]
    );
    await this.audit(req, 'PORTAL_MESSAGE_SENT', 'portal_message', rows[0].id, { caseId: input.caseId, senderType });
    return rows[0];
  }

  async listPortalMessages(caseId, context) {
    const portal = await this.getPortalCase(caseId, context);
    const { rows } = await this.db.query(
      `SELECT id, case_id, client_id, sender_user_id, sender_type, subject, body, created_at
       FROM portal_messages
       WHERE case_id = $1 AND client_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT 200`,
      [caseId, portal.access.client_id]
    );
    return rows;
  }
}

module.exports = {
  PracticeManagementService,
  practiceError,
};

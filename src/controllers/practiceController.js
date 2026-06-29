const { z } = require('zod');
const { pool } = require('../config/db');
const { getAccessContext } = require('../services/accessContext');
const { PracticeManagementService } = require('../services/practice/PracticeManagementService');
const { requirePermission } = require('../services/practice/PermissionService');

const uuid = z.string().uuid();
const money = z.union([z.string(), z.number()]);
const dateString = z.string().min(1).max(80);
const service = new PracticeManagementService();

function handler(fn) {
  return async (req, res, next) => {
    try { await fn(req, res); } catch (error) { next(error); }
  };
}

async function context(req) {
  const value = await getAccessContext(req);
  if (!value) {
    const error = new Error('Authentication required.');
    error.status = 401;
    throw error;
  }
  return value;
}

function listOptions(req) {
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || req.query.limit || '50', 10) || 50, 1), 100);
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  return {
    organizationId: req.query.organizationId || undefined,
    status: req.query.status || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

function safeDownloadName(value) {
  return String(value || 'belge').replace(/[\r\n\\/"]/g, '_').trim().slice(0, 180) || 'belge';
}

function listSort(req, allowed, fallback) {
  const field = allowed[req.query.sortBy] || fallback;
  const direction = String(req.query.sortDirection || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${field} ${direction}`;
}

const leadSchema = z.object({
  organizationId: uuid.optional(),
  fullName: z.string().trim().min(1).max(255),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  companyName: z.string().trim().max(255).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONSULTATION', 'PROPOSAL', 'WON', 'LOST', 'ARCHIVED']).optional(),
  legalDomain: z.string().trim().max(120).optional().nullable(),
  summary: z.string().trim().max(5000).optional().nullable(),
  estimatedValue: money.optional(),
  assignedTo: uuid.optional().nullable(),
  nextActionAt: dateString.optional().nullable(),
}).strict();

const clientSchema = z.object({
  organizationId: uuid.optional(),
  personal: z.boolean().optional(),
  clientType: z.enum(['PERSON', 'COMPANY', 'PUBLIC_ENTITY', 'OTHER']).optional(),
  fullName: z.string().trim().max(255).optional().nullable(),
  companyName: z.string().trim().max(255).optional().nullable(),
  identityReference: z.string().trim().max(120).optional().nullable(),
  taxReference: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  address: z.string().trim().max(2000).optional().nullable(),
  status: z.string().trim().max(40).optional(),
}).strict();

const conflictSchema = z.object({
  organizationId: uuid.optional(),
  caseId: uuid.optional().nullable(),
  leadId: uuid.optional().nullable(),
  clientId: uuid.optional().nullable(),
  queryTerms: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
  name: z.string().trim().max(255).optional().nullable(),
  email: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  identityReference: z.string().trim().max(120).optional().nullable(),
  taxReference: z.string().trim().max(120).optional().nullable(),
}).strict();

const conflictReviewSchema = z.object({
  status: z.enum(['CLEAR', 'POTENTIAL_CONFLICT', 'CONFIRMED_CONFLICT', 'OVERRIDDEN']),
  resultSummary: z.string().trim().max(2000).optional().nullable(),
  reviewNote: z.string().trim().max(2000).optional().nullable(),
}).strict();

const convertSchema = z.object({
  conflictCheckId: uuid.optional(),
  clientId: uuid.optional(),
  clientType: z.enum(['PERSON', 'COMPANY', 'PUBLIC_ENTITY', 'OTHER']).optional(),
  address: z.string().trim().max(2000).optional().nullable(),
  caseId: uuid.optional(),
  case: z.object({
    esasNo: z.string().trim().max(100).optional(),
    mahkeme: z.string().trim().max(255).optional(),
    konu: z.string().trim().max(255).optional(),
    tarafDavaci: z.string().trim().max(255).optional(),
    tarafDavali: z.string().trim().max(255).optional(),
    opponent: z.string().trim().max(255).optional(),
    atananAvukatId: uuid.optional(),
  }).optional(),
}).strict();

const teamSchema = z.object({
  userId: uuid,
  role: z.string().trim().max(80).optional(),
  billingRole: z.string().trim().max(80).optional().nullable(),
  hourlyRateSnapshot: money.optional().nullable(),
  permissions: z.record(z.any()).optional(),
}).strict();

const taskSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  assignedTo: uuid.optional().nullable(),
  dueAt: dateString.optional().nullable(),
  sourceType: z.enum(['MANUAL', 'CALCULATION', 'DRAFT_WARNING', 'DOCUMENT_REVIEW', 'HEARING', 'AGENT', 'SYSTEM']).optional(),
  sourceId: uuid.optional().nullable(),
  estimatedMinutes: z.number().int().min(0).max(100000).optional().nullable(),
}).strict();

const hearingSchema = z.object({
  court: z.string().trim().max(255).optional().nullable(),
  hearingType: z.string().trim().max(120).optional().nullable(),
  scheduledAt: dateString,
  timezone: z.literal('Europe/Istanbul').optional(),
  location: z.string().trim().max(1000).optional().nullable(),
  onlineMeetingUrl: z.string().trim().url().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(['SCHEDULED', 'HELD', 'POSTPONED', 'CANCELLED']).optional(),
}).strict();

const deadlineSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  dueAt: dateString,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
}).strict();

const timeEntrySchema = z.object({
  organizationId: uuid.optional(),
  caseId: uuid.optional().nullable(),
  taskId: uuid.optional().nullable(),
  userId: uuid.optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  startedAt: dateString.optional().nullable(),
  endedAt: dateString.optional().nullable(),
  durationMinutes: z.number().int().min(0).max(100000).optional().nullable(),
  billable: z.boolean().optional(),
  hourlyRateSnapshot: money.optional(),
  amount: money.optional(),
  currency: z.string().trim().length(3).optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED']).optional(),
}).strict();

const expenseSchema = z.object({
  organizationId: uuid.optional(),
  caseId: uuid.optional().nullable(),
  userId: uuid.optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  expenseDate: dateString.optional().nullable(),
  amount: money,
  currency: z.string().trim().length(3).optional(),
  billable: z.boolean().optional(),
  receiptDocumentId: uuid.optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED']).optional(),
}).strict();

const feeAgreementSchema = z.object({
  organizationId: uuid.optional(),
  clientId: uuid.optional().nullable(),
  caseId: uuid.optional().nullable(),
  agreementType: z.enum(['FIXED', 'HOURLY', 'MIXED', 'SUCCESS', 'RETAINER', 'OTHER']).optional(),
  currency: z.string().trim().length(3).optional(),
  fixedAmount: money.optional().nullable(),
  hourlyRate: money.optional().nullable(),
  successRate: money.optional().nullable(),
  terms: z.string().trim().max(10000).optional().nullable(),
  status: z.string().trim().max(40).optional(),
  signedAt: dateString.optional().nullable(),
}).strict();

const invoiceSchema = z.object({
  organizationId: uuid.optional(),
  clientId: uuid.optional().nullable(),
  caseId: uuid.optional().nullable(),
  clientName: z.string().trim().max(255).optional().nullable(),
  invoiceNumber: z.string().trim().max(100).optional().nullable(),
  issueDate: dateString.optional().nullable(),
  dueDate: dateString.optional().nullable(),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  items: z.array(z.object({
    sourceType: z.enum(['TIME_ENTRY', 'EXPENSE', 'FIXED_FEE', 'CUSTOM']).optional(),
    sourceId: uuid.optional().nullable(),
    description: z.string().trim().max(1000).optional(),
    quantity: money.optional(),
    unitPrice: money.optional(),
    amount: money.optional(),
    taxRate: money.optional(),
  }).strict()).min(1).max(100),
}).strict();

const paymentSchema = z.object({
  amount: money,
  currency: z.string().trim().length(3).optional(),
  paymentDate: dateString.optional().nullable(),
  paymentMethod: z.string().trim().max(100).optional().nullable(),
  reference: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
}).strict();

const portalInviteSchema = z.object({
  clientId: uuid,
  caseId: uuid,
  email: z.string().trim().email().optional().nullable(),
}).strict();

const portalShareSchema = z.object({
  caseId: uuid,
  clientId: uuid,
  itemType: z.enum(['DOCUMENT', 'DEADLINE', 'HEARING', 'UPDATE', 'INVOICE', 'MESSAGE']),
  itemId: uuid.optional().nullable(),
  title: z.string().trim().min(1).max(255),
}).strict();

const updateSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().trim().min(1).max(10000),
  visibility: z.enum(['INTERNAL', 'CLIENT_VISIBLE']).optional(),
}).strict();

const portalMessageSchema = z.object({
  caseId: uuid,
  clientId: uuid.optional().nullable(),
  senderType: z.enum(['FIRM', 'CLIENT']).optional(),
  subject: z.string().trim().max(255).optional().nullable(),
  body: z.string().trim().min(1).max(10000),
}).strict();

exports.getPracticeDashboard = handler(async (req, res) => {
  res.json({ success: true, data: await service.dashboard(await context(req), req.query.organizationId) });
});

exports.createLead = handler(async (req, res) => {
  const data = await service.createLead(leadSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.listLeads = handler(async (req, res) => {
  res.json({ success: true, data: await service.listLeads(await context(req), listOptions(req)) });
});

exports.getLead = handler(async (req, res) => {
  res.json({ success: true, data: await service.getLead(uuid.parse(req.params.leadId), await context(req)) });
});

exports.convertLead = handler(async (req, res) => {
  const data = await service.convertLead(uuid.parse(req.params.leadId), convertSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.createClient = handler(async (req, res) => {
  const data = await service.createClient(clientSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.listClients = handler(async (req, res) => {
  res.json({ success: true, data: await service.listClients(await context(req), listOptions(req)) });
});

exports.getClient = handler(async (req, res) => {
  res.json({ success: true, data: await service.getClient(uuid.parse(req.params.clientId), await context(req)) });
});

exports.createConflictCheck = handler(async (req, res) => {
  const data = await service.createConflictCheck(conflictSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.reviewConflictCheck = handler(async (req, res) => {
  const data = await service.reviewConflictCheck(uuid.parse(req.params.checkId), conflictReviewSchema.parse(req.body), await context(req), { req });
  res.json({ success: true, data });
});

exports.listTeam = handler(async (req, res) => {
  res.json({ success: true, data: await service.listTeam(uuid.parse(req.params.caseId), await context(req)) });
});

exports.addTeamMember = handler(async (req, res) => {
  const data = await service.addTeamMember(uuid.parse(req.params.caseId), teamSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.listTasks = handler(async (req, res) => {
  res.json({ success: true, data: await service.listTasks(uuid.parse(req.params.caseId), await context(req), listOptions(req)) });
});

exports.createTask = handler(async (req, res) => {
  const data = await service.createTask(uuid.parse(req.params.caseId), taskSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.updateTask = handler(async (req, res) => {
  const data = await service.updateTask(uuid.parse(req.params.taskId), taskSchema.partial().parse(req.body), await context(req), { req });
  res.json({ success: true, data });
});

exports.listHearings = handler(async (req, res) => {
  res.json({ success: true, data: await service.listHearings(uuid.parse(req.params.caseId), await context(req)) });
});

exports.createHearing = handler(async (req, res) => {
  const data = await service.createHearing(uuid.parse(req.params.caseId), hearingSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.updateHearing = handler(async (req, res) => {
  const data = await service.updateHearing(uuid.parse(req.params.hearingId), hearingSchema.partial().parse(req.body), await context(req), { req });
  res.json({ success: true, data });
});

exports.listDeadlines = handler(async (req, res) => {
  res.json({ success: true, data: await service.listDeadlines(uuid.parse(req.params.caseId), await context(req)) });
});

exports.createDeadline = handler(async (req, res) => {
  const data = await service.createDeadline(uuid.parse(req.params.caseId), deadlineSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.listUpdates = handler(async (req, res) => {
  await service.matter(uuid.parse(req.params.caseId), await context(req), 'read');
  const { rows } = await pool.query(
    'SELECT * FROM matter_updates WHERE case_id = $1 ORDER BY created_at DESC LIMIT 100',
    [req.params.caseId]
  );
  res.json({ success: true, data: rows });
});

exports.createUpdate = handler(async (req, res) => {
  const data = await service.createMatterUpdate(uuid.parse(req.params.caseId), updateSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.createTimeEntry = handler(async (req, res) => {
  const data = await service.createTimeEntry(timeEntrySchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.approveTimeEntry = handler(async (req, res) => {
  res.json({ success: true, data: await service.approveTimeEntry(uuid.parse(req.params.timeEntryId), await context(req), { req }) });
});

exports.updateTimeEntry = handler(async (req, res) => {
  const data = await service.updateTimeEntry(
    uuid.parse(req.params.timeEntryId),
    timeEntrySchema.partial().parse(req.body),
    await context(req)
  );
  res.json({ success: true, data });
});

exports.stopTimeEntry = handler(async (req, res) => {
  const body = z.object({ endedAt: dateString.optional() }).strict().parse(req.body || {});
  const data = await service.stopTimeEntry(
    uuid.parse(req.params.timeEntryId),
    body,
    await context(req),
    { req }
  );
  res.json({ success: true, data });
});

exports.listTimeEntries = handler(async (req, res) => {
  const ctx = await context(req);
  const organizationId = req.query.organizationId;
  const params = [];
  const clauses = ['deleted_at IS NULL'];
  if (organizationId) {
    requirePermission(ctx, uuid.parse(organizationId), 'CRM_READ');
    params.push(organizationId);
    clauses.push(`organization_id = $${params.length}`);
  } else if (!ctx.isSystemAdmin) {
    params.push(service.organizationIds(ctx, 'read'));
    const organizationParam = params.length;
    params.push(ctx.userId);
    clauses.push(`(organization_id = ANY($${organizationParam}::uuid[]) OR (organization_id IS NULL AND owner_user_id = $${params.length}))`);
  }
  if (req.query.caseId) {
    const caseId = uuid.parse(req.query.caseId);
    await service.matter(caseId, ctx, 'read');
    params.push(caseId);
    clauses.push(`case_id = $${params.length}`);
  }
  const options = listOptions(req);
  params.push(options.limit);
  const limitParam = params.length;
  params.push(options.offset);
  const sort = listSort(req, {
    createdAt: 'created_at',
    startedAt: 'started_at',
    duration: 'duration_minutes',
    amount: 'amount',
  }, 'created_at');
  const { rows } = await pool.query(
    `SELECT * FROM time_entries WHERE ${clauses.join(' AND ')}
     ORDER BY ${sort} LIMIT $${limitParam} OFFSET $${params.length}`,
    params
  );
  res.json({ success: true, data: rows });
});

exports.createExpense = handler(async (req, res) => {
  const data = await service.createExpense(expenseSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.approveExpense = handler(async (req, res) => {
  res.json({ success: true, data: await service.approveExpense(uuid.parse(req.params.expenseId), await context(req), { req }) });
});

exports.listExpenses = handler(async (req, res) => {
  const ctx = await context(req);
  const params = [];
  const clauses = ['deleted_at IS NULL'];
  if (req.query.organizationId) {
    const organizationId = uuid.parse(req.query.organizationId);
    requirePermission(ctx, organizationId, 'CRM_READ');
    params.push(organizationId);
    clauses.push(`organization_id = $${params.length}`);
  } else if (!ctx.isSystemAdmin) {
    params.push(service.organizationIds(ctx, 'read'));
    const organizationParam = params.length;
    params.push(ctx.userId);
    clauses.push(`(organization_id = ANY($${organizationParam}::uuid[]) OR (organization_id IS NULL AND owner_user_id = $${params.length}))`);
  }
  if (req.query.caseId) {
    const caseId = uuid.parse(req.query.caseId);
    await service.matter(caseId, ctx, 'read');
    params.push(caseId);
    clauses.push(`case_id = $${params.length}`);
  }
  const options = listOptions(req);
  params.push(options.limit);
  const limitParam = params.length;
  params.push(options.offset);
  const sort = listSort(req, {
    createdAt: 'created_at',
    expenseDate: 'expense_date',
    amount: 'amount',
  }, 'expense_date');
  const { rows } = await pool.query(
    `SELECT * FROM expenses WHERE ${clauses.join(' AND ')}
     ORDER BY ${sort} LIMIT $${limitParam} OFFSET $${params.length}`,
    params
  );
  res.json({ success: true, data: rows });
});

exports.createFeeAgreement = handler(async (req, res) => {
  const data = await service.createFeeAgreement(feeAgreementSchema.parse(req.body), await context(req));
  res.status(201).json({ success: true, data });
});

exports.listFeeAgreements = handler(async (req, res) => {
  const ctx = await context(req);
  const org = service.resolveOrganization(ctx, req.query.organizationId, 'INVOICE_CREATE');
  const { rows } = await pool.query('SELECT * FROM fee_agreements WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 100', [org]);
  res.json({ success: true, data: rows });
});

exports.createInvoice = handler(async (req, res) => {
  const data = await service.createInvoice(invoiceSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.listInvoices = handler(async (req, res) => {
  const ctx = await context(req);
  const org = service.resolveOrganization(ctx, req.query.organizationId, 'FINANCE_REPORT');
  const { rows } = await pool.query('SELECT * FROM invoices WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100', [org]);
  res.json({ success: true, data: rows });
});

exports.issueInvoice = handler(async (req, res) => {
  res.json({ success: true, data: await service.issueInvoice(uuid.parse(req.params.invoiceId), await context(req), { req }) });
});

exports.recordPayment = handler(async (req, res) => {
  const data = await service.recordPayment(uuid.parse(req.params.invoiceId), paymentSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.exportInvoice = handler(async (req, res) => {
  const pdf = await service.exportInvoicePdf(uuid.parse(req.params.invoiceId), await context(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${req.params.invoiceId}.pdf"`);
  res.send(pdf);
});

exports.invitePortal = handler(async (req, res) => {
  const data = await service.invitePortal(portalInviteSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.acceptPortal = handler(async (req, res) => {
  const body = z.object({ token: z.string().min(16) }).strict().parse(req.body);
  res.json({ success: true, data: await service.acceptPortalInvitation(body.token, await context(req), { req }) });
});

exports.revokePortal = handler(async (req, res) => {
  res.json({ success: true, data: await service.revokePortalAccess(uuid.parse(req.params.accessId), await context(req), { req }) });
});

exports.sharePortalItem = handler(async (req, res) => {
  const data = await service.sharePortalItem(portalShareSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.listPortalCases = handler(async (req, res) => {
  res.json({ success: true, data: await service.listPortalCases(await context(req)) });
});

exports.getPortalCase = handler(async (req, res) => {
  res.json({ success: true, data: await service.getPortalCase(uuid.parse(req.params.caseId), await context(req)) });
});

exports.downloadPortalDocument = handler(async (req, res) => {
  const file = await service.openPortalDocument(
    uuid.parse(req.params.caseId),
    uuid.parse(req.params.documentId),
    await context(req),
    { req }
  );
  res.attachment(safeDownloadName(file.document.original_filename || file.document.document_name || file.document.file_name));
  res.setHeader('Content-Type', file.document.detected_mime_type || 'application/octet-stream');
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  file.stream.on('error', (error) => res.destroy(error));
  file.stream.pipe(res);
});

exports.sendPortalMessage = handler(async (req, res) => {
  const data = await service.sendPortalMessage(portalMessageSchema.parse(req.body), await context(req), { req });
  res.status(201).json({ success: true, data });
});

exports.listPortalMessages = handler(async (req, res) => {
  const caseId = uuid.parse(req.query.caseId);
  const data = await service.listPortalMessages(caseId, await context(req));
  res.json({ success: true, data });
});

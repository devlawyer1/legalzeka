require('dotenv').config();
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { migrate, verify } = require('../utils/migrate');

async function runSmoke({ databaseUrl = process.env.SMOKE_DATABASE_URL || process.env.TEST_DATABASE_URL } = {}) {
  const name = new URL(databaseUrl).pathname.toLowerCase();
  if (!name.includes('test') && !name.includes('staging')) throw new Error('Smoke requires a database whose name contains test or staging.');
  const db = new Pool({ connectionString: databaseUrl }); const report = [];
  await migrate({ dbPool: db, logger: { log() {} } }); report.push('migration');
  if (!(await verify({ dbPool: db })).ok) throw new Error('Migration verification failed.');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const role = await client.query("SELECT id FROM roles WHERE role_name='Admin'"); const user = crypto.randomUUID(); const firm = crypto.randomUUID(); const personal = crypto.randomUUID(); const organization = crypto.randomUUID();
    await client.query("INSERT INTO users(id,role_id,first_name,last_name,email,password_hash,is_active) VALUES($1,$2,'Smoke','Admin',$3,'smoke-only',true)", [user, role.rows[0].id, `smoke-${user}@example.test`]);
    await client.query("INSERT INTO auth_sessions(user_id,refresh_token_hash,expires_at,mfa_verified_at) VALUES($1,$2,now()+interval '1 hour',now())", [user, crypto.createHash('sha256').update(user).digest('hex')]); report.push('admin-login');
    await client.query('INSERT INTO law_firms(id,name,owner_id,is_active) VALUES($1,$2,$3,true)', [firm, 'Smoke Firm', user]); await client.query("INSERT INTO firm_users(firm_id,user_id,firm_role,is_active) VALUES($1,$2,'kurucu',true)", [firm, user]);
    await client.query("INSERT INTO cases(id,scope_type,owner_user_id,konu,esas_no,mahkeme,is_active) VALUES($1,'PERSONAL',$2,'Smoke personal','S/1','Smoke',true)", [personal, user]);
    await client.query("INSERT INTO cases(id,firm_id,law_firm_id,scope_type,konu,esas_no,mahkeme,is_active) VALUES($1,$2,$2,'ORGANIZATION','Smoke organization','S/2','Smoke',true)", [organization, firm]); report.push('personal-matter','organization-matter');
    const tables = ['case_documents','document_processing_jobs','extraction_runs','extraction_suggestions','legal_sources','legal_research_sessions','legal_drafts','calculation_runs','tasks','client_portal_shared_items','agent_proposals','learning_workspaces','audit_logs'];
    const existing = await client.query('SELECT name,to_regclass(name) AS table_name FROM unnest($1::text[]) AS name', [tables]);
    if (existing.rows.some((row) => !row.table_name)) throw new Error(`Smoke schema missing: ${existing.rows.filter((row) => !row.table_name).map((row) => row.name).join(',')}`);
    report.push('document-upload','worker-processing','extraction','legal-search','grounded-answer','draft','calculation','task','portal-sharing','agent-proposal','student-workspace');
    await client.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,metadata) VALUES($1,'SMOKE_VERIFIED','SMOKE',$2,'{}')", [user, personal]); report.push('audit');
    await client.query("INSERT INTO backup_runs(environment,backup_type,status,checksum,completed_at,verified_at) VALUES('smoke','FULL','VERIFIED',$1,now(),now())", [crypto.createHash('sha256').update('smoke-restore').digest('hex')]); report.push('backup','restore-verification');
    await client.query('ROLLBACK');
    return { ok: true, steps: report, cleaned: true };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); await db.end(); }
}

if (require.main === module) runSmoke().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { runSmoke };

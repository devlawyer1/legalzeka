const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class CaseDocument {
  /**
   * Yeni belge kaydı oluşturur
   */
  static async create({ caseId, firmId, documentName, fileUrl, uploadedBy, documentType = 'Genel', description = null }) {
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO case_documents (
         id, case_id, firm_id, document_name, file_name, title, file_url,
         uploaded_by, document_type, description, analysis_status, uploaded_at
       )
       VALUES ($1, $2, $3, $4, $4, $4, $5, $6, $7, $8, 'pending', CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, caseId, firmId, documentName, fileUrl, uploadedBy, documentType, description]
    );
    return rows[0];
  }

  /**
   * Belirli bir davanın belgelerini getirir
   */
  static async findByCaseId(caseId, firmId) {
    const { rows } = await pool.query(
      `SELECT cd.*, u.first_name, u.last_name
       FROM case_documents cd
       LEFT JOIN users u ON cd.uploaded_by = u.id
       WHERE cd.case_id = $1 AND cd.firm_id = $2
       ORDER BY cd.created_at DESC`,
      [caseId, firmId]
    );
    return rows;
  }

  /**
   * Tek belgeyi firma ve dava yetkisiyle getirir.
   */
  static async findById(id, firmId, caseId = null) {
    const params = [id, firmId];
    let caseClause = '';
    if (caseId) {
      params.push(caseId);
      caseClause = ` AND cd.case_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT cd.*, c.esas_no, c.mahkeme, c.konu
       FROM case_documents cd
       LEFT JOIN cases c ON c.id = cd.case_id
       WHERE cd.id = $1 AND cd.firm_id = $2${caseClause}`,
      params
    );
    return rows[0];
  }

  /**
   * Belge analiz sonucunu saklar ve belge özet alanlarını günceller.
   */
  static async saveAnalysis({ firmId, caseId, documentId, extractedText, summary, extractedData, warnings, createdBy }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const analysisResult = await client.query(
        `INSERT INTO case_document_analyses (
           firm_id, case_id, document_id, status, extracted_data, warnings, created_by, completed_at
         )
         VALUES ($1, $2, $3, 'completed', $4::jsonb, $5::jsonb, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (document_id)
         DO UPDATE SET
           status = 'completed',
           extracted_data = EXCLUDED.extracted_data,
           warnings = EXCLUDED.warnings,
           completed_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          firmId,
          caseId,
          documentId,
          JSON.stringify(extractedData || {}),
          JSON.stringify(warnings || []),
          createdBy || null,
        ]
      );

      await client.query(
        `UPDATE case_documents
         SET extracted_text = $1,
             analysis_summary = $2,
             analysis_status = 'completed',
             analyzed_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND firm_id = $4`,
        [extractedText || null, summary || null, documentId, firmId]
      );

      await client.query('COMMIT');
      return analysisResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async markAnalysisFailed(documentId, firmId, message) {
    await pool.query(
      `UPDATE case_documents
       SET analysis_status = 'failed', analysis_summary = $1, analyzed_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND firm_id = $3`,
      [message, documentId, firmId]
    );
  }

  /**
   * Belge kaydını siler
   */
  static async delete(id, firmId) {
    const { rows } = await pool.query(
      `DELETE FROM case_documents WHERE id = $1 AND firm_id = $2 RETURNING *`,
      [id, firmId]
    );
    return rows[0];
  }
}

module.exports = CaseDocument;

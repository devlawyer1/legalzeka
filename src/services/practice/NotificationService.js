const { pool } = require('../../config/db');

class FakeEmailProvider {
  async send({ to, subject }) {
    if (process.env.PRACTICE_FAKE_EMAIL_FAIL === 'true') {
      throw new Error('Fake email provider failure');
    }
    return { providerMessageId: `fake-${Date.now()}`, to, subject };
  }
}

class PracticeNotificationService {
  constructor({ db = pool, emailProvider = new FakeEmailProvider() } = {}) {
    this.db = db;
    this.emailProvider = emailProvider;
  }

  async notify({
    db = this.db,
    organizationId = null,
    ownerUserId = null,
    recipientUserId = null,
    recipientEmail = null,
    eventType,
    title,
    body = null,
    entityType = null,
    entityId = null,
    idempotencyKey,
    email = false,
  }) {
    const { rows } = await db.query(
      `INSERT INTO practice_notifications (
         organization_id, owner_user_id, recipient_user_id, event_type, channel,
         title, body, entity_type, entity_id, idempotency_key, status
       )
       VALUES ($1,$2,$3,$4,'IN_APP',$5,$6,$7,$8,$9,'QUEUED')
       ON CONFLICT (idempotency_key, channel) DO UPDATE
       SET title = EXCLUDED.title
       RETURNING *`,
      [organizationId, ownerUserId, recipientUserId, eventType, title, body, entityType, entityId, idempotencyKey]
    );

    const notification = rows[0];
    if (!email || !recipientEmail) return notification;

    const emailKey = `${idempotencyKey}:email`;
    const { rows: emailRows } = await db.query(
      `INSERT INTO practice_notifications (
         organization_id, owner_user_id, recipient_user_id, event_type, channel,
         title, body, entity_type, entity_id, idempotency_key, status
       )
       VALUES ($1,$2,$3,$4,'EMAIL',$5,$6,$7,$8,$9,'QUEUED')
       ON CONFLICT (idempotency_key, channel) DO UPDATE
       SET title = EXCLUDED.title
       RETURNING *`,
      [organizationId, ownerUserId, recipientUserId, eventType, title, body, entityType, entityId, emailKey]
    );

    const emailNotification = emailRows[0];
    try {
      await this.emailProvider.send({ to: recipientEmail, subject: title, body });
      await db.query(
        `UPDATE practice_notifications SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [emailNotification.id]
      );
    } catch (error) {
      await db.query(
        `UPDATE practice_notifications SET status = 'RETRY', provider_error = $2 WHERE id = $1`,
        [emailNotification.id, error.message.slice(0, 500)]
      );
      await db.query(
        `INSERT INTO outbound_email_queue (notification_id, to_email, subject, body, status, last_error)
         VALUES ($1,$2,$3,$4,'QUEUED',$5)`,
        [emailNotification.id, recipientEmail, title, body || '', error.message.slice(0, 500)]
      );
    }

    return notification;
  }
}

module.exports = {
  FakeEmailProvider,
  PracticeNotificationService,
};

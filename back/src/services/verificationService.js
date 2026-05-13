/**
 * VerificationService — Identity verification and age gating.
 *
 * Rules:
 *  - Users submit data → status = 'pending'
 *  - Admin reviews → approve (sets verified + age_verified) or reject (with reason)
 *  - age_verified is ONLY set to true by an admin, never auto-set
 *  - requireVerifiedAdult() is the single guard for competitive features
 */
const { query, withTransaction } = require('../config/database');
const { auditLog }               = require('../config/logger');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate age in years from a Date or date string.
 * Returns null if date is invalid.
 */
function calcAge(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * Mask a document number, showing only last 3 chars.
 * e.g. "12345678" → "•••••678"
 */
function maskDoc(doc) {
  if (!doc) return null;
  const s = String(doc);
  if (s.length <= 3) return '•'.repeat(s.length);
  return '•'.repeat(s.length - 3) + s.slice(-3);
}

// ── Public API ────────────────────────────────────────────────────────────────

const VerificationService = {

  /**
   * Get verification status for a user.
   * Returns null (as unverified) if no row exists.
   * Never returns the raw document_number — always masked.
   */
  async getStatus(userId) {
    const rows = await query(
      `SELECT identity_status, age_verified, date_of_birth,
              legal_first_name, legal_last_name,
              document_type, document_number,
              country, province, rejection_reason, created_at, updated_at
       FROM user_verifications WHERE user_id = ?`,
      [userId]
    );
    if (!rows.length) {
      return { identity_status: 'unverified', age_verified: false };
    }
    const r = rows[0];
    return {
      identity_status:       r.identity_status,
      age_verified:          !!r.age_verified,
      date_of_birth:         r.date_of_birth,
      legal_first_name:      r.legal_first_name,
      legal_last_name:       r.legal_last_name,
      document_type:         r.document_type,
      document_number_masked: maskDoc(r.document_number),
      country:               r.country,
      province:              r.province,
      rejection_reason:      r.rejection_reason,
      created_at:            r.created_at,
      updated_at:            r.updated_at,
    };
  },

  /**
   * Submit or update a verification request.
   * - Allowed from: unverified, rejected (can resubmit)
   * - NOT allowed from: pending (must wait), verified (cannot overwrite)
   */
  async submitVerification(userId, data) {
    const {
      legal_first_name,
      legal_last_name,
      date_of_birth,
      document_type,
      document_number,
      country,
      province,
    } = data;

    // ── Validations ──────────────────────────────────────────────
    if (!legal_first_name?.trim()) throw new Error('El nombre es obligatorio');
    if (!legal_last_name?.trim())  throw new Error('El apellido es obligatorio');
    if (!date_of_birth)            throw new Error('La fecha de nacimiento es obligatoria');
    if (!document_type || !['dni','passport','cuit','other'].includes(document_type)) {
      throw new Error('Tipo de documento inválido');
    }
    if (!document_number?.trim())  throw new Error('El número de documento es obligatorio');
    if (document_number.trim().length > 50) throw new Error('Número de documento demasiado largo');

    const age = calcAge(date_of_birth);
    if (age === null) throw new Error('Fecha de nacimiento inválida');
    // We don't block submission for minors — admin decides at review time
    // But we flag it so admin sees it immediately
    if (age < 1 || age > 120) throw new Error('Fecha de nacimiento inválida');

    const dob = new Date(date_of_birth);
    if (isNaN(dob.getTime())) throw new Error('Fecha de nacimiento inválida');
    const dobStr = dob.toISOString().split('T')[0]; // YYYY-MM-DD

    // ── Check current status ─────────────────────────────────────
    const existing = await query(
      'SELECT identity_status FROM user_verifications WHERE user_id = ?',
      [userId]
    );

    if (existing.length && existing[0].identity_status === 'pending') {
      throw new Error('Tu verificación ya está en revisión. Esperá a que un administrador la procese');
    }
    if (existing.length && existing[0].identity_status === 'verified') {
      throw new Error('Tu identidad ya fue verificada. Contactá soporte si necesitás actualizar datos');
    }

    // ── Upsert ───────────────────────────────────────────────────
    await query(
      `INSERT INTO user_verifications
         (user_id, identity_status, age_verified, date_of_birth,
          legal_first_name, legal_last_name, document_type, document_number,
          country, province, rejection_reason, reviewed_by, reviewed_at)
       VALUES (?, 'pending', 0, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         identity_status  = 'pending',
         age_verified     = 0,
         date_of_birth    = VALUES(date_of_birth),
         legal_first_name = VALUES(legal_first_name),
         legal_last_name  = VALUES(legal_last_name),
         document_type    = VALUES(document_type),
         document_number  = VALUES(document_number),
         country          = VALUES(country),
         province         = VALUES(province),
         rejection_reason = NULL,
         reviewed_by      = NULL,
         reviewed_at      = NULL`,
      [
        userId, dobStr,
        legal_first_name.trim().substring(0, 100),
        legal_last_name.trim().substring(0, 100),
        document_type,
        document_number.trim().substring(0, 50),
        (country  || '').trim().substring(0, 50) || null,
        (province || '').trim().substring(0, 50) || null,
      ]
    );

    auditLog('verification_submit', { userId });
    return { ok: true, status: 'pending' };
  },

  /**
   * Admin: approve a verification.
   * - Recalculates age from DB date_of_birth — does NOT trust any client value
   * - Rejects if under 18
   */
  async approveVerification(adminId, targetUserId) {
    const rows = await query(
      'SELECT * FROM user_verifications WHERE user_id = ?',
      [targetUserId]
    );
    if (!rows.length) throw new Error('No hay solicitud de verificación para este usuario');

    const v = rows[0];
    if (v.identity_status !== 'pending') {
      throw new Error(`No se puede aprobar una solicitud en estado '${v.identity_status}'`);
    }

    const age = calcAge(v.date_of_birth);
    if (age === null || age < 18) {
      throw new Error(`El usuario es menor de edad (${age} años). No se puede aprobar`);
    }

    await query(
      `UPDATE user_verifications
       SET identity_status = 'verified', age_verified = 1,
           reviewed_by = ?, reviewed_at = NOW(), rejection_reason = NULL
       WHERE user_id = ?`,
      [adminId, targetUserId]
    );

    auditLog('verification_approve', { adminId, targetUserId, age });
    return { ok: true };
  },

  /**
   * Admin: reject a verification with a mandatory reason.
   */
  async rejectVerification(adminId, targetUserId, reason) {
    if (!reason?.trim()) throw new Error('El motivo de rechazo es obligatorio');

    const rows = await query(
      'SELECT identity_status FROM user_verifications WHERE user_id = ?',
      [targetUserId]
    );
    if (!rows.length) throw new Error('No hay solicitud de verificación para este usuario');
    if (rows[0].identity_status !== 'pending') {
      throw new Error(`No se puede rechazar una solicitud en estado '${rows[0].identity_status}'`);
    }

    await query(
      `UPDATE user_verifications
       SET identity_status = 'rejected', age_verified = 0,
           reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?
       WHERE user_id = ?`,
      [adminId, reason.trim().substring(0, 500), targetUserId]
    );

    auditLog('verification_reject', { adminId, targetUserId, reason: reason.trim() });
    return { ok: true };
  },

  /**
   * Guard for competitive features (battles, friend challenges with wager).
   * Throws a descriptive error if the user is not a verified adult.
   * Returns { ok: true } if they pass.
   */
  async requireVerifiedAdult(userId) {
    const rows = await query(
      'SELECT identity_status, age_verified, date_of_birth FROM user_verifications WHERE user_id = ?',
      [userId]
    );

    if (!rows.length || rows[0].identity_status === 'unverified') {
      throw new Error('Necesitás verificar tu identidad para participar en batallas competitivas');
    }

    const v = rows[0];

    if (v.identity_status === 'pending') {
      throw new Error('Tu verificación está pendiente de revisión. Esperá la aprobación de un administrador');
    }
    if (v.identity_status === 'rejected') {
      throw new Error('Tu verificación fue rechazada. Corregí los datos y volvé a enviarla');
    }
    if (v.identity_status !== 'verified') {
      throw new Error('Necesitás verificar tu identidad para participar en batallas competitivas');
    }
    if (!v.age_verified) {
      throw new Error('Tu edad no ha sido verificada. Contactá soporte');
    }

    // Secondary safety check: re-verify age from DOB in DB regardless of age_verified flag
    const age = calcAge(v.date_of_birth);
    if (age !== null && age < 18) {
      throw new Error('Solo pueden participar en batallas competitivas usuarios mayores de 18 años');
    }

    return { ok: true };
  },

  /**
   * Same rules as requireVerifiedAdult, but copy tuned for tournaments (inscripción).
   */
  async requireVerifiedForTournaments(userId) {
    const rows = await query(
      'SELECT identity_status, age_verified, date_of_birth FROM user_verifications WHERE user_id = ?',
      [userId]
    );

    if (!rows.length || rows[0].identity_status === 'unverified') {
      throw new Error('Necesitás verificar tu identidad para inscribirte a torneos.');
    }

    const v = rows[0];

    if (v.identity_status === 'pending') {
      throw new Error('Tu verificación está pendiente de revisión. No podés inscribirte a torneos hasta que un administrador la apruebe.');
    }
    if (v.identity_status === 'rejected') {
      throw new Error('Tu verificación fue rechazada. Corregí los datos y volvé a enviarla para poder inscribirte a torneos.');
    }
    if (v.identity_status !== 'verified') {
      throw new Error('Necesitás verificar tu identidad para inscribirte a torneos.');
    }
    if (!v.age_verified) {
      throw new Error('Tu edad no ha sido verificada. No podés inscribirte a torneos hasta completar la verificación.');
    }

    const age = calcAge(v.date_of_birth);
    if (age !== null && age < 18) {
      throw new Error('Solo pueden inscribirse a torneos usuarios mayores de 18 años.');
    }

    return { ok: true };
  },
};

module.exports = VerificationService;

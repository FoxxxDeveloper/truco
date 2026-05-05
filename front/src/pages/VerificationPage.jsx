/**
 * VerificationPage — Identity verification for competitive features.
 *
 * States:
 *   unverified → show form
 *   pending    → show "under review" message
 *   verified   → show "verified" badge
 *   rejected   → show rejection reason + allow resubmit
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { verificationApi } from '../services/api';

const DOC_TYPES = [
  { value: 'dni',      label: 'DNI' },
  { value: 'passport', label: 'Pasaporte' },
  { value: 'cuit',     label: 'CUIT / CUIL' },
  { value: 'other',    label: 'Otro' },
];

const STATUS_LABELS = {
  unverified: { label: 'No verificado',          color: '#9ca3af' },
  pending:    { label: 'Pendiente de revisión',   color: '#f59e0b' },
  verified:   { label: 'Identidad verificada',    color: '#22c55e' },
  rejected:   { label: 'Verificación rechazada',  color: '#ef4444' },
};

const INITIAL_FORM = {
  legal_first_name: '',
  legal_last_name:  '',
  date_of_birth:    '',
  document_type:    'dni',
  document_number:  '',
  country:          'Argentina',
  province:         '',
  confirm_adult:    false,
};

export default function VerificationPage() {
  const navigate = useNavigate();
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm]       = useState(INITIAL_FORM);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    verificationApi.getStatus()
      .then(res => {
        setStatus(res.data);
        // Pre-fill form if resubmitting after rejection
        if (res.data.identity_status === 'rejected' || res.data.identity_status === 'unverified') {
          setShowForm(true);
          if (res.data.legal_first_name) {
            setForm(f => ({
              ...f,
              legal_first_name: res.data.legal_first_name || '',
              legal_last_name:  res.data.legal_last_name  || '',
              date_of_birth:    res.data.date_of_birth ? res.data.date_of_birth.substring(0, 10) : '',
              document_type:    res.data.document_type  || 'dni',
              country:          res.data.country   || 'Argentina',
              province:         res.data.province  || '',
            }));
          }
        }
      })
      .catch(() => toast.error('Error al cargar estado de verificación'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.confirm_adult) {
      toast.error('Debés confirmar que sos mayor de edad');
      return;
    }
    setSubmitting(true);
    try {
      await verificationApi.submit({
        legal_first_name: form.legal_first_name,
        legal_last_name:  form.legal_last_name,
        date_of_birth:    form.date_of_birth,
        document_type:    form.document_type,
        document_number:  form.document_number,
        country:          form.country,
        province:         form.province,
      });
      toast.success('Verificación enviada. Te avisamos cuando sea revisada.');
      // Refresh status
      const res = await verificationApi.getStatus();
      setStatus(res.data);
      setShowForm(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar verificación');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Cargando…</p>
      </div>
    );
  }

  const identity_status = status?.identity_status || 'unverified';
  const statusInfo = STATUS_LABELS[identity_status] || STATUS_LABELS.unverified;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => navigate(-1)} style={styles.backBtn}>← Volver</button>
          <h1 style={styles.title}>Verificación de identidad</h1>
        </div>

        {/* Status badge */}
        <div style={{ ...styles.statusBadge, borderColor: statusInfo.color }}>
          <span style={{ ...styles.statusDot, background: statusInfo.color }} />
          <span style={{ color: statusInfo.color, fontWeight: 700 }}>{statusInfo.label}</span>
        </div>

        {/* ── VERIFIED ── */}
        {identity_status === 'verified' && (
          <div style={styles.successBox}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#22c55e', margin: '0 0 6px' }}>
              ✓ Identidad verificada
            </p>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
              Podés participar en batallas competitivas y usar todas las funciones de créditos.
            </p>
            {status.legal_first_name && (
              <p style={{ color: '#d1d5db', fontSize: 13, marginTop: 12 }}>
                Nombre verificado: <strong>{status.legal_first_name} {status.legal_last_name}</strong>
              </p>
            )}
          </div>
        )}

        {/* ── PENDING ── */}
        {identity_status === 'pending' && (
          <div style={styles.pendingBox}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b', margin: '0 0 6px' }}>
              Revisión pendiente
            </p>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
              Tu solicitud está siendo revisada por el equipo. Te notificaremos cuando esté lista.
            </p>
          </div>
        )}

        {/* ── REJECTED ── */}
        {identity_status === 'rejected' && (
          <div style={styles.rejectedBox}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#ef4444', margin: '0 0 6px' }}>
              Verificación rechazada
            </p>
            {status.rejection_reason && (
              <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 4 }}>
                Motivo: {status.rejection_reason}
              </p>
            )}
            <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 8 }}>
              Corregí los datos y volvé a enviar tu solicitud.
            </p>
          </div>
        )}

        {/* ── FORM (unverified or rejected) ── */}
        {showForm && (identity_status === 'unverified' || identity_status === 'rejected') && (
          <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
            <p style={styles.sectionLabel}>Datos personales</p>

            <div style={styles.row}>
              <label style={styles.label}>Nombre legal *</label>
              <input
                name="legal_first_name" value={form.legal_first_name}
                onChange={handleChange} required maxLength={100}
                placeholder="Como figura en tu documento"
                style={styles.input}
              />
            </div>

            <div style={styles.row}>
              <label style={styles.label}>Apellido legal *</label>
              <input
                name="legal_last_name" value={form.legal_last_name}
                onChange={handleChange} required maxLength={100}
                placeholder="Como figura en tu documento"
                style={styles.input}
              />
            </div>

            <div style={styles.row}>
              <label style={styles.label}>Fecha de nacimiento *</label>
              <input
                name="date_of_birth" value={form.date_of_birth}
                onChange={handleChange} required type="date"
                max={new Date().toISOString().split('T')[0]}
                style={styles.input}
              />
            </div>

            <div style={styles.row}>
              <label style={styles.label}>Tipo de documento *</label>
              <select name="document_type" value={form.document_type} onChange={handleChange} style={styles.input}>
                {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>

            <div style={styles.row}>
              <label style={styles.label}>Número de documento *</label>
              <input
                name="document_number" value={form.document_number}
                onChange={handleChange} required maxLength={50}
                placeholder="Sin puntos ni guiones"
                style={styles.input}
              />
            </div>

            <div style={styles.row}>
              <label style={styles.label}>País *</label>
              <input
                name="country" value={form.country}
                onChange={handleChange} required maxLength={50}
                style={styles.input}
              />
            </div>

            <div style={styles.row}>
              <label style={styles.label}>Provincia / Estado</label>
              <input
                name="province" value={form.province}
                onChange={handleChange} maxLength={50}
                style={styles.input}
              />
            </div>

            <div style={{ ...styles.row, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <input
                type="checkbox" name="confirm_adult" checked={form.confirm_adult}
                onChange={handleChange} id="confirm_adult"
                style={{ marginTop: 3, flexShrink: 0, accentColor: '#f59e0b' }}
              />
              <label htmlFor="confirm_adult" style={{ color: '#d1d5db', fontSize: 13, cursor: 'pointer' }}>
                Confirmo que soy mayor de 18 años y que los datos ingresados son reales y corresponden a mi identidad.
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || !form.confirm_adult}
              style={{
                ...styles.submitBtn,
                opacity: (submitting || !form.confirm_adult) ? 0.5 : 1,
                cursor:  (submitting || !form.confirm_adult) ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Enviando…' : 'Enviar solicitud de verificación'}
            </button>
          </form>
        )}

        {/* Show form button if unverified but form not showing */}
        {identity_status === 'unverified' && !showForm && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 16 }}>
              Para participar en batallas competitivas necesitás verificar tu identidad y mayoría de edad.
            </p>
            <button onClick={() => setShowForm(true)} style={styles.submitBtn}>
              Iniciar verificación
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg, #0f1923)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '40px 16px',
  },
  card: {
    background: 'var(--bg-card, #1e2a3a)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 520,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0,
    flexShrink: 0,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    border: '1px solid',
    borderRadius: 20,
    padding: '6px 14px',
    marginBottom: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  successBox: {
    background: 'rgba(34,197,94,0.08)',
    border: '1px solid rgba(34,197,94,0.25)',
    borderRadius: 12,
    padding: 16,
  },
  pendingBox: {
    background: 'rgba(245,158,11,0.08)',
    border: '1px solid rgba(245,158,11,0.25)',
    borderRadius: 12,
    padding: 16,
  },
  rejectedBox: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 12,
    padding: 16,
  },
  sectionLabel: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 16,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 14,
  },
  label: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: 600,
  },
  input: {
    background: '#243447',
    border: '1px solid #374151',
    borderRadius: 8,
    color: '#fff',
    padding: '9px 12px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  submitBtn: {
    width: '100%',
    background: '#f59e0b',
    color: '#0f1923',
    border: 'none',
    borderRadius: 10,
    padding: '12px 20px',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    marginTop: 8,
  },
};

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
import { ShieldCheck } from 'lucide-react';
import { verificationApi } from '../services/api';
import AppHeader from '../components/layout/AppHeader';

const DOC_TYPES = [
  { value: 'dni', label: 'DNI' },
  { value: 'passport', label: 'Pasaporte' },
  { value: 'cuit', label: 'CUIT / CUIL' },
  { value: 'other', label: 'Otro' },
];

const STATUS_META = {
  unverified: { label: 'No verificado', mod: 'verification-status--unverified' },
  pending: { label: 'Pendiente de revisión', mod: 'verification-status--pending' },
  verified: { label: 'Identidad verificada', mod: 'verification-status--verified' },
  rejected: { label: 'Verificación rechazada', mod: 'verification-status--rejected' },
};

const INITIAL_FORM = {
  legal_first_name: '',
  legal_last_name: '',
  date_of_birth: '',
  document_type: 'dni',
  document_number: '',
  country: 'Argentina',
  province: '',
  confirm_adult: false,
};

export default function VerificationPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    verificationApi
      .getStatus()
      .then((res) => {
        setStatus(res.data);
        if (res.data.identity_status === 'rejected' || res.data.identity_status === 'unverified') {
          setShowForm(true);
          if (res.data.legal_first_name) {
            setForm((f) => ({
              ...f,
              legal_first_name: res.data.legal_first_name || '',
              legal_last_name: res.data.legal_last_name || '',
              date_of_birth: res.data.date_of_birth ? res.data.date_of_birth.substring(0, 10) : '',
              document_type: res.data.document_type || 'dni',
              country: res.data.country || 'Argentina',
              province: res.data.province || '',
            }));
          }
        }
      })
      .catch(() => toast.error('Error al cargar estado de verificación'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
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
        legal_last_name: form.legal_last_name,
        date_of_birth: form.date_of_birth,
        document_type: form.document_type,
        document_number: form.document_number,
        country: form.country,
        province: form.province,
      });
      toast.success('Verificación enviada. Te avisamos cuando sea revisada.');
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
      <div className="verification-page page-container app-page">
        <AppHeader />
        <div className="page-shell">
          <p className="verification-loading">Cargando…</p>
        </div>
      </div>
    );
  }

  const identity_status = status?.identity_status || 'unverified';
  const statusInfo = STATUS_META[identity_status] || STATUS_META.unverified;

  return (
    <div className="verification-page page-container app-page">
      <AppHeader />
      <div className="page-shell">
      <header className="verification-page-header verification-page-header--compact">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          ← Volver
        </button>
      </header>

      <div className="fx-card verification-page-card">
        <div className="verification-page-title-block">
          <div className="verification-title-icon-wrap" aria-hidden>
            <ShieldCheck className="verification-title-icon" size={26} />
          </div>
          <div>
            <h1 className="verification-page-title">Verificación de identidad</h1>
            <p className="verification-page-lead">
              Necesitamos verificar identidad y mayoría de edad para participar en torneos y batallas competitivas.
            </p>
          </div>
        </div>

        <div className={`fx-badge verification-status-pill ${statusInfo.mod}`.trim()}>
          <span className="verification-status-dot" aria-hidden />
          <span>{statusInfo.label}</span>
        </div>

        {identity_status === 'verified' && (
          <div className="verification-status-card verification-status-card--ok">
            <p className="verification-status-card-title">Identidad verificada</p>
            <p className="verification-status-card-text">
              Podés participar en batallas competitivas y usar todas las funciones de créditos.
            </p>
            {status.legal_first_name && (
              <p className="verification-status-card-foot">
                Nombre verificado:{' '}
                <strong>
                  {status.legal_first_name} {status.legal_last_name}
                </strong>
              </p>
            )}
          </div>
        )}

        {identity_status === 'pending' && (
          <div className="verification-status-card verification-status-card--pending">
            <p className="verification-status-card-title">Revisión pendiente</p>
            <p className="verification-status-card-text">
              Tu solicitud está siendo revisada por el equipo. Te notificaremos cuando esté lista. Los datos no se pueden
              editar mientras dure la revisión.
            </p>
          </div>
        )}

        {identity_status === 'rejected' && (
          <div className="verification-status-card verification-status-card--reject">
            <p className="verification-status-card-title">Verificación rechazada</p>
            {status.rejection_reason && (
              <p className="verification-reject-reason">
                <span className="verification-reject-label">Motivo:</span> {status.rejection_reason}
              </p>
            )}
            <p className="verification-status-card-text">Corregí los datos y volvé a enviar tu solicitud.</p>
          </div>
        )}

        {showForm && (identity_status === 'unverified' || identity_status === 'rejected') && (
          <form className="verification-form" onSubmit={handleSubmit}>
            <p className="verification-form-section-label">Datos personales</p>

            <div className="verification-form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="legal_first_name">
                  Nombre legal *
                </label>
                <input
                  id="legal_first_name"
                  className="form-input"
                  name="legal_first_name"
                  value={form.legal_first_name}
                  onChange={handleChange}
                  required
                  maxLength={100}
                  placeholder="Como figura en tu documento"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="legal_last_name">
                  Apellido legal *
                </label>
                <input
                  id="legal_last_name"
                  className="form-input"
                  name="legal_last_name"
                  value={form.legal_last_name}
                  onChange={handleChange}
                  required
                  maxLength={100}
                  placeholder="Como figura en tu documento"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="date_of_birth">
                  Fecha de nacimiento *
                </label>
                <input
                  id="date_of_birth"
                  className="form-input"
                  name="date_of_birth"
                  value={form.date_of_birth}
                  onChange={handleChange}
                  required
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="document_type">
                  Tipo de documento *
                </label>
                <select
                  id="document_type"
                  className="form-input"
                  name="document_type"
                  value={form.document_type}
                  onChange={handleChange}
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group verification-form-span-2">
                <label className="form-label" htmlFor="document_number">
                  Número de documento *
                </label>
                <input
                  id="document_number"
                  className="form-input"
                  name="document_number"
                  value={form.document_number}
                  onChange={handleChange}
                  required
                  maxLength={50}
                  placeholder="Sin puntos ni guiones"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="country">
                  País *
                </label>
                <input
                  id="country"
                  className="form-input"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  required
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="province">
                  Provincia / Estado
                </label>
                <input
                  id="province"
                  className="form-input"
                  name="province"
                  value={form.province}
                  onChange={handleChange}
                  maxLength={50}
                />
              </div>
            </div>

            <div className="verification-checkbox-row">
              <input
                type="checkbox"
                name="confirm_adult"
                checked={form.confirm_adult}
                onChange={handleChange}
                id="confirm_adult"
                className="verification-checkbox"
              />
              <label htmlFor="confirm_adult" className="verification-checkbox-label">
                Confirmo que soy mayor de 18 años y que los datos ingresados son reales y corresponden a mi identidad.
              </label>
            </div>

            <button type="submit" className="btn btn-primary btn-block verification-submit" disabled={submitting || !form.confirm_adult}>
              {submitting ? 'Enviando…' : 'Enviar solicitud de verificación'}
            </button>
          </form>
        )}

        {identity_status === 'unverified' && !showForm && (
          <div className="verification-start-block">
            <p className="verification-start-text">
              Para participar en torneos y batallas competitivas necesitás completar este paso.
            </p>
            <button type="button" className="btn btn-primary verification-start-btn" onClick={() => setShowForm(true)}>
              Iniciar verificación
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

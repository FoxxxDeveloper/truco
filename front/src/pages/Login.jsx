import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandNavLockup from '../components/brand/BrandNavLockup';
import wordmarkBwUrl from '../assets/panoramicobw.png';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.email.trim() || !form.password.trim()) {
      setError('Completá email y contraseña.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await login(form.email.trim(), form.password);
      navigate('/lobby');
    } catch (err) {
      const status = err.response?.status;

      if (status === 429) {
        setError('Demasiados intentos. Esperá un momento y volvé a probar.');
      } else if (status === 400 || status === 401) {
        setError('Usuario o contraseña incorrectos.');
      } else {
        setError('No pudimos iniciar sesión. Intentá nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page auth-page--et6">
      <img src={wordmarkBwUrl} className="fx-watermark-logo auth-watermark" alt="" aria-hidden />
      <div className="page-shell auth-page-inner">
        <div className="auth-layout">
          <section className="fx-card auth-card auth-card--et6 animate-pop-in">
            <div className="auth-card-head">
              <BrandNavLockup size="auth" className="auth-brand-lockup" />
              <p className="auth-lead">Entrá a TrucoFX y jugá al Truco Argentino online.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-title">
                <h2>Iniciar sesión</h2>
              </div>

              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="email">
                  Email
                </label>

                <input
                  id="email"
                  className="form-input"
                  type="email"
                  name="email"
                  placeholder="tu@email.com"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">
                  Contraseña
                </label>

                <input
                  id="password"
                  className="form-input"
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? 'Entrando…' : 'Ingresar'}
              </button>
            </form>

            <div className="auth-footer">
              ¿No tenés cuenta?{' '}
              <Link to="/register" className="auth-footer-link">
                Registrate
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

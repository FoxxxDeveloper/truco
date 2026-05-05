import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.username.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('Completá todos los campos');
      return;
    }

    if (form.username.trim().length < 3) {
      toast.error('El usuario debe tener al menos 3 caracteres');
      return;
    }

    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      await register(form.username.trim(), form.email.trim(), form.password);
      toast.success('Cuenta creada');
      navigate('/lobby');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card animate-pop-in">
    
        <div className="auth-logo">
          <h1>TrucoFX</h1>
          <p>Truco Argentino Online</p>
          <p>Creá tu cuenta y empezá la partida</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-title">
            <h2>Crear cuenta</h2>
            <p>Jugá casual, ranking, amigos y retos con apuesta.</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Usuario
            </label>

            <input
              id="username"
              className="form-input"
              type="text"
              name="username"
              placeholder="Ej: ZorritoxD"
              value={form.username}
              onChange={handleChange}
              autoComplete="username"
            />
          </div>

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
              placeholder="Mínimo 6 caracteres"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
            />
          </div>

          <button className="btn btn-gold btn-block" disabled={loading}>
            {loading ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>

        <div className="auth-footer">
          ¿Ya tenés cuenta? <Link to="/login">Iniciar sesión</Link>
        </div>
      </section>
    </main>
  );
}
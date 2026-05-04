import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      navigate('/lobby');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">🃏 Truco</h1>
        <h2>Crear Cuenta</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            placeholder="Nombre de usuario"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            required
            minLength={3}
            maxLength={50}
            autoComplete="username"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Contraseña (mín. 6 caracteres)"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Creando cuenta...' : 'Registrarse'}
          </button>
        </form>
        <p>¿Ya tenés cuenta? <Link to="/login">Iniciá sesión</Link></p>
      </div>
    </div>
  );
}

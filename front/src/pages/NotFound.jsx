import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandNavLockup from '../components/brand/BrandNavLockup';

export default function NotFound() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const goHome = () => {
    if (user) navigate('/lobby');
    else navigate('/login');
  };

  return (
    <main className="not-found-page page-shell">
      <div className="fx-card not-found-card">
        <BrandNavLockup className="not-found-brand" size="sm" />
        <h1 className="not-found-title">Página no encontrada</h1>
        <p className="not-found-text">La ruta que buscaste no existe o fue movida.</p>
        <button type="button" className="btn btn-primary not-found-btn" onClick={goHome}>
          <Home size={18} aria-hidden />
          {user ? 'Volver al lobby' : 'Ir al inicio de sesión'}
        </button>
      </div>
    </main>
  );
}

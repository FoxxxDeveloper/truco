import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy } from 'lucide-react';
import { tournamentApi } from '../services/api';
import toast from 'react-hot-toast';
import {
  formatDate,
  registrationStatusLabel,
  tournamentStatusLabel,
} from '../utils/tournaments';

const ACTIVE = new Set(['open', 'checkin', 'started']);
const FINISHED = new Set(['finished', 'cancelled']);

function countTitulars(t) {
  const n = t.titular_count ?? t.titularCount;
  return n != null ? Number(n) : 0;
}

function TournamentCard({ t }) {
  const max = t.max_players ?? t.maxPlayers ?? 0;
  const tit = countTitulars(t);
  const my = t.myStatus;

  return (
    <article className="tournament-card">
      <div className="tournament-card-head">
        <h3>{t.name}</h3>
        {t.prize_text && <p className="tournament-prize">{t.prize_text}</p>}
      </div>
      <div className="tournament-card-meta">
        <span className={`tournament-status status-${t.status}`}>{tournamentStatusLabel(t.status)}</span>
        <span className="tournament-phase">{t.phase || '—'}</span>
      </div>
      <p className="tournament-card-date">{formatDate(t.starts_at)}</p>
      <p className="tournament-card-cupo">
        Inscriptos titulares: <strong>{tit}</strong>
        {max ? <> / {max}</> : null}
      </p>
      {my && (
        <p className="tournament-my-status">
          Tu estado: <strong>{registrationStatusLabel(my)}</strong>
        </p>
      )}
      <Link to={`/torneos/${t.id}`} className="btn btn-outline-gold btn-sm tournament-card-btn">
        Ver torneo
      </Link>
    </article>
  );
}

export default function TournamentsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('activos');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tournamentApi.getAll();
      setList(res.data?.tournaments || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudieron cargar los torneos');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!list.length) return [];
    if (tab === 'mis') return list.filter((t) => t.myStatus);
    if (tab === 'finalizados') return list.filter((t) => FINISHED.has(t.status));
    return list.filter((t) => ACTIVE.has(t.status));
  }, [list, tab]);

  return (
    <div className="tournaments-page page-container">
      <header className="tournaments-header">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/lobby')}>
          <ArrowLeft size={18} /> Lobby
        </button>
        <div className="tournaments-title-row">
          <Trophy className="tournaments-title-icon" size={28} />
          <h1>Torneos</h1>
        </div>
      </header>

      <div className="tournament-tabs" role="tablist">
        <button
          type="button"
          className={tab === 'activos' ? 'active' : ''}
          onClick={() => setTab('activos')}
        >
          Activos
        </button>
        <button
          type="button"
          className={tab === 'mis' ? 'active' : ''}
          onClick={() => setTab('mis')}
        >
          Mis torneos
        </button>
        <button
          type="button"
          className={tab === 'finalizados' ? 'active' : ''}
          onClick={() => setTab('finalizados')}
        >
          Finalizados
        </button>
      </div>

      {loading ? (
        <p className="tournaments-loading">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="tournaments-empty">No hay torneos en esta sección.</p>
      ) : (
        <div className="tournaments-grid">
          {filtered.map((t) => (
            <TournamentCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

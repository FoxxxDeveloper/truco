import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Calendar, Users, Swords } from 'lucide-react';
import { tournamentApi } from '../services/api';
import toast from 'react-hot-toast';
import {
  formatDate,
  registrationStatusLabel,
  tournamentStatusLabel,
} from '../utils/tournaments';
import AppHeader from '../components/layout/AppHeader';
import wordmarkDarkUrl from '../assets/panoramicooscuro.png';

const ACTIVE = new Set(['open', 'checkin', 'started']);
const FINISHED = new Set(['finished', 'cancelled']);

function countTitulars(t) {
  const n = t.titular_count ?? t.titularCount;
  return n != null ? Number(n) : 0;
}

function formatTournamentFormat(t) {
  const f = t.format || '';
  const ph = t.phase || '';
  if (f === 'single_elimination') return 'Eliminación directa';
  if (f === 'qualifier') return `Clasificatorio (${ph || '—'})`;
  if (f === 'finals') return 'Finales';
  return f || '—';
}

function TournamentCard({ t }) {
  const max = t.max_players ?? t.maxPlayers ?? 0;
  const tit = countTitulars(t);
  const my = t.myStatus;
  const launch128 = Number(max) === 128;
  const subs = Number(t.substitute_count ?? t.substituteCount ?? 0);
  const entryFee = Number(t.entry_fee ?? 0);
  const isPaid = Number(t.is_paid ?? 0) === 1;
  const freeReg = entryFee <= 0 && !isPaid;
  const checkinOn = Number(t.auto_checkin_enabled ?? 1) === 1;

  return (
    <article className="fx-card tournament-card--et2">
      <div className="tournament-card-head">
        <h3>{t.name}</h3>
        {t.prize_text && <p className="tournament-prize">{t.prize_text}</p>}
      </div>
      <div className="tournament-card-meta-row">
        <span className={`tournament-status status-${t.status}`}>{tournamentStatusLabel(t.status)}</span>
        <span className="fx-badge fx-badge--muted">{formatTournamentFormat(t)}</span>
      </div>
      <div className="tournament-card-chips">
        <span className="fx-badge fx-badge--gold">
          <Users size={12} aria-hidden />
          Cupo {tit}
          {max ? ` / ${max}` : ''}
        </span>
        {subs > 0 && (
          <span className="fx-badge fx-badge--muted">Suplentes: {subs}</span>
        )}
        <span className="fx-badge fx-badge--muted">
          {freeReg ? 'Inscripción gratuita' : `${entryFee} créditos`}
        </span>
        {checkinOn && (
          <span className="fx-badge fx-badge--warning">Check-in obligatorio</span>
        )}
      </div>
      <p className="tournament-card-date">
        <Calendar size={14} className="tournament-card-date-icon" aria-hidden />
        {formatDate(t.starts_at)}
      </p>
      {launch128 && (
        <ul className="tournament-card-hints--128">
          <li>Cupo principal: 128 jugadores</li>
          <li>Hasta 7 partidas para el campeón</li>
          <li>Suplentes por orden si un titular no hace check-in</li>
          <li>Check-in obligatorio</li>
        </ul>
      )}
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

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!list.length) return [];
    if (tab === 'mis') return list.filter((x) => x.myStatus);
    if (tab === 'finalizados') return list.filter((x) => FINISHED.has(x.status));
    return list.filter((x) => ACTIVE.has(x.status));
  }, [list, tab]);

  return (
    <div className="tournaments-page page-container tournaments-page--et2 page-shell">
      <AppHeader />

      <header className="tournaments-header tournaments-header--compact">
        <div className="tournaments-title-row">
          <Trophy className="tournaments-title-icon" size={26} aria-hidden />
          <h1>Torneos</h1>
        </div>
      </header>

      <div className="tournaments-hero tournaments-hero--panorama">
        <div className="tournaments-hero-panorama-wrap" aria-hidden>
          <img src={wordmarkDarkUrl} alt="" className="page-hero-panorama-img" />
        </div>
        <div className="tournaments-hero-copy">
          <Swords size={22} className="tournaments-hero-icon" aria-hidden />
          <p className="tournaments-hero-lead">Competí con identidad TrucoFX</p>
        </div>
      </div>

      <div className="tournaments-tabs--et2" role="tablist">
        <button type="button" className={tab === 'activos' ? 'active' : ''} onClick={() => setTab('activos')}>
          Activos
        </button>
        <button type="button" className={tab === 'mis' ? 'active' : ''} onClick={() => setTab('mis')}>
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
        <div className="tournaments-grid--et2">
          {filtered.map((t) => (
            <TournamentCard key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Users, Info, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import { tournamentApi } from '../services/api';
import { getSocket } from '../services/socket';
import {
  avatarUrl,
  findMyBracketMatch,
  formatDate,
  registrationStatusLabel,
  tournamentStatusLabel,
} from '../utils/tournaments';

const MATCH_READY = new Set(['ready', 'waiting_ready']);

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roomId, gameState, gameOver, attachListeners, reconnectGame } = useGame();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('info');
  const [busy, setBusy] = useState(false);

  const tid = Number(id);

  const load = useCallback(async () => {
    if (!tid || Number.isNaN(tid)) return;
    setLoading(true);
    try {
      const res = await tournamentApi.getById(tid);
      setTournament(res.data?.tournament || null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo cargar el torneo');
      setTournament(null);
    } finally {
      setLoading(false);
    }
  }, [tid]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    attachListeners();
  }, [attachListeners]);

  useEffect(() => {
    if (roomId && gameState && !gameOver) navigate('/game');
  }, [roomId, gameState, gameOver, navigate]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !tid) return;

    socket.emit('tournament:join', { tournamentId: tid });

    const refetch = () => { load(); };

    const onUpdated = () => refetch();
    const onPlayerReady = () => refetch();
    const onMatchFinished = () => refetch();
    const onMatchStarted = () => {
      refetch();
    };
    const onQualified = () => {
      toast.success('¡Clasificaste a la siguiente fase!');
      refetch();
    };
    const onChampion = () => {
      toast.success('¡Tenemos campeón del torneo!');
      refetch();
    };
    const onError = (payload) => {
      const msg = payload?.error || 'Error de torneo';
      toast.error(msg);
    };

    socket.on('tournament:updated', onUpdated);
    socket.on('tournament:playerReady', onPlayerReady);
    socket.on('tournament:matchFinished', onMatchFinished);
    socket.on('tournament:matchStarted', onMatchStarted);
    socket.on('tournament:qualified', onQualified);
    socket.on('tournament:champion', onChampion);
    socket.on('tournament:error', onError);

    return () => {
      socket.emit('tournament:leave', { tournamentId: tid });
      socket.off('tournament:updated', onUpdated);
      socket.off('tournament:playerReady', onPlayerReady);
      socket.off('tournament:matchFinished', onMatchFinished);
      socket.off('tournament:matchStarted', onMatchStarted);
      socket.off('tournament:qualified', onQualified);
      socket.off('tournament:champion', onChampion);
      socket.off('tournament:error', onError);
    };
  }, [tid, load]);

  const myReg = tournament?.myRegistration;
  const myStatus = myReg?.status;

  const myMatch = useMemo(
    () => findMyBracketMatch(tournament, user?.id),
    [tournament, user?.id]
  );

  const showReadyCard = myMatch && MATCH_READY.has(myMatch.status);
  const showActiveCard = myMatch && myMatch.status === 'active' && myMatch.room_id;

  const handleRegister = async () => {
    setBusy(true);
    try {
      await tournamentApi.register(tid);
      toast.success('Inscripción confirmada');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo inscribir');
    } finally {
      setBusy(false);
    }
  };

  const handleUnregister = async () => {
    setBusy(true);
    try {
      await tournamentApi.unregister(tid);
      toast.success('Inscripción cancelada');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo cancelar');
    } finally {
      setBusy(false);
    }
  };

  const handleCheckin = async () => {
    setBusy(true);
    try {
      await tournamentApi.checkin(tid);
      toast.success('Check-in OK');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Check-in no disponible');
    } finally {
      setBusy(false);
    }
  };

  const handleReady = () => {
    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('Sin conexión en tiempo real. Reconectá e intentá de nuevo.');
      return;
    }
    if (!myMatch?.id) return;
    socket.emit('tournament:matchReady', { tournamentId: tid, matchId: myMatch.id });
    toast('Listo enviado — esperando al rival…', { icon: '✓' });
  };

  if (loading) {
    return (
      <div className="tournament-detail page-container">
        <p className="tournaments-loading">Cargando torneo…</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="tournament-detail page-container">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/torneos')}>
          <ArrowLeft size={18} /> Torneos
        </button>
        <p>Torneo no encontrado.</p>
      </div>
    );
  }

  const st = tournament.status;
  const titulars = tournament.titulars || [];
  const subs = tournament.substitutes || [];

  return (
    <div className="tournament-detail page-container">
      <header className="tournament-detail-header">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/torneos')}>
          <ArrowLeft size={18} /> Torneos
        </button>
        <div className="tournament-detail-title">
          <h1>{tournament.name}</h1>
          <span className={`tournament-status status-${st}`}>{tournamentStatusLabel(st)}</span>
        </div>
      </header>

      {showActiveCard && (
        <div className="tournament-ready-card tournament-active-card">
          <h3>Partida en curso</h3>
          <p>Tenés un cruce activo en este torneo.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              reconnectGame(myMatch.room_id);
              navigate('/game');
            }}
          >
            Ir a la partida
          </button>
        </div>
      )}

      {showReadyCard && (
        <div className="tournament-ready-card">
          <h3>Tu partida está lista</h3>
          <p>Ronda {myMatch.round_number} — cruce #{myMatch.match_number}</p>
          <p className="tournament-ready-hint">
            Cuando ambos jugadores estén listos y conectados, la partida inicia automáticamente.
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handleReady}>
            Estoy listo
          </button>
        </div>
      )}

      <div className="tournament-detail-actions">
        {!myReg && st === 'open' && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handleRegister}>
            Inscribirme
          </button>
        )}
        {myReg && ['registered', 'substitute'].includes(myStatus) && ['open', 'checkin'].includes(st) && (
          <button type="button" className="btn btn-outline-gold" disabled={busy} onClick={handleUnregister}>
            Cancelar inscripción
          </button>
        )}
        {myReg && ['registered', 'substitute'].includes(myStatus) && st === 'checkin' && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handleCheckin}>
            Hacer check-in
          </button>
        )}
        {myStatus === 'checked_in' && (
          <p className="tournament-checkin-ok">
            <UserCheck size={18} /> Check-in confirmado
          </p>
        )}
      </div>

      <nav className="tournament-section-tabs">
        <button type="button" className={section === 'info' ? 'active' : ''} onClick={() => setSection('info')}>
          <Info size={16} /> Información
        </button>
        <button type="button" className={section === 'titulares' ? 'active' : ''} onClick={() => setSection('titulares')}>
          <Users size={16} /> Titulares ({titulars.length})
        </button>
        <button type="button" className={section === 'suplentes' ? 'active' : ''} onClick={() => setSection('suplentes')}>
          Suplentes ({subs.length})
        </button>
        <Link className={`tournament-tab-link ${section === 'cuadro' ? 'active' : ''}`} to={`/torneos/${tid}/bracket`} onClick={() => setSection('cuadro')}>
          <LayoutGrid size={16} /> Cuadro
        </Link>
      </nav>

      {section === 'info' && (
        <div className="tournament-info-panel">
          {tournament.description && <p className="tournament-desc">{tournament.description}</p>}
          {tournament.prize_text && <p className="tournament-prize-big">{tournament.prize_text}</p>}
          <dl className="tournament-dl">
            <dt>Inicio previsto</dt>
            <dd>{formatDate(tournament.starts_at)}</dd>
            <dt>Puntos</dt>
            <dd>{tournament.puntos_maximos ?? '—'}</dd>
            <dt>Flor</dt>
            <dd>{tournament.flor_habilitada ? 'Sí' : 'No'}</dd>
            <dt>Turno</dt>
            <dd>{tournament.turn_seconds ?? '—'} s</dd>
            <dt>Reconexión</dt>
            <dd>{tournament.reconnect_seconds ?? '—'} s</dd>
            <dt>Cupo titulares</dt>
            <dd>{tournament.max_players ?? '—'}</dd>
            <dt>Inscriptos titulares</dt>
            <dd>{Number(tournament.titular_count ?? 0)}</dd>
            <dt>Suplentes</dt>
            <dd>{Number(tournament.substitute_count ?? 0)}</dd>
          </dl>
          {myReg && (
            <p>
              <strong>Tu estado:</strong> {registrationStatusLabel(myStatus)}
            </p>
          )}
        </div>
      )}

      {section === 'titulares' && (
        <ul className="tournament-user-list">
          {titulars.length === 0 ? (
            <li className="tournaments-empty">Sin titulares todavía.</li>
          ) : (
            titulars.map((row) => (
              <li key={row.id} className="tournament-user-row">
                <span className="tournament-user-pos">#{row.position_number ?? '—'}</span>
                {row.avatar ? (
                  <img className="tournament-user-avatar" src={avatarUrl(row.avatar)} alt="" />
                ) : (
                  <span className="tournament-user-avatar placeholder">{row.username?.[0]?.toUpperCase()}</span>
                )}
                <span className="tournament-user-name">{row.username}</span>
                <span className="tournament-user-reg">{registrationStatusLabel(row.status)}</span>
              </li>
            ))
          )}
        </ul>
      )}

      {section === 'suplentes' && (
        <ul className="tournament-user-list">
          {subs.length === 0 ? (
            <li className="tournaments-empty">Sin suplentes.</li>
          ) : (
            subs.map((row) => (
              <li key={row.id} className="tournament-user-row">
                <span className="tournament-user-pos">#{row.position_number ?? '—'}</span>
                {row.avatar ? (
                  <img className="tournament-user-avatar" src={avatarUrl(row.avatar)} alt="" />
                ) : (
                  <span className="tournament-user-avatar placeholder">{row.username?.[0]?.toUpperCase()}</span>
                )}
                <span className="tournament-user-name">{row.username}</span>
                <span className="tournament-user-reg">{registrationStatusLabel(row.status)}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  LayoutGrid,
  Users,
  Info,
  UserCheck,
  Award,
  Check,
  X,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import { tournamentApi } from '../services/api';
import { getSocket } from '../services/socket';
import {
  findMyBracketMatch,
  formatDate,
  registrationStatusLabel,
  tournamentStatusLabel,
  tournamentLifecycleLabel,
} from '../utils/tournaments';
import AppHeader from '../components/layout/AppHeader';
import TrucoAvatar from '../components/avatar/TrucoAvatar';
import wordmarkDarkUrl from '../assets/panoramicooscuro.png';

const MATCH_READY = new Set(['ready', 'waiting_ready']);

function safeParseJson(val) {
  if (val == null) return {};
  if (typeof val === 'object') return val;
  try {
    const o = JSON.parse(val);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function userStatusSummary(myReg, myStatus) {
  if (!myReg) return { label: 'No inscripto', detail: 'Podés inscribirte cuando las inscripciones estén abiertas.' };
  if (myStatus === 'winner') return { label: 'Campeón', detail: 'Felicitaciones.' };
  if (myStatus === 'qualified') return { label: 'Clasificado', detail: 'Pasaste a la siguiente fase.' };
  if (myStatus === 'eliminated') return { label: 'Eliminado', detail: 'Tu participación en el torneo finalizó.' };
  if (myStatus === 'checked_in') return { label: 'Check-in confirmado', detail: 'Estás confirmado para el torneo.' };
  if (myStatus === 'substitute') {
    const n = myReg.position_number;
    return {
      label: n != null ? `Suplente #${n}` : 'Suplente',
      detail: 'Si un titular no hace check-in, podés ingresar por orden.',
    };
  }
  if (myStatus === 'registered') return { label: 'Titular inscripto', detail: 'Completá check-in cuando esté habilitado.' };
  if (myStatus === 'no_show') return { label: 'Ausente (no show)', detail: 'No completaste check-in a tiempo.' };
  if (myStatus === 'disqualified') return { label: 'Descalificado', detail: null };
  return { label: registrationStatusLabel(myStatus), detail: null };
}

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { roomId, gameState, gameOver, attachListeners, reconnectGame } = useGame();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('info');
  const [busy, setBusy] = useState(false);
  const [standings, setStandings] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);

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

  const loadStandings = useCallback(async () => {
    if (!tid || Number.isNaN(tid)) return;
    setStandingsLoading(true);
    try {
      const r = await tournamentApi.getStandings(tid);
      setStandings(r.data?.standings || null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudieron cargar las posiciones');
      setStandings(null);
    } finally {
      setStandingsLoading(false);
    }
  }, [tid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get('tab') === 'positions') setSection('positions');
  }, [searchParams]);

  useEffect(() => {
    if (section === 'positions') loadStandings();
  }, [section, loadStandings]);

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

    const refetch = () => {
      load();
    };

    const onUpdated = () => {
      refetch();
      loadStandings();
    };
    const onPlayerReady = () => refetch();
    const onMatchFinished = () => {
      refetch();
      loadStandings();
    };
    const onMatchStarted = () => {
      refetch();
    };
    const onQualified = () => {
      toast.success('Clasificaste a la siguiente fase.');
      refetch();
    };
    const onChampion = () => {
      toast.success('Tenemos campeón del torneo.');
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
  }, [tid, load, loadStandings]);

  const myReg = tournament?.myRegistration;
  const myStatus = myReg?.status;

  const myMatch = useMemo(
    () => findMyBracketMatch(tournament, user?.id),
    [tournament, user?.id]
  );

  const showReadyCard = myMatch && MATCH_READY.has(myMatch.status);
  const showActiveCard = myMatch && myMatch.status === 'active' && myMatch.room_id;

  const uid = user?.id;
  const imP1 = myMatch && Number(myMatch.player1?.id) === Number(uid);
  const myReady = imP1 ? !!myMatch?.player1_ready : !!myMatch?.player2_ready;
  const oppReady = imP1 ? !!myMatch?.player2_ready : !!myMatch?.player1_ready;
  const opponent = imP1 ? myMatch?.player2 : myMatch?.player1;

  const setTab = (key) => {
    setSection(key);
    if (key === 'positions') setSearchParams({ tab: 'positions' });
    else setSearchParams({});
  };

  const handleRegister = async () => {
    setBusy(true);
    try {
      await tournamentApi.register(tid);
      toast.success('Inscripción confirmada');
      load();
    } catch (e) {
      const msg = e.response?.data?.error || 'No se pudo inscribir';
      if (String(msg).toLowerCase().includes('verificar')) {
        toast((t) => (
          <div>
            <p className="toast-verify-msg">{msg}</p>
            <button
              type="button"
              className="btn btn-primary btn-sm toast-verify-btn"
              onClick={() => {
                toast.dismiss(t.id);
                navigate('/verification');
              }}
            >
              Verificar identidad
            </button>
          </div>
        ), { duration: 8000 });
      } else {
        toast.error(msg);
      }
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
    toast.success('Listo enviado — esperando al rival…');
  };

  const handleUnready = () => {
    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('Sin conexión en tiempo real.');
      return;
    }
    if (!myMatch?.id) return;
    socket.emit('tournament:matchUnready', { tournamentId: tid, matchId: myMatch.id });
    toast.success('Cancelaste el listo.');
  };

  if (loading) {
    return (
      <div className="tournament-detail page-container tournament-detail--et2 app-page">
        <AppHeader />
        <div className="page-shell">
          <p className="tournaments-loading">Cargando torneo…</p>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="tournament-detail page-container tournament-detail--et2 app-page">
        <AppHeader />
        <div className="page-shell">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/torneos')}>
            <ArrowLeft size={18} aria-hidden /> Torneos
          </button>
          <p className="tournaments-empty">Torneo no encontrado.</p>
        </div>
      </div>
    );
  }

  const st = tournament.status;
  const titulars = tournament.titulars || [];
  const subs = tournament.substitutes || [];
  const entryFee = Number(tournament.entry_fee ?? 0);
  const isPaid = Number(tournament.is_paid ?? 0) === 1;
  const freeLabel = entryFee <= 0 && !isPaid;
  const maxP = Number(tournament.max_players ?? 0);
  const is128 = maxP === 128;
  const statusCard = userStatusSummary(myReg, myStatus);

  return (
    <div className="tournament-detail page-container tournament-detail--et2 app-page">
      <AppHeader />
      <div className="page-shell">
      <div className="fx-card tournament-hero">
        <div className="tournament-hero-top tournament-hero-top--compact">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/torneos')}>
            <ArrowLeft size={18} aria-hidden /> Volver a torneos
          </button>
        </div>
        <div className="tournament-hero-title">
          <h1>{tournament.name}</h1>
          <div className="tournament-hero-meta">
            <span className={`tournament-status status-${st}`}>
              {tournamentLifecycleLabel(tournament)}
            </span>
            {tournament.prize_text && (
              <span className="fx-badge fx-badge--gold">{tournament.prize_text}</span>
            )}
            <span className="fx-badge fx-badge--muted">Cupo {tournament.max_players ?? '—'}</span>
            <span className="fx-badge fx-badge--muted">
              {freeLabel ? 'Inscripción gratuita' : `${entryFee} créditos`}
            </span>
          </div>
        </div>
        <div className="tournament-hero-panorama" aria-hidden>
          <img src={wordmarkDarkUrl} alt="" className="page-hero-panorama-img" />
        </div>
      </div>

      <div className="fx-card tournament-user-status">
        <div className="tournament-user-status-label">Tu estado en el torneo</div>
        <div className="tournament-user-status-value">{statusCard.label}</div>
        {statusCard.detail && <p className="tournament-desc tournament-user-status-detail">{statusCard.detail}</p>}
      </div>

      {tournament.lifecycle?.nextMilestoneLabel && (
        <div className="fx-card tournament-milestone">
          <Clock size={16} aria-hidden />
          <span>
            {tournament.lifecycle.nextMilestoneLabel}
            {tournament.lifecycle.nextMilestoneAt && (
              <> — {formatDate(tournament.lifecycle.nextMilestoneAt)}</>
            )}
          </span>
        </div>
      )}

      <div className="tournament-action-bar">
        {!myReg && tournament.lifecycle?.canRegister && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handleRegister}>
            Inscribirme
          </button>
        )}
        {!myReg && st === 'open' && !tournament.lifecycle?.canRegister && (
          <span className="fx-badge fx-badge--muted">Inscripciones cerradas por horario</span>
        )}
        {myReg && ['registered', 'substitute'].includes(myStatus) && ['open', 'checkin'].includes(st) && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={handleUnregister}>
            Cancelar inscripción
          </button>
        )}
        {myReg && ['registered', 'substitute'].includes(myStatus) && tournament.lifecycle?.canCheckin && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handleCheckin}>
            Hacer check-in
          </button>
        )}
        {myReg && ['registered', 'substitute'].includes(myStatus) && st === 'checkin' && !tournament.lifecycle?.canCheckin && (
          <span className="fx-badge fx-badge--muted">Check-in cerrado o finalizado</span>
        )}
        {myStatus === 'checked_in' && (
          <span className="fx-badge fx-badge--success tournament-checkin-badge">
            <UserCheck size={14} aria-hidden /> Check-in confirmado
          </span>
        )}
      </div>

      {showActiveCard && (
        <div className="fx-card tournament-match-panel tournament-active-card">
          <h3 className="section-header">Partida en curso</h3>
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
        <div className="fx-card tournament-match-panel tournament-ready-card">
          <h3 className="section-header">Tu partida</h3>
          <p>
            Ronda {myMatch.round_number} — cruce #{myMatch.match_number}
            {opponent?.username && (
              <>
                {' '}
                vs <strong>{opponent.username}</strong>
              </>
            )}
          </p>
          {myMatch.ready_deadline && (
            <p className="tournament-ready-deadline">
              <Clock size={14} aria-hidden /> Límite: {formatDate(myMatch.ready_deadline)}
            </p>
          )}
          <p className="tournament-ready-hint">
            Si el rival no aparece antes del tiempo límite, podés ganar por ausencia.
          </p>
          <ul className="tournament-ready-list">
            <li>
              Vos:{' '}
              {myReady ? (
                <span className="tournament-ready-ok">
                  <Check size={14} aria-hidden /> listo
                </span>
              ) : (
                <span className="tournament-ready-no">
                  <X size={14} aria-hidden /> no listo
                </span>
              )}
            </li>
            <li>
              Rival:{' '}
              {oppReady ? (
                <span className="tournament-ready-ok">
                  <Check size={14} aria-hidden /> listo
                </span>
              ) : (
                <span className="tournament-ready-no">
                  <X size={14} aria-hidden /> no listo
                </span>
              )}
            </li>
          </ul>
          {myReady && oppReady && <p className="tournament-ready-hint">Iniciando partida…</p>}
          {!myReady && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleReady}>
              Estoy listo
            </button>
          )}
          {myReady && myMatch.status !== 'active' && (
            <button type="button" className="btn btn-outline-gold" disabled={busy} onClick={handleUnready}>
              Cancelar listo
            </button>
          )}
        </div>
      )}

      <nav className="tournament-section-tabs tournament-tabs-scroll">
        <button type="button" className={section === 'info' ? 'active' : ''} onClick={() => setTab('info')}>
          <Info size={16} aria-hidden /> Información
        </button>
        <button type="button" className={section === 'titulares' ? 'active' : ''} onClick={() => setTab('titulares')}>
          <Users size={16} aria-hidden /> Titulares ({titulars.length})
        </button>
        <button type="button" className={section === 'suplentes' ? 'active' : ''} onClick={() => setTab('suplentes')}>
          <Users size={16} aria-hidden /> Suplentes ({subs.length})
        </button>
        <button type="button" className={section === 'positions' ? 'active' : ''} onClick={() => setTab('positions')}>
          <Award size={16} aria-hidden /> Posiciones
        </button>
        <Link className={`tournament-tab-link ${section === 'cuadro' ? 'active' : ''}`} to={`/torneos/${tid}/bracket`} onClick={() => setSection('cuadro')}>
          <LayoutGrid size={16} aria-hidden /> Cuadro
        </Link>
      </nav>

      {section === 'info' && (
        <div className="fx-card tournament-info-panel">
          {tournament.description && <p className="tournament-desc">{tournament.description}</p>}
          {tournament.prize_text &&
            !(tournament.prize_config && Object.keys(safeParseJson(tournament.prize_config).positions || {}).length) && (
              <p className="tournament-prize-big">{tournament.prize_text}</p>
            )}

          <p className="section-header">Premios</p>
          <ul className="tournament-prize-list">
            {(() => {
              const pc = safeParseJson(tournament.prize_config);
              const positions = pc.positions || {};
              const paid = Math.min(
                4,
                Math.max(
                  1,
                  Number(pc.paid_positions) || Object.keys(positions).length || 1
                )
              );
              return Array.from({ length: paid }, (_, i) => {
                const n = i + 1;
                const lab = positions[String(n)]?.label;
                const fallback =
                  n === 1 && !positions['1']?.label && tournament.prize_text ? tournament.prize_text : null;
                return (
                  <li key={n}>
                    {n}° puesto: {lab || fallback || '—'}
                  </li>
                );
              });
            })()}
          </ul>
          <p className="tournament-desc">
            {safeParseJson(tournament.placement_config).third_place_match
              ? 'Habrá partido por el 3° puesto.'
              : 'Sin partido por el 3° puesto.'}
          </p>

          <p className="section-header">Reglas rápidas</p>
          <div className="tournament-rule-grid">
            <div className="tournament-rule-item">
              <strong>Formato</strong>
              {is128 ? 'Eliminación directa' : (tournament.format || '—')}
            </div>
            <div className="tournament-rule-item">
              <strong>Jugadores</strong>
              {maxP || '—'}
            </div>
            {is128 && (
              <div className="tournament-rule-item">
                <strong>Rondas máx.</strong>7 (campeón)
              </div>
            )}
            <div className="tournament-rule-item">
              <strong>Puntos</strong>
              {tournament.puntos_maximos ?? 15}
            </div>
            <div className="tournament-rule-item">
              <strong>Turno</strong>
              {tournament.turn_seconds ?? 30}s
            </div>
            <div className="tournament-rule-item">
              <strong>Presentación</strong>
              {tournament.ready_timeout_minutes ?? 5} min
            </div>
            <div className="tournament-rule-item">
              <strong>Reconexión</strong>
              {tournament.reconnect_seconds ?? 60}s
            </div>
            <div className="tournament-rule-item">
              <strong>Flor</strong>
              {tournament.flor_habilitada ? 'Sí' : 'No'}
            </div>
          </div>

          {is128 && (
            <ul className="tournament-launch-hints">
              <li>Cupo principal: 128 jugadores</li>
              <li>Si el cupo está completo, quedarás como suplente</li>
              <li>Los suplentes entran por orden si un titular no hace check-in</li>
              <li>Check-in obligatorio</li>
              <li>{freeLabel ? 'Inscripción gratuita' : `Inscripción: ${entryFee} créditos`}</li>
              <li>El campeón jugará hasta 7 partidas</li>
            </ul>
          )}

          <p className="tournament-desc">
            {freeLabel ? 'Inscripción gratuita' : `Inscripción: ${entryFee} créditos`}
          </p>
          {Number(tournament.auto_checkin_enabled ?? 1) === 1 && (
            <p className="tournament-desc">
              Check-in abre: {formatDate(tournament.checkin_starts_at)} — cierre:{' '}
              {formatDate(tournament.registration_closes_at)}
            </p>
          )}
          {Number(tournament.auto_start_enabled ?? 1) === 1 && (
            <p className="tournament-desc">Inicio del torneo: {formatDate(tournament.starts_at)}</p>
          )}
          {tournament.checkin_closed_at && (
            <p className="tournament-desc">Check-in cerrado ({formatDate(tournament.checkin_closed_at)}).</p>
          )}
          <dl className="tournament-dl">
            <dt>Inicio previsto</dt>
            <dd>{formatDate(tournament.starts_at)}</dd>
            <dt>Inscriptos / suplentes</dt>
            <dd>
              {Number(tournament.titular_count ?? 0)} / {Number(tournament.substitute_count ?? 0)}
            </dd>
          </dl>
          {myStatus === 'substitute' && myReg?.position_number != null && (
            <p className="tournament-desc">
              Suplente #{myReg.position_number}: si un titular no hace check-in, podés ingresar por orden.
            </p>
          )}
        </div>
      )}

      {section === 'titulares' && (
        <div className="tournament-user-list tournament-user-list--et2">
          {titulars.length === 0 ? (
            <p className="tournaments-empty">Sin titulares todavía.</p>
          ) : (
            titulars.map((row) => (
              <div key={row.id} className="tournament-user-row--et2">
                <span className="tournament-user-pos">#{row.position_number ?? '—'}</span>
                <TrucoAvatar
                  avatar={row.avatar}
                  username={row.username}
                  size={36}
                  className="tournament-user-avatar"
                />
                <span className="tournament-user-name">{row.username}</span>
                <div className="tournament-user-badges">
                  <span className="fx-badge fx-badge--muted">{registrationStatusLabel(row.status)}</span>
                  {row.checked_in_at && (
                    <span className="fx-badge fx-badge--success">
                      <UserCheck size={12} aria-hidden /> check-in
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {section === 'suplentes' && (
        <div className="tournament-user-list tournament-user-list--et2">
          {subs.length === 0 ? (
            <p className="tournaments-empty">Sin suplentes.</p>
          ) : (
            subs.map((row) => (
              <div key={row.id} className="tournament-user-row--et2">
                <span className="tournament-user-pos">#{row.position_number ?? '—'}</span>
                <TrucoAvatar
                  avatar={row.avatar}
                  username={row.username}
                  size={36}
                  className="tournament-user-avatar"
                />
                <span className="tournament-user-name">{row.username}</span>
                <div className="tournament-user-badges">
                  <span className="fx-badge fx-badge--muted">{registrationStatusLabel(row.status)}</span>
                  {row.checked_in_at && (
                    <span className="fx-badge fx-badge--success">
                      <UserCheck size={12} aria-hidden /> check-in
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {section === 'positions' && (
        <div className="fx-card tournament-info-panel tournament-standings-panel">
          <h3 className="section-header">Posiciones</h3>
          {standings?.tournament && ['open', 'checkin', 'started'].includes(standings.tournament.status) && (
            <p className="tournament-standings-hint">
              Las posiciones finales se completarán a medida que avance el torneo.
            </p>
          )}
          {standingsLoading && <p className="tournaments-empty">Cargando posiciones…</p>}
          {!standingsLoading && standings && (
            <>
              <div className="tournament-standings-summary">
                {standings.champion && (
                  <div className="fx-card tournament-pos-card tournament-pos-card--champ">
                    <span className="fx-badge fx-badge--gold">Campeón</span>
                    <div className="tournament-pos-player">
                      <TrucoAvatar avatar={standings.champion.avatar} username={standings.champion.username} size={40} />
                      <strong>{standings.champion.username}</strong>
                    </div>
                  </div>
                )}
                {standings.runner_up && (
                  <div className="fx-card tournament-pos-card tournament-pos-card--runner">
                    <span className="fx-badge fx-badge--muted">Subcampeón</span>
                    <div className="tournament-pos-player">
                      <TrucoAvatar avatar={standings.runner_up.avatar} username={standings.runner_up.username} size={40} />
                      <strong>{standings.runner_up.username}</strong>
                    </div>
                  </div>
                )}
                {standings.semifinalists?.length > 0 && (
                  <div className="fx-card tournament-pos-card">
                    <span className="fx-badge fx-badge--muted">3° / 4°</span>
                    <ul className="tournament-pos-inline-list">
                      {standings.semifinalists.map((p) => (
                        <li key={p.id} className="tournament-pos-player">
                          <TrucoAvatar avatar={p.avatar} username={p.username} size={36} />
                          {p.username}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {standings.qualified?.length > 0 && (
                <section className="tournament-pos-block">
                  <h4>Clasificados</h4>
                  <ul className="tournament-pos-inline-list">
                    {standings.qualified.map((p) => (
                      <li key={p.id} className="tournament-pos-player">
                        <TrucoAvatar avatar={p.avatar} username={p.username} size={32} />
                        {p.username}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {Object.keys(standings.eliminatedByRound || {}).length > 0 && (
                <section className="tournament-pos-block">
                  <h4>Eliminados por ronda</h4>
                  {Object.entries(standings.eliminatedByRound)
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([round, players]) => (
                      <div key={round} className="tournament-pos-sub">
                        <strong>Ronda {round}</strong>
                        <ul className="tournament-pos-inline-list">
                          {players.map((p) => (
                            <li key={p.id} className="tournament-pos-player">
                              <TrucoAvatar avatar={p.avatar} username={p.username} size={32} />
                              {p.username}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </section>
              )}

              {standings.no_show?.length > 0 && (
                <section className="tournament-pos-block">
                  <h4>No show</h4>
                  <ul className="tournament-pos-inline-list">
                    {standings.no_show.map((p) => (
                      <li key={p.id} className="tournament-pos-player">
                        <TrucoAvatar avatar={p.avatar} username={p.username} size={32} />
                        {p.username}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {standings.disqualified?.length > 0 && (
                <section className="tournament-pos-block">
                  <h4>Descalificados</h4>
                  <ul className="tournament-pos-inline-list">
                    {standings.disqualified.map((p) => (
                      <li key={p.id} className="tournament-pos-player">
                        <TrucoAvatar avatar={p.avatar} username={p.username} size={32} />
                        {p.username}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {standings.standingsList?.length > 0 && (
                <div className="admin-table-wrap tournament-standings-table-wrap">
                  <table className="admin-table admin-table--compact tournament-standings-table">
                    <thead>
                      <tr>
                        <th>Posición</th>
                        <th>Jugador</th>
                        <th>Estado</th>
                        <th>Ronda elim.</th>
                        <th>Partidas</th>
                        <th>W/L torneo</th>
                        <th>Resultado</th>
                        <th>Premio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.standingsList.map((row) => (
                        <tr key={row.user_id ?? row.id}>
                          <td className="admin-table-muted tournament-standings-pos">
                            {row.position_label ?? '—'}
                          </td>
                          <td>
                            <div className="tournament-pos-player">
                              <TrucoAvatar avatar={row.avatar} username={row.username} size={32} />
                              <span className="admin-table-strong">{row.username}</span>
                            </div>
                          </td>
                          <td>
                            <span className="fx-badge fx-badge--muted">{row.status_label ?? row.status}</span>
                          </td>
                          <td className="admin-table-muted">{row.eliminated_round ?? '—'}</td>
                          <td className="admin-table-muted">{row.matches_played ?? 0}</td>
                          <td className="admin-table-muted">
                            {(row.wins ?? 0)} / {(row.losses ?? 0)}
                          </td>
                          <td>{row.result_label ?? row.label}</td>
                          <td className="admin-table-muted tournament-standings-prize">{row.prize_label ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!standings.champion &&
                !standings.runner_up &&
                !(standings.standingsList?.length > 0) &&
                !(standings.semifinalists?.length > 0) &&
                !(standings.qualified?.length > 0) &&
                Object.keys(standings.eliminatedByRound || {}).length === 0 &&
                !(standings.no_show?.length > 0) &&
                !(standings.disqualified?.length > 0) && (
                  <p className="tournament-desc">Las posiciones aparecerán cuando avance el torneo.</p>
                )}
            </>
          )}
          {!standingsLoading && !standings && (
            <p className="tournaments-empty">No se pudieron cargar las posiciones.</p>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

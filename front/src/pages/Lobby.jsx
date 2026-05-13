import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Swords, BookOpen, Trophy, BarChart2 } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { rankingApi, socialApi, tournamentApi } from '../services/api';
import { getSocket } from '../services/socket';
import ChatCenter from '../components/chat/ChatCenter';
import AppHeader from '../components/layout/AppHeader';
import wordmarkDarkUrl from '../assets/panoramicooscuro.png';

const PREVIEW_CARDS = [
  { value: 1, file: 'swords', suit: 'espada' },
  { value: 3, file: 'coins', suit: 'oro' },
  { value: 7, file: 'swords', suit: 'espada' },
];

const ANNOUNCE_STATUSES = new Set(['open', 'checkin', 'started']);

function statusRank(st) {
  if (st === 'open') return 0;
  if (st === 'checkin') return 1;
  if (st === 'started') return 2;
  return 99;
}

function pickFeaturedTournament(list) {
  const cand = (list || []).filter((t) => ANNOUNCE_STATUSES.has(t.status));
  if (!cand.length) return null;
  cand.sort((a, b) => {
    const d = statusRank(a.status) - statusRank(b.status);
    if (d !== 0) return d;
    return new Date(a.starts_at || 0).getTime() - new Date(b.starts_at || 0).getTime();
  });
  return cand[0];
}

function tournamentAnnounceLabel(status) {
  if (status === 'open') return 'Inscripción abierta';
  if (status === 'checkin') return 'Check-in abierto';
  if (status === 'started') return 'Torneo en curso';
  return status || '';
}

export default function Lobby() {
  const {
    inQueue,
    joinQueue,
    leaveQueue,
    gameState,
    gameOver,
    roomId,
    attachListeners,
    reconnectGame,
  } = useGame();
  const navigate = useNavigate();

  const [myRank, setMyRank] = useState(null);
  const [activeRoom, setActiveRoom] = useState(null);
  const [gameOptions, setGameOptions] = useState({
    puntosMaximos: 30,
    florHabilitada: false,
    modo: 'casual',
  });

  const [unreadCounts, setUnreadCounts] = useState({});
  const [tournaments, setTournaments] = useState([]);
  const [pendingOpenFriend, setPendingOpenFriend] = useState(null);

  const featuredTournament = useMemo(() => pickFeaturedTournament(tournaments), [tournaments]);

  useEffect(() => {
    attachListeners();
  }, [attachListeners]);
  useEffect(() => {
    setActiveRoom(localStorage.getItem('truco_active_room'));
  }, []);

  useEffect(() => {
    rankingApi.getMe().then((r) => setMyRank(r.data)).catch(() => {});
    socialApi
      .getUnreadSummary()
      .then((res) => {
        if (res.data?.unreadByUser) setUnreadCounts(res.data.unreadByUser);
      })
      .catch(() => {});
    tournamentApi
      .getAll()
      .then((res) => setTournaments(res.data?.tournaments || []))
      .catch(() => setTournaments([]));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleMsg = () => {
      socialApi
        .getUnreadSummary()
        .then((res) => {
          if (res.data?.unreadByUser) setUnreadCounts(res.data.unreadByUser);
        })
        .catch(() => {});
    };
    socket.on('private:message:received', handleMsg);
    return () => socket.off('private:message:received', handleMsg);
  }, []);

  useEffect(() => {
    if ((gameState || roomId) && !gameOver) navigate('/game');
  }, [gameState, roomId, gameOver, navigate]);

  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  const clearFriendUnread = useCallback((friendId) => {
    setUnreadCounts((prev) => {
      if (!prev[friendId]) return prev;
      const next = { ...prev };
      delete next[friendId];
      return next;
    });
  }, []);

  const handleJoin = () => joinQueue(gameOptions);

  const ft = featuredTournament;
  const entryFee = ft ? Number(ft.entry_fee ?? 0) : 0;
  const isPaid = ft ? Number(ft.is_paid ?? 0) === 1 : false;
  const freeReg = ft && entryFee <= 0 && !isPaid;
  const tit = ft ? Number(ft.titular_count ?? ft.titularCount ?? 0) : 0;
  const maxP = ft ? Number(ft.max_players ?? ft.maxPlayers ?? 0) : 0;

  return (
    <div className="lobby-page">
      <AppHeader
        privateChatUnread={totalUnread}
        unreadCounts={unreadCounts}
        onStartChat={(f) => setPendingOpenFriend(f)}
        onChallengeFriend={(f) => setPendingOpenFriend({ ...f, openChallengeModal: true })}
      />

      <div className="page-shell lobby-shell">
        <div className="lobby-grid">
          <section className="fx-card lobby-play-panel">
            <AnimatePresence mode="wait">
              {!inQueue ? (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  className="lobby-animate-block ready-state"
                >
                  <div className="cards-preview">
                    {PREVIEW_CARDS.map((c) => (
                      <div key={c.value + c.suit} className="card-preview">
                        <img
                          src={`/cartas/card_${c.file}_${String(c.value).padStart(2, '0')}.svg`}
                          alt={`${c.value} de ${c.suit}`}
                          className="card-preview-img"
                          draggable={false}
                        />
                      </div>
                    ))}
                  </div>
                  <h2 className="lobby-heading">Listo para jugar</h2>
                  <p className="lobby-sub">Buscamos rival automáticamente según tu configuración</p>
                  <div className="game-options">
                    <label className="option-row">
                      <span className="option-label">Puntos para ganar</span>
                      <select
                        value={gameOptions.puntosMaximos}
                        onChange={(e) =>
                          setGameOptions((o) => ({ ...o, puntosMaximos: Number(e.target.value) }))
                        }
                      >
                        <option value={15}>15 puntos</option>
                        <option value={30}>30 puntos</option>
                      </select>
                    </label>
                    <label className="option-row">
                      <span className="option-label">Modo</span>
                      <select
                        value={gameOptions.modo}
                        onChange={(e) => setGameOptions((o) => ({ ...o, modo: e.target.value }))}
                      >
                        <option value="casual">Casual</option>
                        <option value="ranked">Ranking</option>
                      </select>
                    </label>
                    <label className="option-row">
                      <span className="option-label">Flor habilitada</span>
                      <input
                        type="checkbox"
                        checked={gameOptions.florHabilitada}
                        onChange={(e) =>
                          setGameOptions((o) => ({ ...o, florHabilitada: e.target.checked }))
                        }
                      />
                    </label>
                  </div>
                  {activeRoom && !inQueue && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-lg btn-block"
                      onClick={() => {
                        reconnectGame(activeRoom);
                        navigate('/game');
                      }}
                    >
                      Volver a partida en curso
                    </button>
                  )}
                  <button type="button" className="btn btn-primary btn-lg btn-block" onClick={handleJoin}>
                    Buscar partida
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="queue"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="lobby-animate-block queue-state"
                >
                  <div className="spinner" />
                  <h2 className="lobby-heading">Buscando oponente…</h2>
                  <p className="lobby-sub">Te emparejamos en cuanto haya un rival disponible</p>
                  <button type="button" className="btn btn-danger" onClick={leaveQueue}>
                    Cancelar búsqueda
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <aside className="lobby-aside">
            {ft && (
              <section className="fx-card lobby-tournament-highlight">
                <p className="section-header">Torneo</p>
                <div className="lobby-promo-panorama" aria-hidden>
                  <img src={wordmarkDarkUrl} alt="" className="page-hero-panorama-img" />
                </div>
                <h3 className="lobby-apertura-title">{ft.name}</h3>
                <p className="lobby-tournament-status-line fx-badge fx-badge--gold">
                  {tournamentAnnounceLabel(ft.status)}
                </p>
                <ul className="lobby-apertura-list">
                  {ft.prize_text && <li>{ft.prize_text}</li>}
                  {maxP > 0 && (
                    <li>
                      Cupo: {tit}
                      {maxP ? ` / ${maxP}` : ''} jugadores
                    </li>
                  )}
                  <li>{freeReg ? 'Inscripción gratuita' : `Inscripción: ${entryFee.toLocaleString('es-AR')} créditos`}</li>
                  {Number(ft.auto_checkin_enabled ?? 1) === 1 && <li>Check-in obligatorio</li>}
                </ul>
                <Link to={`/torneos/${ft.id}`} className="btn btn-primary btn-block">
                  Ver torneo
                </Link>
                <Link to="/torneos" className="btn btn-ghost btn-sm btn-block lobby-tournament-all">
                  Ver todos los torneos
                </Link>
              </section>
            )}

            {myRank && (
              <section className="fx-card lobby-stats-cards">
                <p className="section-header">Estadísticas</p>
                <div className="lobby-stats-grid">
                  <div className="lobby-stat-mini">
                    <span className="lobby-stat-val">{myRank.wins ?? 0}</span>
                    <span className="lobby-stat-lbl">Victorias</span>
                  </div>
                  <div className="lobby-stat-mini">
                    <span className="lobby-stat-val">{myRank.losses ?? 0}</span>
                    <span className="lobby-stat-lbl">Derrotas</span>
                  </div>
                  <div className="lobby-stat-mini">
                    <span className="lobby-stat-val">{myRank.elo ?? 1000}</span>
                    <span className="lobby-stat-lbl">ELO</span>
                  </div>
                </div>
              </section>
            )}

            <section className="fx-card lobby-quick-actions">
              <p className="section-header">Accesos rápidos</p>
              <div className="lobby-quick-grid">
                <button type="button" className="lobby-quick-btn" onClick={() => navigate('/ranking')}>
                  <BarChart2 size={16} aria-hidden />
                  Ranking
                </button>
                <button type="button" className="lobby-quick-btn" onClick={() => navigate('/torneos')}>
                  <Trophy size={16} aria-hidden />
                  Torneos
                </button>
                <button type="button" className="lobby-quick-btn" onClick={() => navigate('/batallas')}>
                  <Swords size={16} aria-hidden />
                  Batallas
                </button>
                <button type="button" className="lobby-quick-btn" onClick={() => navigate('/profile')}>
                  <User size={16} aria-hidden />
                  Perfil
                </button>
                <button type="button" className="lobby-quick-btn" onClick={() => navigate('/reglas')}>
                  <BookOpen size={16} aria-hidden />
                  Reglas
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <ChatCenter
        unreadCounts={unreadCounts}
        onClearUnread={clearFriendUnread}
        openPrivateFriend={pendingOpenFriend}
        onConsumedOpenPrivate={() => setPendingOpenFriend(null)}
      />
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Users, Wallet, Swords, BookOpen, Trophy,
  LogOut, Star, Award,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import { rankingApi, socialApi } from '../services/api';
import { getSocket } from '../services/socket';
import WalletPanel from '../components/wallet/WalletPanel';
import FriendsList from '../components/social/FriendsList';
import ChatCenter from '../components/chat/ChatCenter';
import NotificationBell from '../components/social/NotificationBell';

const PREVIEW_CARDS = [
  { value: 1,  file: 'swords', suit: 'espada' },
  { value: 3,  file: 'coins',  suit: 'oro'    },
  { value: 7,  file: 'swords', suit: 'espada' },
];

export default function Lobby() {
  const { user, logout } = useAuth();
  const {
    inQueue, joinQueue, leaveQueue,
    gameState, gameOver, roomId,
    attachListeners, reconnectGame,
  } = useGame();
  const navigate = useNavigate();

  const [myRank,      setMyRank]      = useState(null);
  const [activeRoom,  setActiveRoom]  = useState(null);
  const [gameOptions, setGameOptions] = useState({
    puntosMaximos: 30,
    florHabilitada: false,
    modo: 'casual',
  });

  const [showWallet,      setShowWallet]      = useState(false);
  const [showFriends,     setShowFriends]     = useState(false);
  const [unreadCounts,    setUnreadCounts]    = useState({});

  useEffect(() => { attachListeners(); }, [attachListeners]);
  useEffect(() => { setActiveRoom(localStorage.getItem('truco_active_room')); }, []);

  useEffect(() => {
    rankingApi.getMe().then(r => setMyRank(r.data)).catch(() => {});
    socialApi.getUnreadSummary()
      .then(res => { if (res.data?.unreadByUser) setUnreadCounts(res.data.unreadByUser); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleMsg = (msg) => {
      const fromId = msg.from?.id ?? msg.senderId;
      if (!fromId) return;
      setUnreadCounts(prev => ({ ...prev, [fromId]: (prev[fromId] || 0) + 1 }));
    };
    socket.on('private:message:received', handleMsg);
    return () => socket.off('private:message:received', handleMsg);
  }, []);

  useEffect(() => {
    if ((gameState || roomId) && !gameOver) navigate('/game');
  }, [gameState, roomId, gameOver, navigate]);

  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  const clearFriendUnread = useCallback((friendId) => {
    setUnreadCounts(prev => {
      if (!prev[friendId]) return prev;
      const next = { ...prev };
      delete next[friendId];
      return next;
    });
  }, []);

  const handleJoin = () => joinQueue(gameOptions);

  return (
    <div className="lobby-page">
      <nav className="lobby-nav">
        <span className="lobby-logo">TrucoFX</span>
        <div className="lobby-nav-actions">
          <div className="nav-user-chip">
            <span className="nav-username">{user?.username}</span>
            {myRank && <span className="nav-elo">ELO {myRank.elo}</span>}
          </div>
          <button className="icon-btn" title="Mi perfil" onClick={() => navigate('/profile')}>
            <User size={18} />
          </button>
          <button className="icon-btn" title="Amigos" onClick={() => setShowFriends(true)}>
            <Users size={18} />
            {totalUnread > 0 && <span className="badge-dot">{totalUnread > 9 ? '9+' : totalUnread}</span>}
          </button>
          <button className="icon-btn" title="Creditos" onClick={() => setShowWallet(true)}>
            <Wallet size={18} />
          </button>
          <button className="icon-btn" title="Batallas competitivas" onClick={() => navigate('/batallas')}>
            <Swords size={18} />
          </button>
          <button className="icon-btn" title="Torneos" onClick={() => navigate('/torneos')}>
            <Trophy size={18} />
          </button>
          <NotificationBell />
          <button className="btn btn-ghost btn-sm" onClick={logout} title="Cerrar sesion">
            <LogOut size={15} style={{ marginRight: 4 }} />
            Salir
          </button>
        </div>
      </nav>

      <div className="lobby-layout">
        <div className="lobby-center">
          <div className="lobby-play-card">
            <AnimatePresence mode="wait">
              {!inQueue ? (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  className="ready-state"
                  style={{ width: '100%' }}
                >
                  <div className="cards-preview">
                    {PREVIEW_CARDS.map(c => (
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
                  <h2 className="lobby-heading">Listo para jugar?</h2>
                  <p className="lobby-sub">Encontramos un oponente automaticamente</p>
                  <div className="game-options">
                    <label className="option-row">
                      <span className="option-label">Puntos para ganar</span>
                      <select
                        value={gameOptions.puntosMaximos}
                        onChange={e => setGameOptions(o => ({ ...o, puntosMaximos: Number(e.target.value) }))}
                      >
                        <option value={15}>15 puntos</option>
                        <option value={30}>30 puntos (estandar)</option>
                      </select>
                    </label>
                    <label className="option-row">
                      <span className="option-label">Modo de juego</span>
                      <select
                        value={gameOptions.modo}
                        onChange={e => setGameOptions(o => ({ ...o, modo: e.target.value }))}
                      >
                        <option value="casual">Casual</option>
                        <option value="ranked">Rankeo</option>
                      </select>
                    </label>
                    <label className="option-row">
                      <span className="option-label">Flor habilitada</span>
                      <input
                        type="checkbox"
                        checked={gameOptions.florHabilitada}
                        onChange={e => setGameOptions(o => ({ ...o, florHabilitada: e.target.checked }))}
                      />
                    </label>
                  </div>
                  {activeRoom && !inQueue && (
                    <button
                      className="btn btn-outline-gold btn-lg"
                      style={{ width: '100%' }}
                      onClick={() => { reconnectGame(activeRoom); navigate('/game'); }}
                    >
                      Volver a partida en curso
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', fontSize: '1.05rem' }}
                    onClick={handleJoin}
                  >
                    Buscar Partida
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="queue"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="queue-state"
                  style={{ width: '100%' }}
                >
                  <div className="spinner" style={{ width: 48, height: 48 }} />
                  <h2 className="lobby-heading">Buscando oponente...</h2>
                  <p className="lobby-sub">Aguarda, te estamos emparejando</p>
                  <button className="btn btn-danger" onClick={leaveQueue}>Cancelar</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <aside className="lobby-sidebar">
          {myRank && (
            <div className="sidebar-card">
              <h3>Mis estadisticas</h3>
              <div className="sidebar-stats">
                <div className="sidebar-stat">
                  <span className="sidebar-stat-val">{myRank.wins ?? 0}</span>
                  <span className="sidebar-stat-label">Victorias</span>
                </div>
                <div className="sidebar-stat">
                  <span className="sidebar-stat-val">{myRank.losses ?? 0}</span>
                  <span className="sidebar-stat-label">Derrotas</span>
                </div>
                <div className="sidebar-stat">
                  <span className="sidebar-stat-val">{myRank.elo ?? 1000}</span>
                  <span className="sidebar-stat-label">ELO</span>
                </div>
              </div>
            </div>
          )}
          <div className="sidebar-card">
            <h3>Explorar</h3>
            <div className="sidebar-links">
              <button className="sidebar-link-btn" onClick={() => navigate('/ranking')}>
                <Trophy size={16} className="slink-icon" />
                Ranking Global
              </button>
              <button className="sidebar-link-btn" onClick={() => navigate('/batallas')}>
                <Swords size={16} className="slink-icon" />
                Batallas competitivas
              </button>
              <button className="sidebar-link-btn" onClick={() => setShowWallet(true)}>
                <Wallet size={16} className="slink-icon" />
                Mi billetera
              </button>
              <button className="sidebar-link-btn" onClick={() => navigate('/torneos')}>
                <Award size={16} className="slink-icon" />
                Torneos
              </button>
              <button className="sidebar-link-btn" onClick={() => navigate('/reglas')}>
                <BookOpen size={16} className="slink-icon" />
                Reglas del juego
              </button>
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {showWallet && <WalletPanel onClose={() => setShowWallet(false)} />}
        {showFriends && (
          <FriendsList
            onClose={() => setShowFriends(false)}
            onStartChat={() => setShowFriends(false)}
            unreadCounts={unreadCounts}
          />
        )}
      </AnimatePresence>

      <ChatCenter unreadCounts={unreadCounts} onClearUnread={clearFriendUnread} />
    </div>
  );
}

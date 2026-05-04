import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import { rankingApi } from '../services/api';
import WalletPanel from '../components/wallet/WalletPanel';
import FriendsList from '../components/social/FriendsList';
import PrivateChat from '../components/social/PrivateChat';
import ChallengesBrowser from '../components/challenges/ChallengesBrowser';
import NotificationBell from '../components/social/NotificationBell';

export default function Lobby() {
  const { user, logout } = useAuth();
  const [activeRoom, setActiveRoom] = useState(null);
 const { inQueue, joinQueue, leaveQueue, gameState, roomId, attachListeners,reconnectGame  } = useGame();
  const navigate = useNavigate();
  const [myRank, setMyRank] = useState(null);
  const [gameOptions, setGameOptions] = useState({ puntosMaximos: 30, florHabilitada: false, modo: 'casual' });

  // Panel visibility
  const [showWallet,     setShowWallet]     = useState(false);
  const [showFriends,    setShowFriends]    = useState(false);
  const [showChallenges, setShowChallenges] = useState(false);
  const [chatFriend,     setChatFriend]     = useState(null); // { id, username }

  useEffect(() => {
    attachListeners();
  }, [attachListeners]);
useEffect(() => {
  setActiveRoom(localStorage.getItem('truco_active_room'));
}, []);
  // Navigate to game when match found
useEffect(() => {
  if (gameState || roomId) {
    console.log('LOBBY navegando a /game', { roomId, gameState });
    navigate('/game');
  }
}, [gameState, roomId, navigate]);
  useEffect(() => {
    rankingApi.getMe().then(r => setMyRank(r.data)).catch(() => {});
  }, []);

  const handleJoin = () => joinQueue(gameOptions);

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <h1 className="logo">🃏 Truco Argentino</h1>
        <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="username">{user?.username}</span>
          {myRank && <span className="elo-badge">ELO {myRank.elo}</span>}

          {/* Social actions */}
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} title="Amigos"
            onClick={() => setShowFriends(true)}>👥</button>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} title="Billetera"
            onClick={() => setShowWallet(true)}>💰</button>
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} title="Partidas con apuestas"
            onClick={() => setShowChallenges(true)}>⚔️</button>
          <NotificationBell />

          <button className="btn btn-ghost" onClick={logout}>Salir</button>
        </div>
      </header>

      <main className="lobby-main">
        <div className="lobby-card">
          <AnimatePresence mode="wait">
            {!inQueue ? (
              <motion.div
                key="ready"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="ready-state"
              >
               <div className="cards-preview">
  {[
    { value: 1, suit: 'espada', icon: '⚔️' },
    { value: 3, suit: 'oro', icon: '🪙' },
    { value: 7, suit: 'espada', icon: '⚔️' },
  ].map(card => (
    <div key={`${card.value}_${card.suit}`} className={`card-preview suit-${card.suit}`}>
      <span className="preview-value">{card.value}</span>
      <span className="preview-suit">{card.icon}</span>
    </div>
  ))}
</div>
                <h2>¿Listo para jugar?</h2>
                <p>Encontramos un oponente automáticamente</p>

                <div className="game-options">
                  <label className="option-row">
                    <span>Puntos para ganar</span>
                    <select
                      value={gameOptions.puntosMaximos}
                      onChange={e => setGameOptions(o => ({ ...o, puntosMaximos: Number(e.target.value) }))}
                    >
                      <option value={15}>15</option>
                      <option value={30}>30 (estándar)</option>
                    </select>
                  </label>
                  <label className="option-row">
                    <span>Flor habilitada</span>
                    <input
                      type="checkbox"
                      checked={gameOptions.florHabilitada}
                      onChange={e => setGameOptions(o => ({ ...o, florHabilitada: e.target.checked }))}
                    />
                  </label>
                  <label className="option-row">
                    <span>Modo</span>
                    <select
                      value={gameOptions.modo}
                      onChange={e => setGameOptions(o => ({ ...o, modo: e.target.value }))}
                    >
                      <option value="casual">Casual</option>
                      <option value="ranked">Rankeo</option>
                    </select>
                  </label>
                </div>
{activeRoom && !inQueue && (
  <button
    className="btn btn-primary-alt btn-large"
    onClick={() => {
      reconnectGame(activeRoom);
      navigate('/game');
    }}
  >
    Volver a partida en curso
  </button>
)}
                <button className="btn btn-primary btn-large" onClick={handleJoin}>
                  Buscar Partida
                </button>
                <div className="lobby-links">
                  <button className="btn btn-ghost" onClick={() => navigate('/ranking')}>
                    🏆 Ranking
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="queue"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="queue-state"
              >
                <div className="spinner" />
                <h2>Buscando oponente...</h2>
                <p>Aguardá, te estamos emparejando</p>
                <button className="btn btn-danger" onClick={leaveQueue}>
                  Cancelar
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {myRank && (
          <div className="my-stats">
            <div className="stat"><span className="stat-val">{myRank.wins}</span><span>Victorias</span></div>
            <div className="stat"><span className="stat-val">{myRank.losses}</span><span>Derrotas</span></div>
            <div className="stat"><span className="stat-val">{myRank.elo}</span><span>ELO</span></div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showWallet     && <WalletPanel onClose={() => setShowWallet(false)} />}
        {showFriends    && <FriendsList onClose={() => setShowFriends(false)} onStartChat={f => { setChatFriend(f); setShowFriends(false); }} />}
        {showChallenges && <ChallengesBrowser onClose={() => setShowChallenges(false)} />}
      </AnimatePresence>

      {/* Floating private chat */}
      <AnimatePresence>
        {chatFriend && <PrivateChat friend={chatFriend} onClose={() => setChatFriend(null)} />}
      </AnimatePresence>
    </div>
  );
}

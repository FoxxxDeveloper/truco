import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import { getSocket } from '../services/socket';
import BrandNavLockup from '../components/brand/BrandNavLockup';
import PlayerHand    from '../components/game/PlayerHand';
import OpponentHand  from '../components/game/OpponentHand';
import PlayArea      from '../components/game/PlayArea';
import ActionButtons from '../components/game/ActionButtons';
import ScoreBoard    from '../components/game/ScoreBoard';
import Chat          from '../components/game/Chat';
import GameOverModal from '../components/game/GameOverModal';
import ReconnectOverlay from '../components/game/ReconnectOverlay';
import TurnTimer     from '../components/game/TurnTimer';
import EnvidoResultModal from '../components/game/EnvidoResultModal';
import toast from 'react-hot-toast';
export default function Game() {

  const { user }   = useAuth();
  const navigate   = useNavigate();
  const {
   gameState, roomId, opponent, gameOver, chatMessages, lastEvent,
  reconnectGame, reconnectingGame, abandonGame,
    playCard, envido, envidoResp, truco, trucoResp, flor, florResp, irseAlMazo,
    sendMessage, sendReaction,
    turnTimer,
    opponentDisconnected,
  } = useGame();
 const autoReconnectTriedRef = useRef(false);
 const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
 const [envidoResult, setEnvidoResult] = useState(null);
 const [socketLive, setSocketLive] = useState(() => !!getSocket()?.connected);

 useEffect(() => {
   const s = getSocket();
   if (!s) {
     setSocketLive(false);
     return undefined;
   }
   const sync = () => setSocketLive(!!s.connected);
   s.on('connect', sync);
   s.on('disconnect', sync);
   sync();
   return () => {
     s.off('connect', sync);
     s.off('disconnect', sync);
   };
 }, []);

  // Redirect if no game
 useEffect(() => {
  if (gameState || gameOver) return;

  const activeRoom = localStorage.getItem('truco_active_room');

  if (activeRoom && !autoReconnectTriedRef.current) {
    autoReconnectTriedRef.current = true;
    reconnectGame(activeRoom);
    return;
  }

  if (!activeRoom) {
    const t = setTimeout(() => {
      navigate('/lobby');
    }, 1200);

    return () => clearTimeout(t);
  }
}, [gameState, gameOver, reconnectGame, navigate]);

  useEffect(() => {
  if (!reconnectingGame) return;

  const t = setTimeout(() => {
    if (!gameState) {
      toast.error('No se pudo reconectar automáticamente. Volvé desde el lobby.');
      navigate('/lobby');
    }
  }, 5000);

  return () => clearTimeout(t);
}, [reconnectingGame, gameState, navigate]);

  // Show "abandoned" result in gameOver modal
  useEffect(() => {
    if (lastEvent?.type === 'abandoned') {
      navigate('/lobby', { state: { message: lastEvent.winner === user.id ? '¡Ganaste! Tu rival abandonó.' : 'Perdiste por abandono.' } });
    }
  }, [lastEvent, navigate, user.id]);

  // Envido result → modal
  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'ENVIDO_RESULT') return;
    setEnvidoResult(lastEvent);
  }, [lastEvent]); // eslint-disable-line react-hooks/exhaustive-deps

if (!gameState) {
  return (
    <div className="loading-screen game-loading">
      <div className="spinner" />
      <p className="game-loading-text">
        {reconnectingGame ? 'Reconectando a tu partida...' : 'Cargando partida...'}
      </p>
    </div>
  );
}
  const myId       = user.id;
  const isMyTurn   = gameState.waitingForPlayer === myId;
  const myHand     = gameState.myHand || [];
  const oppCount   = gameState.opponentCardCount ?? 0;
  const inEndRound = gameState.state === 'END_ROUND';
  const puntosObjetivo = gameState.config?.puntosMaximos ?? 30;
  const modoLabel = gameState.config?.modo === 'ranked' ? 'Ranked' : 'Casual';

  return (
    <div className="game-page">
      {/* Opponent disconnection banner */}
      <AnimatePresence>
        {opponentDisconnected && (
          <ReconnectOverlay
            type="opponent"
            graceSecs={opponentDisconnected.gracePeriodSecs}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.header className="game-header" initial={{ y: -60 }} animate={{ y: 0 }}>
        <div className="game-header-brand">
          <BrandNavLockup size="sm" showSubtitle={false} className="brand-lockup--game" />
        </div>

        <ScoreBoard
          scores={gameState.scores}
          myId={myId}
          opponent={opponent}
          targetPoints={puntosObjetivo}
        />

        <div className="game-header-center">
          {turnTimer && (
            <div className="game-turn-timer-wrap">
              <TurnTimer
                playerId={turnTimer.playerId}
                seconds={turnTimer.seconds}
                myId={myId}
              />
            </div>
          )}

          <div
            className={`turn-indicator game-status-badge ${isMyTurn ? 'my-turn' : 'waiting'}`}
          >
            {isMyTurn ? 'Tu turno' : `Turno de ${opponent?.username ?? 'rival'}`}
          </div>
        </div>

        <div className="game-header-aside">
          <span
            className={`game-connection-badge ${socketLive ? 'is-live' : 'is-off'}`}
            title={socketLive ? 'Socket conectado' : 'Sin conexión'}
          >
            {socketLive ? 'En vivo' : 'Offline'}
          </span>
          <span className="game-room-meta" title={roomId != null ? String(roomId) : ''}>
            <span className="game-room-mode">{modoLabel}</span>
            {roomId != null && (
              <span className="game-room-id">· {String(roomId).slice(0, 8)}…</span>
            )}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm game-leave-btn"
            onClick={() => setShowAbandonConfirm(true)}
          >
            Salir
          </button>
        </div>
      </motion.header>

      {/* Abandon confirmation modal */}
      <AnimatePresence>
        {showAbandonConfirm && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAbandonConfirm(false)}
          >
            <motion.div
              className="modal fx-card game-modal game-abandon-modal"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="game-modal-icon game-modal-icon--warn" aria-hidden>!</div>
              <h2 className="game-modal-title">¿Abandonar partida?</h2>
              <p className="game-modal-lead">
                Si abandonás, tu rival gana automáticamente.
              </p>
              <p className="game-modal-warn">
                Perderás puntos ELO y cualquier apuesta activa.
              </p>
              <div className="game-modal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowAbandonConfirm(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setShowAbandonConfirm(false);
                    abandonGame();
                    navigate('/lobby');
                  }}
                >
                  Sí, abandonar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="game-shell">
      {/* Board */}
      <div className="game-board game-table game-felt">
        <OpponentHand cardCount={oppCount} />

        <PlayArea
          playedCards={gameState.playedCards}
          manoResults={gameState.manoResults}
          currentMano={gameState.currentMano}
          myId={myId}
        />

        <div className="bet-display">
          {gameState.trucoBetStack.length > 0 && (
            <span className="bet-tag truco">{gameState.trucoBetStack[gameState.trucoBetStack.length - 1]}</span>
          )}
          {gameState.envidoBetStack.length > 0 && (
            <span className="bet-tag envido">{gameState.envidoBetStack[gameState.envidoBetStack.length - 1].replace('_',' ')}</span>
          )}
        </div>

        <PlayerHand
          cards={myHand}
          onPlayCard={playCard}
          isMyTurn={isMyTurn}
          disabled={gameState.state !== 'PLAYER_TURN'}
        />

        {!inEndRound && !gameOver && (
          <ActionButtons
            gameState={gameState}
            myId={myId}
            onEnvido={envido}
            onEnvidoResponse={envidoResp}
            onTruco={truco}
            onTrucoResponse={trucoResp}
            onFlor={flor}
            onFlorResponse={florResp}
            onIrseAlMazo={irseAlMazo}
            isMyTurn={isMyTurn}
          />
        )}

        {inEndRound && !gameOver && (
          <motion.div className="next-round-wrap" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <p className="next-round-text">Preparando nueva ronda…</p>
          </motion.div>
        )}
      </div>
      </div>

      <Chat messages={chatMessages} onSend={sendMessage} onReaction={sendReaction} myId={myId} />
      <GameOverModal gameOver={gameOver} myId={myId} />

      <AnimatePresence>
        {envidoResult && (
          <EnvidoResultModal
            event={envidoResult}
            onClose={() => setEnvidoResult(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

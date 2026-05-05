import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
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
   gameState, opponent, gameOver, chatMessages, lastEvent,
  reconnectGame, reconnectingGame, abandonGame,
    playCard, envido, envidoResp, truco, trucoResp, flor, florResp, irseAlMazo,
    sendMessage, sendReaction,
    turnTimer,
    opponentDisconnected,
  } = useGame();
 const autoReconnectTriedRef = useRef(false);
 const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
 const [envidoResult, setEnvidoResult] = useState(null);

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
    <div className="loading-screen">
      <div className="spinner" />
      <p style={{ color: 'var(--text-soft)', marginTop: 12 }}>
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
        <ScoreBoard scores={gameState.scores} myId={myId} opponent={opponent} />

        {/* Turn timer bar */}
        {turnTimer && (
          <TurnTimer
            playerId={turnTimer.playerId}
            seconds={turnTimer.seconds}
            myId={myId}
          />
        )}

        <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
          {isMyTurn ? '⚡ Tu turno' : `⏳ Turno de ${opponent?.username}`}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowAbandonConfirm(true)}
        >
          ✕ Abandonar
        </button>
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
              className="modal"
              style={{ maxWidth: 380, textAlign: 'center' }}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>⚠️</div>
              <h2 style={{ color: 'var(--gold)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>¿Abandonar partida?</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
                Si abandonás, tu rival gana automáticamente.
              </p>
              <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: 24 }}>
                ⚠️ Perderás puntos ELO y cualquier apuesta activa.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowAbandonConfirm(false)}
                >
                  Cancelar
                </button>
                <button
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

      {/* Board */}
      <div className="game-board">
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
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Preparando nueva ronda…</p>
          </motion.div>
        )}
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

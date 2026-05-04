import { useEffect, useState } from 'react';
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

export default function Game() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const {
    gameState, opponent, gameOver, chatMessages, lastEvent,
    playCard, envido, envidoResp, truco, trucoResp, flor, florResp, irseAlMazo,
    sendMessage, sendReaction,
    turnTimer,          // { playerId, seconds } from 'game:turnTimer' event
    opponentDisconnected, // { playerId, gracePeriodSecs } | null
  } = useGame();

  // Redirect if no game
  useEffect(() => {
    if (!gameState && !gameOver) navigate('/lobby');
  }, [gameState, gameOver, navigate]);

  // Show "abandoned" result in gameOver modal
  useEffect(() => {
    if (lastEvent?.type === 'abandoned') {
      navigate('/lobby', { state: { message: lastEvent.winner === user.id ? '¡Ganaste! Tu rival abandonó.' : 'Perdiste por abandono.' } });
    }
  }, [lastEvent]);

  if (!gameState) return <div className="loading-screen"><div className="spinner" /></div>;

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
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/lobby')}>
          ✕ Abandonar
        </button>
      </motion.header>

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
    </div>
  );
}

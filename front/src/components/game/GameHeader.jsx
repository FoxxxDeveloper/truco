import { memo } from 'react';
import { motion } from 'framer-motion';
import BrandNavLockup from '../brand/BrandNavLockup';
import ScoreBoard from './ScoreBoard';
import TurnTimer from './TurnTimer';
import Chat from './Chat';
import GameOptionsMenu from './GameOptionsMenu';
import { useGameChat } from '../../context/GameContext';
import { useIsMobileLite } from '../../hooks/useIsMobileLite';

function GameHeaderInner({
  gameState,
  myId,
  opponent,
  turnTimer,
  isMyTurn,
  soundOn,
  onToggleSound,
  socketLive,
  onAbandon,
}) {
  const { chatMessages, sendMessage, sendReaction } = useGameChat();
  const mobileLite = useIsMobileLite();
  const puntosObjetivo = gameState.config?.puntosMaximos ?? 30;

  const HeaderTag = mobileLite ? 'header' : motion.header;
  const headerMotion = mobileLite
    ? { className: 'game-header game-header--compact' }
    : {
        className: 'game-header game-header--compact',
        initial: { y: -40 },
        animate: { y: 0 },
      };

  return (
    <HeaderTag {...headerMotion}>
      <div className="game-header-brand">
        <BrandNavLockup size="sm" showSubtitle={false} className="brand-lockup--game" />
      </div>

      <div className="game-header-score-col">
        <ScoreBoard
          scores={gameState.scores}
          myId={myId}
          opponent={opponent}
          targetPoints={puntosObjetivo}
        />
        <div className="game-header-turn-slot">
          {turnTimer ? (
            <div className="game-turn-timer-wrap game-turn-timer-wrap--inline">
              <TurnTimer
                playerId={turnTimer.playerId}
                seconds={turnTimer.seconds}
                myId={myId}
              />
            </div>
          ) : (
            <div
              className={`turn-indicator turn-indicator--compact ${isMyTurn ? 'my-turn' : 'waiting'}`}
            >
              {isMyTurn ? 'Tu turno' : `Turno · ${opponent?.username ?? 'rival'}`}
            </div>
          )}
        </div>
      </div>

      <div className="game-header-chat-slot">
        <Chat
          messages={chatMessages}
          onSend={sendMessage}
          onReaction={sendReaction}
          myId={myId}
          variant="header"
        />
      </div>

      <div className="game-header-actions">
        <GameOptionsMenu
          soundOn={soundOn}
          onToggleSound={onToggleSound}
          socketLive={socketLive}
          onAbandon={onAbandon}
        />
      </div>
    </HeaderTag>
  );
}

export default memo(GameHeaderInner);

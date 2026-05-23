import { memo, useEffect, useMemo } from 'react';
import { useRenderCount } from '../../hooks/useRenderCount';
import { isPerfEnabled, perfMark } from '../../utils/perf';
import { motion } from 'framer-motion';
import OpponentHand from './OpponentHand';
import PlayArea from './PlayArea';
import PlayerHand from './PlayerHand';
import ActionButtons from './ActionButtons';
import {
  visibleHandExcludingEnvidoProof,
  visibleOpponentCountExcludingEnvidoProof,
} from '../../utils/envidoVisibleHand';
import { useIsMobileLite } from '../../hooks/useIsMobileLite';

function GameBoardInner({
  gameState,
  myId,
  opponent,
  gameOver,
  isMyTurn,
  onPlayCard,
  onEnvido,
  onEnvidoResponse,
  onTruco,
  onTrucoResponse,
  onFlor,
  onFlorResponse,
  onIrseAlMazo,
}) {
  useRenderCount('GameBoard');
  const mobileLite = useIsMobileLite();

  useEffect(() => {
    if (!isPerfEnabled()) return undefined;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => perfMark('board_painted'));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [gameState]);

  const envidoProof = gameState.envidoProofReveal;

  const visibleMyHand = useMemo(
    () =>
      visibleHandExcludingEnvidoProof(gameState.myHand || [], envidoProof, myId),
    [gameState.myHand, envidoProof, myId],
  );

  const visibleOppCount = useMemo(() => {
    const oppCount = gameState.opponentCardCount ?? 0;
    return visibleOpponentCountExcludingEnvidoProof(oppCount, envidoProof, myId);
  }, [gameState.opponentCardCount, envidoProof, myId]);

  const showEnvidoProof = Boolean(gameState.envidoProofReveal?.cards?.length);
  const inEndRound = gameState.state === 'END_ROUND';

  return (
    <div className="game-board game-table game-felt">
      <OpponentHand cardCount={visibleOppCount} />

      <PlayArea
        playedCards={gameState.playedCards}
        manoResults={gameState.manoResults}
        currentMano={gameState.currentMano}
        myId={myId}
        envidoProofReveal={gameState.envidoProofReveal}
        showEnvidoProof={showEnvidoProof}
        opponent={opponent}
        mobileLite={mobileLite}
      />

      <PlayerHand
        cards={visibleMyHand}
        onPlayCard={onPlayCard}
        isMyTurn={isMyTurn}
        disabled={gameState.state !== 'PLAYER_TURN'}
      />

      {!inEndRound && !gameOver && (
        <ActionButtons
          gameState={gameState}
          myId={myId}
          onEnvido={onEnvido}
          onEnvidoResponse={onEnvidoResponse}
          onTruco={onTruco}
          onTrucoResponse={onTrucoResponse}
          onFlor={onFlor}
          onFlorResponse={onFlorResponse}
          onIrseAlMazo={onIrseAlMazo}
          isMyTurn={isMyTurn}
          mobileLite={mobileLite}
        />
      )}

      {inEndRound && !gameOver && !mobileLite && (
        <motion.div
          className="next-round-wrap"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="next-round-text">Preparando nueva ronda…</p>
        </motion.div>
      )}

      {inEndRound && !gameOver && mobileLite && (
        <div className="next-round-wrap">
          <p className="next-round-text">Preparando nueva ronda…</p>
        </div>
      )}
    </div>
  );
}

const GameBoard = memo(GameBoardInner);
export default GameBoard;

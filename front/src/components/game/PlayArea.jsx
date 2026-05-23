/**

 * Bazas sobre el paño — rival “arriba”, jugador local “abajo”.

 * Con proof de Envido activo: se ocultan bazas y solo se muestran cartas de puntos en mesa.

 */

import { memo } from 'react';
import { useRenderCount } from '../../hooks/useRenderCount';
import { motion } from 'framer-motion';

import Card from './Card';

import EnvidoProofOnTable from './EnvidoProofOnTable';



const BAZA_SR = ['Primera baza', 'Segunda baza', 'Tercera baza'];



/** @param {number|string|null|undefined} result */

function cardOutcomeClass(playerId, result, cardsCount) {

  if (cardsCount < 2) return 'outcome-pending';

  if (result === undefined) return 'outcome-pending';

  if (result === null) return 'outcome-tie';

  return Number(playerId) === Number(result) ? 'outcome-winner' : 'outcome-loser';

}



/** Mano en curso: orden de juego. Resuelta: siempre oponente primero (arriba en columna), vos segundo (abajo). */

function orderTrickCards(cards, myId, handComplete, isResolved) {

  if (!cards?.length) return cards;

  if (!handComplete || !isResolved) return cards;

  const opp = cards.filter((c) => Number(c.playerId) !== Number(myId));

  const mine = cards.filter((c) => Number(c.playerId) === Number(myId));

  return [...opp, ...mine];

}



function PlayArea({

  playedCards,

  manoResults,

  currentMano,

  myId,

  envidoProofReveal,

  opponent,

  showEnvidoProof = false,

  mobileLite = false,

}) {
  useRenderCount('PlayArea');

  const proof =

    showEnvidoProof && envidoProofReveal?.cards?.length ? envidoProofReveal : null;

  const hideTricks = Boolean(proof);



  return (

    <div className="play-area game-center-zone">

      <div

        className={`table-tricks-strip table-tricks-strip--blyts${hideTricks ? ' table-tricks-strip--hidden-for-proof' : ''}`}

        aria-hidden={hideTricks}

      >

        {[0, 1, 2].map((manoIdx) => {

          const cards = playedCards[manoIdx] || [];

          const result = manoResults[manoIdx];

          const isActive = manoIdx === currentMano;

          const handComplete = cards.length >= 2;

          const isResolved = handComplete && manoResults[manoIdx] !== undefined;

          const resolvedWithWinner = isResolved && result !== null;

          const resolvedTie = isResolved && result === null;



          const displayRows = orderTrickCards(cards, myId, handComplete, isResolved);



          const iWonHand = result != null && Number(result) === Number(myId);

          const iLostHand = result != null && Number(result) !== Number(myId);



          let srDetail = '';

          if (!handComplete) srDetail = 'En juego.';

          else if (result === null) srDetail = 'Parda.';

          else if (iWonHand) srDetail = 'Ganaste esta baza.';

          else if (iLostHand) srDetail = 'Ganó el rival esta baza.';



          const isEmpty = cards.length === 0;



          let stackPerspective = '';

          if (resolvedWithWinner) {

            stackPerspective = iWonHand ? 'trick-stack--winner-player' : 'trick-stack--winner-opponent';

          } else if (resolvedTie) {

            stackPerspective = 'trick-stack--tie';

          }



          const duelClass = [

            'trick-duel',

            'trick-stack',

            isEmpty && 'trick-duel--empty',

            !isResolved && cards.length > 0 && 'trick-duel--live',

            isResolved && 'trick-duel--resolved',

            (resolvedWithWinner || resolvedTie) && 'trick-duel--stack',

            stackPerspective,

          ]

            .filter(Boolean)

            .join(' ');



          return (

            <div

              key={manoIdx}

              className={`table-trick ${isActive ? 'table-trick--active' : ''} ${isResolved ? 'table-trick--resolved' : ''} ${isEmpty ? 'table-trick--empty' : ''}`}

              aria-label={`${BAZA_SR[manoIdx]}. ${srDetail}`}

            >

              <div className={duelClass}>

                {displayRows.map((row, i) => {

                  const { playerId, card } = row;

                  const oc = cardOutcomeClass(playerId, result, cards.length);

                  const isMine = Number(playerId) === Number(myId);

                  const sideClass = isMine ? 'trick-card--player' : 'trick-card--opponent';

                  const posClass =

                    handComplete && isResolved ? '' : i === 0 ? 'trick-card--lead' : 'trick-card--chase';



                  const wrapClass = `played-card-wrap ${oc} ${sideClass} ${posClass}`.trim();

                  if (mobileLite) {
                    return (
                      <div key={card.id} className={wrapClass}>
                        <div className="played-card-frame">
                          <Card card={card} played disabled />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <motion.div
                      key={card.id}
                      className={wrapClass}
                      initial={{ opacity: 0, y: 22 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: i * 0.055,
                        duration: 0.32,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <div className="played-card-frame">
                        <Card card={card} played disabled />
                      </div>
                    </motion.div>
                  );

                })}

              </div>

            </div>

          );

        })}

      </div>



      {proof && (

        <EnvidoProofOnTable proof={proof} myId={myId} opponent={opponent} />

      )}

    </div>

  );
}

export default memo(PlayArea);


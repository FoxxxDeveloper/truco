/**
 * Action buttons: Envido, Truco, Flor, Irse al Mazo, and response buttons.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ActionButtons({
  gameState,
  myId,
  onEnvido,
  onEnvidoResponse,
  onTruco,
  onTrucoResponse,
  onFlor,
  onFlorResponse,
  onIrseAlMazo,
  isMyTurn,
}) {
  const {
    state,
    envidoAvailable,
    envidoResolved,
    trucoPendingBy,
    envidoPendingBy,
    trucoBetStack = [],
    envidoBetStack = [],
    trucoResolved,
    config,
    florState,
  } = gameState;

  const [showTrucoResponse, setShowTrucoResponse] = useState(false);

  const florHabilitada = config?.florHabilitada || false;

  const isPendingTruco = state === 'TRUCO_PENDING';
  const isPendingEnvido = state === 'ENVIDO_PENDING';
  const isPendingFlor = state === 'FLOR_PENDING';

  const isMyTrucoTurn = isPendingTruco && Number(trucoPendingBy) !== Number(myId);
  const isMyEnvidoTurn = isPendingEnvido && Number(envidoPendingBy) !== Number(myId);
  const isMyFlorTurn = isPendingFlor && Number(florState?.pendingBy) !== Number(myId);

  useEffect(() => {
    setShowTrucoResponse(false);
  }, [state, trucoPendingBy]);

  /**
   * Envido normal:
   * Solo lo puede iniciar quien tiene el turno.
   */
  const canEnvidoOnMyTurn =
    !envidoResolved &&
    envidoAvailable &&
    state === 'PLAYER_TURN' &&
    isMyTurn;

  /**
   * Envido como respuesta previa al Truco:
   * Si el rival me canta Truco, antes de responder Quiero/No quiero/Retruco
   * puedo cantar Envido / Real Envido / Falta Envido.
   */
 const currentManoCards = gameState.playedCards?.[gameState.currentMano] || [];

const iAlreadyPlayedInCurrentMano = currentManoCards.some(
  (played) => Number(played.playerId) === Number(myId)
);

const canEnvidoAsTrucoResponse =
  !envidoResolved &&
  envidoAvailable &&
  isPendingTruco &&
  isMyTrucoTurn &&
  !iAlreadyPlayedInCurrentMano;

  const canEnvido =
    canEnvidoOnMyTurn ||
    canEnvidoAsTrucoResponse;

  const canTruco =
    !trucoResolved &&
    state === 'PLAYER_TURN' &&
    trucoBetStack.length === 0 &&
    isMyTurn;

  const canMazo =
    (state === 'PLAYER_TURN' && isMyTurn) ||
    (isPendingTruco && isMyTrucoTurn);

  const canFlor =
    florHabilitada &&
    !florState?.resolved &&
    state === 'PLAYER_TURN' &&
    isMyTurn &&
    florState?.p1HasFlor !== undefined;

  const nextTrucoBet =
    trucoBetStack.length === 0
      ? 'truco'
      : trucoBetStack.includes('retruco')
        ? 'vale4'
        : 'retruco';

  const nextEnvidoBet =
    envidoBetStack.length === 0
      ? 'envido'
      : envidoBetStack.includes('real_envido')
        ? 'falta_envido'
        : envidoBetStack[envidoBetStack.length - 1] === 'envido'
          ? 'real_envido'
          : null;

  const currentTrucoBet = trucoBetStack[trucoBetStack.length - 1] || 'truco';
  const currentEnvidoBet = envidoBetStack[envidoBetStack.length - 1] || 'envido';

  /**
   * Si me cantaron Truco y todavía puedo cantar Envido,
   * primero muestro:
   * Envido / Real Envido / Falta Envido / No quiero
   *
   * Ese "No quiero" significa: no quiero cantar envido ahora,
   * pasar a responder el Truco.
   */
  const shouldShowEnvidoBeforeTruco =
    canEnvidoAsTrucoResponse &&
    !showTrucoResponse;

  const shouldShowNormalActions =
    !isPendingTruco &&
    !isPendingEnvido &&
    !isPendingFlor;

  const shouldShowTrucoResponse =
    isPendingTruco &&
    (!canEnvidoAsTrucoResponse || showTrucoResponse);

  return (
    <div className="action-buttons">
      {/* Caso especial: me cantaron Truco y puedo cantar Envido antes de responder */}
      <AnimatePresence>
        {shouldShowEnvidoBeforeTruco && (
          <motion.div
            className="response-panel envido-before-truco"
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
          >
            <h3>Te cantaron {currentTrucoBet.toUpperCase()}</h3>

            <p className="waiting-msg">
              Podés cantar envido antes de responder el truco.
            </p>

            <div className="response-btns">
              <button
                className="btn btn-envido"
                onClick={() => onEnvido('envido')}
              >
                Envido
              </button>

              <button
                className="btn btn-envido"
                onClick={() => onEnvido('real_envido')}
              >
                Real Envido
              </button>

              <button
                className="btn btn-envido"
                onClick={() => onEnvido('falta_envido')}
              >
                Falta Envido
              </button>

              <button
                className="btn btn-mazo"
                onClick={() => setShowTrucoResponse(true)}
              >
                No quiero
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Acciones normales */}
      <AnimatePresence>
        {shouldShowNormalActions && (
          <motion.div
            className="action-group"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {canEnvido && (
              <div className="bet-group">
                <button
                  className="btn btn-envido"
                  onClick={() => onEnvido('envido')}
                >
                  Envido
                </button>

                <button
                  className="btn btn-envido"
                  onClick={() => onEnvido('real_envido')}
                >
                  Real Envido
                </button>

                <button
                  className="btn btn-envido"
                  onClick={() => onEnvido('falta_envido')}
                >
                  Falta Envido
                </button>
              </div>
            )}

            {canTruco && (
              <button
                className="btn btn-truco"
                onClick={() => onTruco('truco')}
              >
                ¡Truco!
              </button>
            )}

            {canFlor && (
              <button
                className="btn btn-flor"
                onClick={onFlor}
              >
                ¡Flor!
              </button>
            )}

            {canMazo && (
              <button
                className="btn btn-mazo"
                onClick={onIrseAlMazo}
              >
                Me voy al mazo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Respuesta al Truco */}
      <AnimatePresence>
        {shouldShowTrucoResponse && (
          <motion.div
            className="response-panel truco-response"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <h3>¡{currentTrucoBet.toUpperCase()}!</h3>

            {isMyTrucoTurn ? (
              <div className="response-btns">
                <button
                  className="btn btn-accept"
                  onClick={() => onTrucoResponse('accept')}
                >
                  Quiero
                </button>

                {nextTrucoBet !== null && trucoBetStack.length < 3 && (
                  <button
                    className="btn btn-raise"
                    onClick={() => onTruco(nextTrucoBet)}
                  >
                    {nextTrucoBet === 'retruco' ? 'Retruco' : 'Vale 4'}
                  </button>
                )}

                <button
                  className="btn btn-reject"
                  onClick={() => onTrucoResponse('reject')}
                >
                  No quiero
                </button>
              </div>
            ) : (
              <p className="waiting-msg">
                Esperando respuesta del oponente...
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Respuesta al Envido */}
      <AnimatePresence>
        {isPendingEnvido && (
          <motion.div
            className="response-panel envido-response"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <h3>¡{currentEnvidoBet.replace('_', ' ').toUpperCase()}!</h3>

            {isMyEnvidoTurn ? (
              <div className="response-btns">
                <button
                  className="btn btn-accept"
                  onClick={() => onEnvidoResponse('accept')}
                >
                  Quiero
                </button>

                {nextEnvidoBet && (
                  <button
                    className="btn btn-raise"
                    onClick={() => onEnvido(nextEnvidoBet)}
                  >
                    {nextEnvidoBet === 'real_envido'
                      ? 'Real Envido'
                      : 'Falta Envido'}
                  </button>
                )}

                <button
                  className="btn btn-reject"
                  onClick={() => onEnvidoResponse('reject')}
                >
                  No quiero
                </button>
              </div>
            ) : (
              <p className="waiting-msg">
                Esperando respuesta del oponente...
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Respuesta a Flor */}
      <AnimatePresence>
        {isPendingFlor && florHabilitada && (
          <motion.div
            className="response-panel flor-response"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <h3>
              ¡{(florState?.betStack?.slice(-1)[0] || 'FLOR')
                .replace('_', ' ')
                .toUpperCase()}!
            </h3>

            {isMyFlorTurn ? (
              <div className="response-btns">
                <button
                  className="btn btn-accept"
                  onClick={() => onFlorResponse('accept')}
                >
                  Con flor me gano
                </button>

                {florState?.betStack?.length < 3 && (
                  <button
                    className="btn btn-raise"
                    onClick={onFlor}
                  >
                    {florState?.betStack?.length === 1
                      ? 'Contraflor'
                      : 'Contraflor al resto'}
                  </button>
                )}

                <button
                  className="btn btn-reject"
                  onClick={() => onFlorResponse('reject')}
                >
                  No quiero
                </button>
              </div>
            ) : (
              <p className="waiting-msg">
                Esperando respuesta del oponente...
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
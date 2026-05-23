/**
 * Action buttons: Envido, Truco, Flor, Irse al Mazo, and response buttons.
 * Priority and permissions follow getPlayerView() flags from the backend.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useRenderCount } from '../../hooks/useRenderCount';

/**
 * Returns true if `newBet` is a valid envido raise given the current `stack`.
 * Mirrors the same logic in back/src/game/rules/envido.js.
 */
function canRaiseEnvido(stack, newBet) {
  if (stack.includes('falta_envido')) return false;
  if (newBet === 'falta_envido') return true;
  if (newBet === 'real_envido') {
    if (stack.includes('real_envido')) return false;
    return stack.every(b => b === 'envido');
  }
  if (newBet === 'envido') {
    if (stack.includes('real_envido')) return false;
    return stack.length <= 1 && stack.every(b => b === 'envido');
  }
  return false;
}

const ENVIDO_BET_LABELS = {
  envido: 'Envido',
  real_envido: 'Real Envido',
  falta_envido: 'Falta Envido',
};

const ENVIDO_BET_LABELS_SHORT = {
  envido: 'Envido',
  real_envido: 'Real',
  falta_envido: 'Falta',
};

/** Mirrors getNextTrucoBet (back/src/game/rules/truco.js) for offline fallbacks. */
function fallbackNextTrucoRaiseBet(trucoBetStack) {
  const ladder = ['truco', 'retruco', 'vale4'];
  if (!trucoBetStack?.length) return 'retruco';
  const last = trucoBetStack[trucoBetStack.length - 1];
  const idx = ladder.indexOf(last);
  if (idx === -1 || idx === ladder.length - 1) return null;
  return ladder[idx + 1];
}

/** Próximo canto al responder con subida directa (Truco→Retruco, Retruco→Vale 4). */
function pickTrucoResponseRaiseBet(gameState, trucoBetStack) {
  const serverBet =
    gameState.trucoResponseRaiseBet ?? gameState.nextTrucoBetForResponder;
  if (serverBet != null) return serverBet;
  if (gameState.canRaiseTruco === true) {
    return fallbackNextTrucoRaiseBet(trucoBetStack);
  }
  if (gameState.mustRespondTruco && gameState.canRaiseTruco !== false) {
    return fallbackNextTrucoRaiseBet(trucoBetStack);
  }
  return null;
}

function EnvidoOptionsList({ bets, onPick, layout = 'stack', compact = false }) {
  const listClass = layout === 'inline' ? 'envido-options-inline' : 'action-flyout-list';
  const labels = compact ? ENVIDO_BET_LABELS_SHORT : ENVIDO_BET_LABELS;
  return (
    <div className={listClass} role="menu">
      {bets.map(bet => (
        <button
          key={bet}
          type="button"
          role="menuitem"
          className="btn btn-flyout-item"
          onClick={() => onPick(bet)}
        >
          {labels[bet]}
        </button>
      ))}
    </div>
  );
}

/** Botón Envido + opciones (flyout arriba en desktop, fila inline en mobile). */
function EnvidoRaiseControl({
  bets,
  flyoutOpen,
  onToggle,
  onPick,
  mobileInline = false,
  optionsExternal = false,
  animatedFlyout = false,
  className = '',
}) {
  const multi = bets.length > 1;
  const showInlineMenu = multi && flyoutOpen && mobileInline && !optionsExternal;

  const flyout = multi && flyoutOpen && !mobileInline && !optionsExternal && (
    animatedFlyout ? (
      <AnimatePresence>
        <motion.div
          key="envido-flyout"
          className="action-flyout action-flyout--up"
          role="menu"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
        >
          <EnvidoOptionsList bets={bets} onPick={onPick} />
        </motion.div>
      </AnimatePresence>
    ) : (
      <div className="action-flyout action-flyout--up" role="menu">
        <EnvidoOptionsList bets={bets} onPick={onPick} />
      </div>
    )
  );

  return (
    <div
      className={`action-flyout-wrap${mobileInline ? ' action-flyout-wrap--mobile-inline' : ''}${mobileInline && flyoutOpen ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
    >
      {showInlineMenu && (
        <EnvidoOptionsList bets={bets} onPick={onPick} layout="inline" compact />
      )}
      <button
        type="button"
        className="btn btn-game-envido action-btn"
        aria-expanded={multi ? flyoutOpen : undefined}
        aria-haspopup={multi ? 'menu' : undefined}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          onToggle();
        }}
      >
        Envido
        {multi && (
          <ChevronDown
            className={`action-chevron ${flyoutOpen ? 'action-chevron--open' : ''}`}
            size={16}
            aria-hidden
          />
        )}
      </button>
      {flyout}
    </div>
  );
}

function ActionButtons({
  gameState,
  myId,
  onEnvido,
  onEnvidoResponse,
  onTruco,
  onTrucoResponse,
  onFlor,
  onFlorResponse,
  onIrseAlMazo,
  isMyTurn: _isMyTurn,
  mobileLite = false,
}) {
  useRenderCount('ActionButtons');
  const rootRef = useRef(null);
  const [envidoFlyoutOpen, setEnvidoFlyoutOpen] = useState(false);
  const [trucoFlyoutOpen, setTrucoFlyoutOpen] = useState(false);
  const [envidoBeforeFlyoutOpen, setEnvidoBeforeFlyoutOpen] = useState(false);

  const closeFlyouts = useCallback(() => {
    setEnvidoFlyoutOpen(false);
    setTrucoFlyoutOpen(false);
    setEnvidoBeforeFlyoutOpen(false);
  }, []);

  const {
    state,
    envidoBetStack = [],
    trucoBetStack = [],
    config,
    florState,
    trucoPendingBy,
    envidoPendingBy,
  } = gameState || {};

  const florHabilitada = config?.florHabilitada || false;

  const isPendingTruco = state === 'TRUCO_PENDING';
  const isPendingEnvido = state === 'ENVIDO_PENDING';
  const isPendingFlor = state === 'FLOR_PENDING';

  const mustRespondEnvido =
    gameState.mustRespondEnvido ??
    (isPendingEnvido && Number(envidoPendingBy) !== Number(myId));
  const waitingOpponentEnvido =
    gameState.waitingOpponentEnvido ??
    (isPendingEnvido && Number(envidoPendingBy) === Number(myId));

  const florStackLen = florState?.betStack?.length || 0;

  const mustRespondFlor =
    gameState.mustRespondFlor ??
    (isPendingFlor && florHabilitada && Number(florState?.pendingBy) !== Number(myId));
  const waitingOpponentFlor =
    gameState.waitingOpponentFlor ??
    (isPendingFlor && florHabilitada && Number(florState?.pendingBy) === Number(myId));

  const showFlorCompare =
    mustRespondFlor && gameState.canAcceptFlor !== false;
  const showFlorReject =
    mustRespondFlor &&
    (gameState.canRejectFlor === true ||
      (gameState.canRejectFlor === undefined && florStackLen > 1));
  const showFlorRaise =
    mustRespondFlor &&
    (gameState.canRaiseFlorResponse === true ||
      (gameState.canRaiseFlorResponse === undefined && florStackLen > 0 && florStackLen < 3));

  const mustRespondTruco =
    gameState.mustRespondTruco ?? (isPendingTruco && Number(trucoPendingBy) !== Number(myId));
  const waitingOpponentTruco =
    gameState.waitingOpponentTruco ?? (isPendingTruco && Number(trucoPendingBy) === Number(myId));

  const blockedTrucoLadder =
    gameState.trucoBlockedByOpeningFourDecisiveMano === true ||
    gameState.trucoBlockedByOpeningFourThirdMano === true;

  const trucoResponseRaiseBet = pickTrucoResponseRaiseBet(gameState, trucoBetStack);

  const canRaiseTrucoBtn =
    mustRespondTruco &&
    !blockedTrucoLadder &&
    (gameState.canRaiseTruco === true ||
      (gameState.canRaiseTruco !== false && trucoResponseRaiseBet != null));
  const canEnvidoBeforeTruco = gameState.canEnvidoBeforeTruco === true;

  const showQuieroTruco = mustRespondTruco && gameState.canAcceptTruco !== false;
  const showNoQuieroTruco = mustRespondTruco && gameState.canRejectTruco !== false;

  const canEnvido = gameState.canEnvido === true;
  const canTruco = gameState.canTruco === true;
  const canRetruco = gameState.canRetruco === true;
  const canValeCuatro = gameState.canValeCuatro === true;
  const canFlor = gameState.canFlor === true;
  const canMazo = gameState.canMazo === true;

  const currentTrucoBet = trucoBetStack[trucoBetStack.length - 1] || 'truco';
  const currentEnvidoBet = envidoBetStack[envidoBetStack.length - 1] || 'envido';

  const validEnvidoRaises = useMemo(
    () =>
      ['envido', 'real_envido', 'falta_envido'].filter(bet =>
        canRaiseEnvido(envidoBetStack, bet),
      ),
    [envidoBetStack],
  );

  const envidoBeforeBets = useMemo(
    () =>
      ['envido', 'real_envido', 'falta_envido'].filter(bet =>
        canRaiseEnvido(envidoBetStack, bet),
      ),
    [envidoBetStack],
  );

  const florPanelActive = isPendingFlor && florHabilitada;

  const hasAnyNormalAction =
    canEnvido || canTruco || canRetruco || canValeCuatro || canFlor || canMazo;

  const showNormalActions =
    !isPendingEnvido && !isPendingTruco && !florPanelActive && hasAnyNormalAction;

  const raiseTrucoLabel = trucoResponseRaiseBet === 'vale4' ? 'Vale 4' : 'Retruco';

  const trucoTitle = String(currentTrucoBet).replace(/_/g, ' ').toUpperCase();
  const envidoTitle = String(currentEnvidoBet).replace(/_/g, ' ').toUpperCase();

  const trucoLadderItems = useMemo(
    () => [
      ...(canTruco ? [{ bet: 'truco', label: 'Truco' }] : []),
      ...(canRetruco ? [{ bet: 'retruco', label: 'Retruco' }] : []),
      ...(canValeCuatro ? [{ bet: 'vale4', label: 'Vale 4' }] : []),
    ],
    [canTruco, canRetruco, canValeCuatro],
  );

  useEffect(() => {
    if (!showNormalActions) closeFlyouts();
  }, [showNormalActions, closeFlyouts]);

  useEffect(() => {
    const onDocCapture = e => {
      if (!rootRef.current) return;
      const node = e.target;
      if (!(node instanceof Element)) return;
      if (!rootRef.current.contains(node)) closeFlyouts();
    };
    document.addEventListener('click', onDocCapture, true);
    return () => document.removeEventListener('click', onDocCapture, true);
  }, [closeFlyouts]);

  const runTruco = bet => {
    onTruco(bet);
    closeFlyouts();
  };

  const runEnvido = bet => {
    onEnvido(bet);
    closeFlyouts();
  };

  const onMotherTrucoClick = () => {
    if (trucoLadderItems.length === 1) {
      runTruco(trucoLadderItems[0].bet);
      return;
    }
    setTrucoFlyoutOpen(o => !o);
    setEnvidoFlyoutOpen(false);
    setEnvidoBeforeFlyoutOpen(false);
  };

  const onMotherEnvidoClick = () => {
    if (validEnvidoRaises.length === 1) {
      runEnvido(validEnvidoRaises[0]);
      return;
    }
    setEnvidoFlyoutOpen(o => !o);
    setTrucoFlyoutOpen(false);
    setEnvidoBeforeFlyoutOpen(false);
  };

  if (!gameState) return null;

  const envidoPanel = isPendingEnvido ? (
    <div className="response-panel envido-response game-actions-panel">
            <h3>¡{envidoTitle}!</h3>

            {mustRespondEnvido ? (
              <div className="response-btns response-btns--compact">
                <div className="response-row response-row--core">
                  <button
                    type="button"
                    className="btn btn-accept action-btn"
                    onClick={() => onEnvidoResponse('accept')}
                  >
                    Quiero
                  </button>
                  <button
                    type="button"
                    className="btn btn-reject action-btn"
                    onClick={() => onEnvidoResponse('reject')}
                  >
                    No quiero
                  </button>
                </div>
                {validEnvidoRaises.length > 0 ? (
                  <div className="response-row response-row--raises">
                    {validEnvidoRaises.map(bet => (
                      <button
                        key={bet}
                        type="button"
                        className="btn btn-raise action-btn"
                        onClick={() => onEnvido(bet)}
                      >
                        {mobileLite ? ENVIDO_BET_LABELS_SHORT[bet] : ENVIDO_BET_LABELS[bet]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : waitingOpponentEnvido ? (
              <p className="waiting-msg">Esperando respuesta del oponente…</p>
            ) : null}
    </div>
  ) : null;

  const florPanel = florPanelActive ? (
    <div className="response-panel flor-response game-actions-panel">
            <h3>
              ¡{(florState?.betStack?.slice(-1)[0] || 'FLOR').replace('_', ' ').toUpperCase()}!
            </h3>

            {mustRespondFlor ? (
              <div className="response-btns response-btns--tiered">
                <div className="response-row response-row--primary">
                  {showFlorCompare && (
                    <button
                      type="button"
                      className="btn btn-accept action-btn"
                      onClick={() => onFlorResponse('accept')}
                    >
                      Comparar flor
                    </button>
                  )}

                  {showFlorRaise && (
                    <button type="button" className="btn btn-raise action-btn" onClick={onFlor}>
                      {florState?.betStack?.length === 1
                        ? 'Contraflor'
                        : 'Contraflor al resto'}
                    </button>
                  )}
                </div>
                {showFlorReject ? (
                  <div className="response-row response-row--decline">
                    <button
                      type="button"
                      className="btn btn-reject action-btn"
                      onClick={() => onFlorResponse('reject')}
                    >
                      No quiero
                    </button>
                  </div>
                ) : null}
              </div>
            ) : waitingOpponentFlor ? (
              <p className="waiting-msg">Esperando respuesta del oponente…</p>
            ) : null}
    </div>
  ) : null;

  const trucoPanel =
    isPendingTruco && mustRespondTruco ? (
      <div className="response-panel truco-response game-actions-panel">
            <h3>Te cantaron {trucoTitle}</h3>

            <div className="response-btns response-btns--compact">
              <div className="response-row response-row--core">
                {showQuieroTruco && (
                  <button
                    type="button"
                    className="btn btn-accept action-btn"
                    onClick={() => onTrucoResponse('accept')}
                  >
                    Quiero
                  </button>
                )}
                {canRaiseTrucoBtn && (
                  <button
                    type="button"
                    className="btn btn-raise action-btn"
                    onClick={() => onTrucoResponse('raise')}
                  >
                    {raiseTrucoLabel}
                  </button>
                )}
                {showNoQuieroTruco && (
                  <button
                    type="button"
                    className="btn btn-reject action-btn"
                    onClick={() => onTrucoResponse('reject')}
                  >
                    No quiero
                  </button>
                )}
              </div>
            </div>

            {canEnvidoBeforeTruco && envidoBeforeBets.length > 0 && (
              <div className="envido-before-truco">
                <p className="response-hint">Podés cantar envido antes de responder.</p>
                {mobileLite &&
                  envidoBeforeFlyoutOpen &&
                  envidoBeforeBets.length > 1 && (
                    <div className="action-envido-submenu">
                      <EnvidoOptionsList
                        bets={envidoBeforeBets}
                        onPick={runEnvido}
                        layout="inline"
                        compact
                      />
                    </div>
                  )}
                <EnvidoRaiseControl
                  className="action-flyout-wrap--inline"
                  bets={envidoBeforeBets}
                  flyoutOpen={envidoBeforeFlyoutOpen}
                  mobileInline={!mobileLite}
                  optionsExternal={mobileLite}
                  onToggle={() => {
                    if (envidoBeforeBets.length === 1) {
                      runEnvido(envidoBeforeBets[0]);
                      return;
                    }
                    setEnvidoBeforeFlyoutOpen(o => !o);
                    setEnvidoFlyoutOpen(false);
                    setTrucoFlyoutOpen(false);
                  }}
                  onPick={runEnvido}
                />
              </div>
            )}
      </div>
    ) : null;

  const trucoWaitingPanel =
    isPendingTruco && waitingOpponentTruco ? (
      <div className="response-panel truco-waiting game-actions-panel">
        <p className="waiting-msg">Esperando respuesta del oponente al Truco…</p>
      </div>
    ) : null;

  return (
    <div className="action-buttons" ref={rootRef}>
      {mobileLite ? (
        <>
          {envidoPanel}
          {florPanel}
          {trucoPanel}
          {trucoWaitingPanel}
          {showNormalActions && (
            <div className="action-group action-group--normal game-actions-panel game-actions-panel--mobile-compact">
              {envidoFlyoutOpen && validEnvidoRaises.length > 1 && (
                <div className="action-envido-submenu">
                  <EnvidoOptionsList
                    bets={validEnvidoRaises}
                    onPick={runEnvido}
                    layout="inline"
                    compact
                  />
                </div>
              )}
              <div
                className={`action-main-grid action-main-grid--count-${
                  (canEnvido && validEnvidoRaises.length > 0 ? 1 : 0) +
                  (trucoLadderItems.length > 0 ? 1 : 0) +
                  (canFlor ? 1 : 0) +
                  (canMazo ? 1 : 0)
                }`}
              >
                {canEnvido && validEnvidoRaises.length > 0 && (
                  <EnvidoRaiseControl
                    bets={validEnvidoRaises}
                    flyoutOpen={envidoFlyoutOpen}
                    optionsExternal
                    onToggle={onMotherEnvidoClick}
                    onPick={runEnvido}
                  />
                )}
                {trucoLadderItems.length > 0 && (
                  <div className="action-flyout-wrap action-cluster--truco">
                    <button
                      type="button"
                      className="btn btn-game-truco action-btn"
                      onClick={onMotherTrucoClick}
                    >
                      Truco
                    </button>
                  </div>
                )}
                {canFlor && (
                  <button
                    type="button"
                    className="btn btn-flor action-btn action-cluster--flor"
                    onClick={onFlor}
                  >
                    Flor
                  </button>
                )}
                {canMazo && (
                  <button
                    type="button"
                    className="btn btn-mazo action-btn action-cluster--aux btn-mazo--compact"
                    onClick={onIrseAlMazo}
                  >
                    Mazo
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <AnimatePresence>
            {isPendingEnvido && (
              <motion.div
                key="envido-resp"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
              >
                {envidoPanel}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {florPanelActive && (
              <motion.div
                key="flor-resp"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
              >
                {florPanel}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {trucoPanel && (
              <motion.div
                key="truco-resp"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
              >
                {trucoPanel}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {trucoWaitingPanel && (
              <motion.div
                key="truco-wait"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
              >
                {trucoWaitingPanel}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {showNormalActions && (
              <motion.div
                key="normal-actions"
                className="action-group action-group--normal game-actions-panel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
              >
                <div className="action-bar-row">
                  {trucoLadderItems.length > 0 && (
                    <div className="action-flyout-wrap">
                      <button
                        type="button"
                        className="btn btn-game-truco action-btn"
                        aria-expanded={trucoLadderItems.length > 1 ? trucoFlyoutOpen : undefined}
                        aria-haspopup={trucoLadderItems.length > 1 ? 'menu' : undefined}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation();
                          onMotherTrucoClick();
                        }}
                      >
                        Truco
                        {trucoLadderItems.length > 1 && (
                          <ChevronDown
                            className={`action-chevron ${trucoFlyoutOpen ? 'action-chevron--open' : ''}`}
                            size={16}
                            aria-hidden
                          />
                        )}
                      </button>
                      <AnimatePresence>
                        {trucoFlyoutOpen && trucoLadderItems.length > 1 && (
                          <motion.div
                            className="action-flyout action-flyout--up"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                          >
                            <div className="action-flyout-list">
                              {trucoLadderItems.map(({ bet, label }) => (
                                <button
                                  key={bet}
                                  type="button"
                                  className="btn btn-flyout-item"
                                  onClick={() => runTruco(bet)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {canEnvido && validEnvidoRaises.length > 0 && (
                    <EnvidoRaiseControl
                      bets={validEnvidoRaises}
                      flyoutOpen={envidoFlyoutOpen}
                      animatedFlyout
                      onToggle={onMotherEnvidoClick}
                      onPick={runEnvido}
                    />
                  )}

                  {canFlor && (
                    <button type="button" className="btn btn-flor action-btn" onClick={onFlor}>
                      Flor
                    </button>
                  )}

                  {canMazo && (
                    <button
                      type="button"
                      className="btn btn-mazo action-btn"
                      title="Me voy al mazo"
                      aria-label="Me voy al mazo"
                      onClick={onIrseAlMazo}
                    >
                      <span className="game-action-label game-action-label--full">Me voy al mazo</span>
                      <span className="game-action-label game-action-label--short">Mazo</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

export default memo(ActionButtons);

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useGamePlay } from '../context/GameContext';
import { getSocket } from '../services/socket';
import GameBoard from '../components/game/GameBoard';
import GameHeader from '../components/game/GameHeader';
import GameOverModal from '../components/game/GameOverModal';
import ReconnectOverlay from '../components/game/ReconnectOverlay';
import EnvidoResultModal from '../components/game/EnvidoResultModal';
import toast from 'react-hot-toast';
import { useGameSounds } from '../hooks/useGameSounds';
import { getSoundEnabled, toggleSound } from '../services/soundManager';
import { profileApi } from '../services/api';
import { preloadCardImages } from '../utils/preloadCardImages';
import { shouldShowEnvidoResultModal } from '../utils/envidoUi';
import { useIsMobileLite } from '../hooks/useIsMobileLite';
import { usePerfMonitor } from '../hooks/usePerfMonitor';
import PerfHud from '../components/game/PerfHud';
import { isPerfEnabled } from '../utils/perf';

export default function Game() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mobileLite = useIsMobileLite();
  const {
    gameState,
    roomId,
    opponent,
    gameOver,
    lastEvent,
    reconnectGame,
    reconnectingGame,
    abandonGame,
    opponentDisconnected,
    turnTimer,
    playCard,
    envido,
    envidoResp,
    truco,
    trucoResp,
    flor,
    florResp,
    irseAlMazo,
  } = useGamePlay();

  const gameStateRef = useRef(gameState);
  const gameOverRef = useRef(gameOver);
  const [soundOn, setSoundOn] = useState(() => getSoundEnabled());
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

  useEffect(() => {
    gameStateRef.current = gameState;
    gameOverRef.current = gameOver;
  }, [gameState, gameOver]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    preloadCardImages().catch(() => {});
  }, []);

  useEffect(() => {
    if (gameState || gameOver) return;

    if (roomId) {
      const rid = String(roomId);
      localStorage.setItem('truco_active_room', rid);
      reconnectGame(rid);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await profileApi.getActiveGames();
        if (cancelled) return;
        if (gameStateRef.current || gameOverRef.current) return;

        const games = Array.isArray(data?.games) ? data.games : [];
        if (games.length === 0) {
          localStorage.removeItem('truco_active_room');
          navigate('/lobby', { replace: true });
          return;
        }

        const stored = localStorage.getItem('truco_active_room');
        const primary = games.find((g) => g.room_id === stored) || games[0];
        const roomToJoin = primary?.room_id;
        if (!roomToJoin) {
          localStorage.removeItem('truco_active_room');
          navigate('/lobby', { replace: true });
          return;
        }

        if (stored !== roomToJoin) {
          localStorage.setItem('truco_active_room', roomToJoin);
        }

        reconnectGame(roomToJoin);
      } catch {
        if (cancelled) return;
        if (gameStateRef.current || gameOverRef.current) return;
        const activeRoom = localStorage.getItem('truco_active_room');
        if (!activeRoom) {
          navigate('/lobby', { replace: true });
          return;
        }
        reconnectGame(activeRoom);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gameState, gameOver, roomId, reconnectGame, navigate]);

  useEffect(() => {
    if (!reconnectingGame) return;

    const t = setTimeout(() => {
      if (!gameStateRef.current) {
        toast.error('No se pudo reconectar automáticamente. Volvé desde el lobby.');
        navigate('/lobby', { replace: true });
      }
    }, 5000);

    return () => clearTimeout(t);
  }, [reconnectingGame, navigate]);

  useGameSounds(gameState, user, lastEvent, gameOver);
  const perfSnapshot = usePerfMonitor(gameState, lastEvent);

  useEffect(() => {
    if (lastEvent?.type === 'abandoned') {
      navigate('/lobby', {
        state: {
          message:
            lastEvent.winner === user.id
              ? '¡Ganaste! Tu rival abandonó.'
              : 'Perdiste por abandono.',
        },
      });
    }
  }, [lastEvent, navigate, user.id]);

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'ENVIDO_RESULT') return;
    if (!shouldShowEnvidoResultModal(lastEvent)) {
      setEnvidoResult(null);
      return;
    }
    setEnvidoResult(lastEvent);
  }, [lastEvent]);

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

  const myId = user.id;
  const isMyTurn =
    gameState.waitingForPlayer != null &&
    String(gameState.waitingForPlayer) === String(myId);

  const toggleSoundHandler = () => {
    toggleSound();
    setSoundOn(getSoundEnabled());
  };

  return (
    <div
      className={`game-page${mobileLite ? ' game-page--lite' : ''}${isPerfEnabled() ? ' game-page--perf' : ''}`}
    >
      <PerfHud snapshot={perfSnapshot} />
      <AnimatePresence>
        {opponentDisconnected && (
          <ReconnectOverlay
            type="opponent"
            graceSecs={opponentDisconnected.gracePeriodSecs}
          />
        )}
      </AnimatePresence>

      <GameHeader
        gameState={gameState}
        myId={myId}
        opponent={opponent}
        turnTimer={turnTimer}
        isMyTurn={isMyTurn}
        soundOn={soundOn}
        onToggleSound={toggleSoundHandler}
        socketLive={socketLive}
        onAbandon={() => setShowAbandonConfirm(true)}
      />

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
              onClick={(e) => e.stopPropagation()}
            >
              <div className="game-modal-icon game-modal-icon--warn" aria-hidden>
                !
              </div>
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
        <GameBoard
          gameState={gameState}
          myId={myId}
          opponent={opponent}
          gameOver={gameOver}
          isMyTurn={isMyTurn}
          onPlayCard={playCard}
          onEnvido={envido}
          onEnvidoResponse={envidoResp}
          onTruco={truco}
          onTrucoResponse={trucoResp}
          onFlor={flor}
          onFlorResponse={florResp}
          onIrseAlMazo={irseAlMazo}
        />
      </div>

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

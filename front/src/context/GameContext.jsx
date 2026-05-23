import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';
import { toastErrorOnce } from '../utils/toastOnce';
import { isPerfEnabled, perfMark } from '../utils/perf';

const GamePlayContext = createContext(null);
const GameChatContext = createContext(null);
const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [gameState, setGameState]               = useState(null);
  const [roomId, setRoomId]                     = useState(null);
  const [opponent, setOpponent]                 = useState(null);
  const [inQueue, setInQueue]                   = useState(false);
  const [gameOver, setGameOver]                 = useState(null);
  const [chatMessages, setChatMessages]         = useState([]);
  const [lastEvent, setLastEvent]               = useState(null);
  const [turnTimer, setTurnTimer]               = useState(null);   // { playerId, seconds }
  const [opponentDisconnected, setOppDC]        = useState(null);   // { gracePeriodSecs } | null
  const [reconnectingGame, setReconnectingGame] = useState(false);
  // Track WHICH socket object we attached listeners to.
  // If connectSocket ever creates a new io() instance (e.g. after logout/login),
  // the module-level `socket` reference changes and we must re-attach listeners.
  const attachedToSocketRef                      = useRef(null);
  // Track whether we already sent a reconnect for the current room
  // to avoid double-emitting game:reconnect on socket connect + reconnectGame()
  const reconnectSentRef                        = useRef(false);
  // Ref wrapper to allow safe recursive call inside setTimeout
  const reconnectGameRef                        = useRef(null);
  const attachListeners = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    if (attachedToSocketRef.current === socket) return; // already attached to this exact socket object
    attachedToSocketRef.current = socket;
socket.on('connect', () => {

  const activeRoom = localStorage.getItem('truco_active_room');

  // Only auto-reconnect if we haven't already sent a reconnect for this room
  // (prevents double emit when Game.jsx also calls reconnectGame)
  if (activeRoom && !reconnectSentRef.current) {
    reconnectSentRef.current = true;
    setReconnectingGame(true);
    setRoomId(activeRoom);
    socket.emit('game:reconnect', { roomId: activeRoom });
  }
});
    socket.on('queue:joined',  () => setInQueue(true));
    socket.on('queue:left',    () => setInQueue(false));
    socket.on('queue:error', ({ error }) => {
      setInQueue(false);
      if (error) toast.error(error);
    });

   socket.on('game:start', ({ roomId: rid, opponent: opp, gameState: gs }) => {
  localStorage.setItem('truco_active_room', rid);
  reconnectSentRef.current = false;

  setRoomId(rid);
  setOpponent(opp || null);
  setGameState(gs || null);
  setGameOver(null);
  setChatMessages([]);
  setInQueue(false);

  toast.success(`¡Partida iniciada!${opp?.username ? ` vs ${opp.username}` : ''}`);
});
socket.on('match:found', ({ roomId: rid, opponent: opp, gameState: gs }) => {
  setRoomId(rid);
  setOpponent(opp || null);
  setGameState(gs || null);
  setGameOver(null);
  setChatMessages([]);
  setInQueue(false);

  toast.success(`¡Partida encontrada!${opp?.username ? ` vs ${opp.username}` : ''}`);
});

socket.on('matchFound', ({ roomId: rid, opponent: opp, gameState: gs }) => {
  setRoomId(rid);
  setOpponent(opp || null);
  setGameState(gs || null);
  setGameOver(null);
  setChatMessages([]);
  setInQueue(false);

  toast.success(`¡Partida encontrada!${opp?.username ? ` vs ${opp.username}` : ''}`);
});
    socket.on('game:state', (gs) => {
      if (isPerfEnabled()) perfMark('game_state_recv');
      setGameState(gs);
    });

    socket.on('game:cardPlayed', (data) => {
      if (isPerfEnabled()) perfMark('cardPlayed_recv', data);
      setLastEvent({ type: 'CARD_PLAYED', ...data });
    });

    socket.on('game:envidoAnnounced', (data) => {
      setLastEvent({ type: 'ENVIDO_ANNOUNCED', ...data });
      toast(`🃏 ${data.by === socket.id ? 'Vos cantaste' : 'Oponente cantó'} ${data.betType.replace('_', ' ')}`);
    });

    socket.on('game:envidoResult', (data) => {
      setLastEvent({ type: 'ENVIDO_RESULT', ...data });
    });

    socket.on('game:trucoAnnounced', (data) => {
      setLastEvent({ type: 'TRUCO_ANNOUNCED', ...data });
    });

    socket.on('game:trucoResult', (data) => {
      setLastEvent({ type: 'TRUCO_RESULT', ...data });
    });

    socket.on('game:irseAlMazo', (data) => {
      setLastEvent({ type: 'IRSE_AL_MAZO', ...data });
    });

    socket.on('game:florAnnounced', (data) => {
      setLastEvent({ type: 'FLOR_ANNOUNCED', ...data });
    });

    socket.on('game:florResult', (data) => {
      setLastEvent({ type: 'FLOR_RESULT', ...data });
    });

   socket.on('game:over', (data) => {
  localStorage.removeItem('truco_active_room');
  reconnectSentRef.current = false;
  // Do NOT null gameState/roomId here — Game.jsx still needs to render
  // so the GameOverModal (inside the game page) can appear.
  // clearGame() is called when the user presses "Volver al Lobby".
  setGameOver(data);
  setLastEvent({ type: 'GAME_OVER', ...data });
});

    socket.on('game:opponentDisconnected', () => {
      toast.error('Oponente desconectado. Esperando reconexión...');
    });

    socket.on('game:reconnected', ({ gameState: gs }) => {
      setGameState(gs);
      toast.success('Reconectado a la partida');
    });

   socket.on('game:error', ({ error }) => {
  toastErrorOnce(error);

  if (
    error === 'Game not found' ||
    error === 'Not in this game' ||
    error === 'Invalid roomId'
  ) {
    localStorage.removeItem('truco_active_room');
    setRoomId(null);
    setGameState(null);
    setReconnectingGame(false);
  }
});

   socket.on('chat:message', (msg) => {
  setChatMessages(prev => [...prev, msg]);
});

    socket.on('chat:reaction', (data) => {
      setChatMessages(prev => [...prev, { ...data, isReaction: true }]);
    });

    socket.on('chat:error', ({ error }) => toast.error(error));

    socket.on('game:turnTimer', ({ playerId, seconds }) => {
      setTurnTimer({ playerId, seconds });
    });

    socket.on('game:turnTimeout', () => {
      setTurnTimer(null);
    });

    socket.on('player:disconnected', ({ playerId, gracePeriodSecs }) => {
      setOppDC({ playerId, gracePeriodSecs });
      toast(`Tu rival se desconectó. Tiene ${gracePeriodSecs}s para volver.`, { icon: '⚡', duration: 5000 });
    });

    socket.on('player:reconnected', ({ username }) => {
      setOppDC(null);
      toast(`${username} volvió a conectarse.`, { icon: '✅' });
    });

   socket.on('game:abandoned', () => {
  // game:over (with reason:'abandon') is now the canonical end event emitted by the
  // backend. This handler is kept only for backward compatibility and does NOT
  // null gameState/roomId — that would leave the opponent on the loading screen.
  setOppDC(null);
});

   socket.on('game:resume', ({ gameState: gs }) => {
  if (gs?.roomId) {
    localStorage.setItem('truco_active_room', gs.roomId);
    setRoomId(gs.roomId);
  }

  // Reconnect succeeded — reset guard so future refreshes can reconnect again
  reconnectSentRef.current = false;

  setGameState(gs);
  setGameOver(null);
  setInQueue(false);
  setReconnectingGame(false);

  toast.success('Reconectado a la partida');
});
  }, []);
  useEffect(() => {
    attachListeners();
  }, [attachListeners]);

  // ── Actions (estables entre renders; roomId en closure) ─────────
  const joinQueue = useCallback((options = {}) => {
    attachListeners();
    const socket = getSocket();
    if (!socket) {
      toast.error('Socket no conectado');
      return;
    }
    const normalizedOptions = {
      modo: options.modo === 'ranked' ? 'ranked' : 'casual',
      puntosMaximos: Number(options.puntosMaximos) === 15 ? 15 : 30,
      florHabilitada: Boolean(options.florHabilitada),
    };
    setInQueue(true);
    socket.emit('queue:join', normalizedOptions);
  }, [attachListeners]);

  const leaveQueue = useCallback(() => getSocket()?.emit('queue:leave'), []);
  const playCard = useCallback(
    (cardId) => {
      if (isPerfEnabled()) perfMark('playCard_click', { cardId });
      getSocket()?.emit('game:playCard', { roomId, cardId });
    },
    [roomId],
  );
  const envido = useCallback(
    (betType) => getSocket()?.emit('game:envido', { roomId, betType }),
    [roomId],
  );
  const envidoResp = useCallback(
    (response) => getSocket()?.emit('game:envidoResponse', { roomId, response }),
    [roomId],
  );
  const truco = useCallback(
    (betType) => getSocket()?.emit('game:truco', { roomId, betType }),
    [roomId],
  );
  const trucoResp = useCallback(
    (response) => getSocket()?.emit('game:trucoResponse', { roomId, response }),
    [roomId],
  );
  const irseAlMazo = useCallback(
    () => getSocket()?.emit('game:irseAlMazo', { roomId }),
    [roomId],
  );
  const nextRound = useCallback(
    () => getSocket()?.emit('game:nextRound', { roomId }),
    [roomId],
  );
  const flor = useCallback(() => getSocket()?.emit('game:flor', { roomId }), [roomId]);
  const florResp = useCallback(
    (response) => getSocket()?.emit('game:florResponse', { roomId, response }),
    [roomId],
  );
  const abandonGame = useCallback(
    () => getSocket()?.emit('game:abandon', { roomId }),
    [roomId],
  );

  const clearGame = useCallback(() => {
    localStorage.removeItem('truco_active_room');
    reconnectSentRef.current = false;
    setGameState(null);
    setRoomId(null);
    setOpponent(null);
    setGameOver(null);
    setLastEvent(null);
    setTurnTimer(null);
    setOppDC(null);
    setReconnectingGame(false);
  }, []);
  const sendMessage = useCallback((text) => {
    const socket = getSocket();
    if (!socket) {
      toast.error('Socket no conectado');
      return;
    }
    if (!roomId) {
      toast.error('No hay sala activa');
      return;
    }
    socket.emit('chat:message', { roomId, text });
  }, [roomId]);

  const sendReaction = useCallback(
    (reaction) => getSocket()?.emit('chat:reaction', { roomId, reaction }),
    [roomId],
  );

  const reconnectGame = useCallback((rid) => {
  if (!rid) {
    toast.error('No hay partida activa para reconectar');
    return;
  }

  const socket = getSocket();

  if (!socket) {
    setReconnectingGame(true);
    setRoomId(rid);
    localStorage.setItem('truco_active_room', rid);

    // Use ref to avoid TDZ issue with const + recursive setTimeout
    setTimeout(() => reconnectGameRef.current?.(rid), 500);

    return;
  }

  attachListeners();

  setReconnectingGame(true);
  setRoomId(rid);
  localStorage.setItem('truco_active_room', rid);

  const emitReconnect = () => {
    // Guard: only send once per session (the connect listener may also fire)
    if (reconnectSentRef.current) {
      return;
    }
    reconnectSentRef.current = true;
    socket.emit('game:reconnect', { roomId: rid });
  };

  if (socket.connected) {
    emitReconnect();
  } else {
    socket.once('connect', () => {
      attachListeners();
      emitReconnect();
    });

    socket.connect?.();
  }
}, [attachListeners]);
  // Keep the ref in sync via effect so it's never stale in setTimeout callbacks
  useEffect(() => {
    reconnectGameRef.current = reconnectGame;
  }, [reconnectGame]);

  const playValue = useMemo(
    () => ({
      gameState,
      roomId,
      opponent,
      inQueue,
      gameOver,
      lastEvent,
      turnTimer,
      opponentDisconnected,
      reconnectingGame,
      attachListeners,
      joinQueue,
      leaveQueue,
      playCard,
      envido,
      envidoResp,
      truco,
      trucoResp,
      flor,
      florResp,
      irseAlMazo,
      nextRound,
      abandonGame,
      clearGame,
      reconnectGame,
    }),
    [
      gameState,
      roomId,
      opponent,
      inQueue,
      gameOver,
      lastEvent,
      turnTimer,
      opponentDisconnected,
      reconnectingGame,
      attachListeners,
      joinQueue,
      leaveQueue,
      playCard,
      envido,
      envidoResp,
      truco,
      trucoResp,
      flor,
      florResp,
      irseAlMazo,
      nextRound,
      abandonGame,
      clearGame,
      reconnectGame,
    ],
  );

  const chatValue = useMemo(
    () => ({ chatMessages, sendMessage, sendReaction }),
    [chatMessages, sendMessage, sendReaction],
  );

  const mergedValue = useMemo(
    () => ({ ...playValue, ...chatValue }),
    [playValue, chatValue],
  );

  return (
    <GamePlayContext.Provider value={playValue}>
      <GameChatContext.Provider value={chatValue}>
        <GameContext.Provider value={mergedValue}>{children}</GameContext.Provider>
      </GameChatContext.Provider>
    </GamePlayContext.Provider>
  );
}

export function useGamePlay() {
  const ctx = useContext(GamePlayContext);
  if (!ctx) throw new Error('useGamePlay must be used within GameProvider');
  return ctx;
}

export function useGameChat() {
  const ctx = useContext(GameChatContext);
  if (!ctx) throw new Error('useGameChat must be used within GameProvider');
  return ctx;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

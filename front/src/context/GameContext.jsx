import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';
import { toastErrorOnce } from '../utils/toastOnce';

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
  console.log('FRONT socket connected:', socket.id);

  const activeRoom = localStorage.getItem('truco_active_room');

  // Only auto-reconnect if we haven't already sent a reconnect for this room
  // (prevents double emit when Game.jsx also calls reconnectGame)
  if (activeRoom && !reconnectSentRef.current) {
    console.log('FRONT auto reconnect on socket connect:', activeRoom);
    reconnectSentRef.current = true;
    setReconnectingGame(true);
    setRoomId(activeRoom);
    socket.emit('game:reconnect', { roomId: activeRoom });
  }
});
    socket.on('queue:joined',  () => setInQueue(true));
    socket.on('queue:left',    () => setInQueue(false));

   socket.on('game:start', ({ roomId: rid, opponent: opp, gameState: gs }) => {
  console.log('FRONT game:start recibido', { roomId: rid, opponent: opp, gameState: gs });

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
  console.log('FRONT match:found recibido', {
    roomId: rid,
    opponent: opp,
    gameState: gs,
  });

  setRoomId(rid);
  setOpponent(opp || null);
  setGameState(gs || null);
  setGameOver(null);
  setChatMessages([]);
  setInQueue(false);

  toast.success(`¡Partida encontrada!${opp?.username ? ` vs ${opp.username}` : ''}`);
});

socket.on('matchFound', ({ roomId: rid, opponent: opp, gameState: gs }) => {
  console.log('FRONT matchFound recibido', {
    roomId: rid,
    opponent: opp,
    gameState: gs,
  });

  setRoomId(rid);
  setOpponent(opp || null);
  setGameState(gs || null);
  setGameOver(null);
  setChatMessages([]);
  setInQueue(false);

  toast.success(`¡Partida encontrada!${opp?.username ? ` vs ${opp.username}` : ''}`);
});
    socket.on('game:state', (gs) => setGameState(gs));

    socket.on('game:cardPlayed', (data) => {
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
  console.log('FRONT chat:message recibido', msg);
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
  console.log('FRONT game:resume recibido', gs);

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

  // ── Actions ─────────────────────────────────────────────────────
 const joinQueue = (options = {}) => {
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

  console.log('FRONT queue:join', normalizedOptions);

  setInQueue(true);
  socket.emit('queue:join', normalizedOptions);
};
  const leaveQueue  = () => getSocket()?.emit('queue:leave');
  const playCard    = (cardId)        => getSocket()?.emit('game:playCard',      { roomId, cardId });
  const envido      = (betType)       => getSocket()?.emit('game:envido',        { roomId, betType });
  const envidoResp  = (response)      => getSocket()?.emit('game:envidoResponse',{ roomId, response });
  const truco       = (betType)       => getSocket()?.emit('game:truco',         { roomId, betType });
  const trucoResp   = (response)      => getSocket()?.emit('game:trucoResponse', { roomId, response });
  const irseAlMazo  = ()              => getSocket()?.emit('game:irseAlMazo',    { roomId });
  const nextRound   = ()              => getSocket()?.emit('game:nextRound',     { roomId });
  const flor        = ()              => getSocket()?.emit('game:flor',          { roomId });
  const florResp    = (response)      => getSocket()?.emit('game:florResponse',  { roomId, response });
  const abandonGame = ()              => getSocket()?.emit('game:abandon',       { roomId });

  // Clear all game state (used when navigating away from a finished game)
  const clearGame = () => {
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
  };
 const sendMessage = (text) => {
  const socket = getSocket();

  console.log('FRONT chat:message emit', {
    roomId,
    text,
    socketConnected: socket?.connected,
  });

  if (!socket) {
    toast.error('Socket no conectado');
    return;
  }

  if (!roomId) {
    toast.error('No hay sala activa');
    return;
  }

  socket.emit('chat:message', { roomId, text });
};
  const sendReaction= (reaction)      => getSocket()?.emit('chat:reaction',      { roomId, reaction });

  const reconnectGame = useCallback((rid) => {
  if (!rid) {
    toast.error('No hay partida activa para reconectar');
    return;
  }

  const socket = getSocket();

  if (!socket) {
    console.log('FRONT reconnect: socket todavía no existe, reintentando...');
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
      console.log('FRONT reconnect: already sent for this room, skipping duplicate');
      return;
    }
    reconnectSentRef.current = true;
    console.log('FRONT game:reconnect emit', { roomId: rid, connected: socket.connected, socketId: socket.id });
    socket.emit('game:reconnect', { roomId: rid });
  };

  if (socket.connected) {
    emitReconnect();
  } else {
    console.log('FRONT reconnect: esperando socket connect...');

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

  return (
 <GameContext.Provider value={{
  gameState, roomId, opponent, inQueue, gameOver, chatMessages, lastEvent,
  turnTimer, opponentDisconnected, reconnectingGame,
  attachListeners,
  joinQueue, leaveQueue,
  playCard, envido, envidoResp, truco, trucoResp, flor, florResp,
  irseAlMazo, nextRound, abandonGame, clearGame,
  sendMessage, sendReaction, reconnectGame,
}}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}

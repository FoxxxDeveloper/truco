import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

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
  const listenersAttached                       = useRef(false);

  const attachListeners = useCallback(() => {
    const socket = getSocket();
    if (!socket || listenersAttached.current) return;
    listenersAttached.current = true;

    socket.on('queue:joined',  () => setInQueue(true));
    socket.on('queue:left',    () => setInQueue(false));

    socket.on('game:start', ({ roomId: rid, opponent: opp, gameState: gs }) => {
      setRoomId(rid);
      setOpponent(opp);
      setGameState(gs);
      setGameOver(null);
      setChatMessages([]);
      setInQueue(false);
      toast.success(`¡Partida iniciada! vs ${opp.username}`);
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
      toast.error(error);
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

    socket.on('game:abandoned', ({ winner }) => {
      setOppDC(null);
      setLastEvent({ type: 'abandoned', winner });
    });

    socket.on('game:resume', ({ gameState: gs }) => {
      setGameState(gs);
    });
  }, []);

  useEffect(() => {
    attachListeners();
  }, [attachListeners]);

  // ── Actions ─────────────────────────────────────────────────────
  const joinQueue   = (options = {}) => getSocket()?.emit('queue:join', options);
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
  const sendMessage = (text)          => getSocket()?.emit('chat:message',       { roomId, text });
  const sendReaction= (reaction)      => getSocket()?.emit('chat:reaction',      { roomId, reaction });

  const reconnectGame = (rid) => {
    setRoomId(rid);
    getSocket()?.emit('game:reconnect', { roomId: rid });
  };

  return (
    <GameContext.Provider value={{
      gameState, roomId, opponent, inQueue, gameOver, chatMessages, lastEvent,
      turnTimer, opponentDisconnected,
      attachListeners,
      joinQueue, leaveQueue,
      playCard, envido, envidoResp, truco, trucoResp, flor, florResp,
      irseAlMazo, nextRound,
      sendMessage, sendReaction, reconnectGame,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}

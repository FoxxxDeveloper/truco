import { useEffect, useRef } from 'react';
import { playSound, preloadSounds, unlockAudio, stopVoiceSounds } from '../services/soundManager';

/**
 * Mismo jugador en payload (id numérico o string).
 */
function samePlayerId(a, b) {
  if (a == null || b == null) return false;
  if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Number(a) === Number(b);
  }
  return String(a).trim() === String(b).trim();
}

function normId(v) {
  if (v == null) return null;
  return String(v);
}

function roomKey(gameState) {
  return gameState?.roomId != null ? String(gameState.roomId) : '';
}

/**
 * Voz masculina = cantás / respondés vos; voz femenina = cantó o respondió el rival.
 */
export function getSoundGenderForActor(speakerId, myUserId) {
  if (speakerId == null || myUserId == null) return 'any';
  return samePlayerId(speakerId, myUserId) ? 'male' : 'female';
}

function playTrucoBetSound(betType, gender) {
  if (betType === 'retruco') playSound('retruco', { gender });
  else if (betType === 'vale4') playSound('valeCuatro', { gender });
  else playSound('truco', { gender });
}

/**
 * Reproduce cantos según eventos confirmados por socket (lastEvent) y cambios de estado.
 */
export function useGameSounds(gameState, user, lastEvent, gameOver) {
  const myId = user?.id != null ? normId(user.id) : null;

  const lastTrucoAnnRef = useRef(null);
  const lastTrucoResRef = useRef(null);
  const lastEnvidoAnnounceKeyRef = useRef(null);
  const lastEnvidoResultKeyRef = useRef(null);
  const lastFlorAnnounceKeyRef = useRef(null);
  const lastFlorResultKeyRef = useRef(null);
  const lastEnvidoProofKeyRef = useRef(null);
  const prevWaitingRef = useRef(null);
  const lastManoLenRef = useRef(0);
  const lastGameOverKeyRef = useRef(null);
  const lastCardPlayedKeyRef = useRef(null);
  const lastCardInitKeyRef = useRef(null);
  const mountedRef = useRef(false);
  const lastRoomIdRef = useRef(null);

  useEffect(() => {
    const onFirstPointer = () => {
      unlockAudio();
      preloadSounds();
    };
    window.addEventListener('pointerdown', onFirstPointer, { passive: true });
    return () => window.removeEventListener('pointerdown', onFirstPointer);
  }, []);

  useEffect(() => {
    const rid = roomKey(gameState);
    if (rid && lastRoomIdRef.current !== rid) {
      lastRoomIdRef.current = rid;
      lastTrucoAnnRef.current = null;
      lastTrucoResRef.current = null;
      lastEnvidoAnnounceKeyRef.current = null;
      lastEnvidoResultKeyRef.current = null;
      lastFlorAnnounceKeyRef.current = null;
      lastFlorResultKeyRef.current = null;
      lastEnvidoProofKeyRef.current = null;
      lastGameOverKeyRef.current = null;
      lastCardPlayedKeyRef.current = null;
      lastCardInitKeyRef.current = null;
      lastManoLenRef.current = 0;
      prevWaitingRef.current = null;
      mountedRef.current = false;
    }
  }, [gameState?.roomId]);

  useEffect(() => {
    if (!lastEvent || !myId) return;

    let sonBuenasTimer = 0;
    const clearSonBuenas = () => {
      if (sonBuenasTimer) {
        clearTimeout(sonBuenasTimer);
        sonBuenasTimer = 0;
      }
    };

    const t = lastEvent.type;
    const rid = roomKey(gameState);

    if (t === 'TRUCO_ANNOUNCED') {
      const bet = lastEvent.betType;
      const by = lastEvent.by != null ? normId(lastEvent.by) : null;
      const stackLen = gameState?.trucoBetStack?.length ?? '';
      const key = `${rid}-ta-${by}-${bet}-${stackLen}`;
      if (lastTrucoAnnRef.current === key) return;
      lastTrucoAnnRef.current = key;
      const g = getSoundGenderForActor(by, myId);
      playTrucoBetSound(bet, g);
      return () => clearSonBuenas();
    }

    if (t === 'TRUCO_RESULT') {
      const ev = lastEvent.event;
      const respondedBy =
        lastEvent.respondedBy != null ? normId(lastEvent.respondedBy) : null;
      const response = lastEvent.response ?? '';
      const betType = lastEvent.betType ?? '';
      const stackLen = gameState?.trucoBetStack?.length ?? '';
      const key = `${rid}-tr-${ev}-${response}-${betType}-${stackLen}-${respondedBy ?? ''}`;
      if (lastTrucoResRef.current === key) return;
      lastTrucoResRef.current = key;

      const g = getSoundGenderForActor(respondedBy, myId);

      if (ev === 'TRUCO_RAISED' || response === 'raise' || ev === 'TRUCO_ANNOUNCED') {
        playTrucoBetSound(betType, g);
        return () => clearSonBuenas();
      }

      if (ev === 'TRUCO_ACCEPTED') {
        playSound('quiero', { gender: g });
        return () => clearSonBuenas();
      }
      if (ev === 'TRUCO_REJECTED') {
        playSound('noQuiero', { gender: g });
        return () => clearSonBuenas();
      }

      return () => clearSonBuenas();
    }

    if (t === 'ENVIDO_ANNOUNCED') {
      const bet = lastEvent.betType;
      const by = lastEvent.by != null ? normId(lastEvent.by) : null;
      const stackLen = gameState?.envidoBetStack?.length ?? '';
      const key = `${rid}-ea-${by}-${bet}-${stackLen}`;
      if (lastEnvidoAnnounceKeyRef.current === key) return;
      lastEnvidoAnnounceKeyRef.current = key;
      const g = getSoundGenderForActor(by, myId);
      if (bet === 'real_envido') playSound('realEnvido', { gender: g });
      else if (bet === 'falta_envido') playSound('faltaEnvido', { gender: g });
      else playSound('envido', { gender: g });
      return () => clearSonBuenas();
    }

    if (t === 'ENVIDO_RESULT') {
      const ev = lastEvent.event;
      const respondedBy =
        lastEvent.respondedBy != null ? normId(lastEvent.respondedBy) : null;
      const s0 = gameState?.scores?.[Object.keys(gameState?.scores || {})[0]];
      const s1 = gameState?.scores?.[Object.keys(gameState?.scores || {})[1]];
      const key = `${rid}-er-${ev}-${lastEvent.reason ?? ''}-${respondedBy ?? ''}-${s0}-${s1}`;
      if (lastEnvidoResultKeyRef.current === key) return;
      lastEnvidoResultKeyRef.current = key;

      const gResponder = getSoundGenderForActor(respondedBy, myId);

      if (ev === 'ENVIDO_REJECTED') {
        playSound('noQuiero', { gender: gResponder });
        return () => clearSonBuenas();
      }

      if (ev === 'ENVIDO_RESOLVED') {
        playSound('quiero', { gender: gResponder });

        const reveal = lastEvent.envidoReveal;
        if (reveal?.sonBuenas && reveal.manoPlayerId != null) {
          const manoId = normId(reveal.manoPlayerId);
          const gMano = getSoundGenderForActor(manoId, myId);
          sonBuenasTimer = window.setTimeout(() => {
            playSound('sonBuenas', { gender: gMano });
            sonBuenasTimer = 0;
          }, 650);
        }
      }

      return () => clearSonBuenas();
    }

    if (t === 'FLOR_ANNOUNCED') {
      const inner = lastEvent.event;
      const by = lastEvent.by != null ? normId(lastEvent.by) : null;
      const key = `${rid}-fa-${by}-${inner}`;
      if (lastFlorAnnounceKeyRef.current === key) return;
      lastFlorAnnounceKeyRef.current = key;
      const g = getSoundGenderForActor(by, myId);
      if (inner === 'FLOR_RAISED') playSound('contraFlor', { gender: g });
      else if (inner === 'FLOR_ANNOUNCED') playSound('flor', { gender: g });
      return () => clearSonBuenas();
    }

    if (t === 'FLOR_RESULT') {
      const reason = lastEvent.reason || lastEvent.florResultReason || '';
      const w = lastEvent.winner != null ? normId(lastEvent.winner) : '';
      const respondedBy =
        lastEvent.respondedBy != null ? normId(lastEvent.respondedBy) : null;
      const key = `${rid}-fr-${reason}-${w}-${lastEvent.points ?? ''}-${respondedBy ?? ''}`;
      if (lastFlorResultKeyRef.current === key) return;
      lastFlorResultKeyRef.current = key;

      if (reason === 'no_rival_flor' || lastEvent.autoResolved) {
        return () => clearSonBuenas();
      }

      const speakerId = respondedBy ?? (lastEvent.by != null ? normId(lastEvent.by) : null);
      const g = getSoundGenderForActor(speakerId, myId);

      if (
        lastEvent.response === 'reject' ||
        reason === 'contra_flor_rejected'
      ) {
        playSound('noQuiero', { gender: g });
        return () => clearSonBuenas();
      }

      if (lastEvent.florPoints || reason === 'comparison') {
        playSound('quiero', { gender: g });
      }

      return () => clearSonBuenas();
    }

    if (t === 'IRSE_AL_MAZO') {
      const by = lastEvent.by != null ? normId(lastEvent.by) : null;
      playSound('alMazo', { gender: getSoundGenderForActor(by, myId) });
      return () => clearSonBuenas();
    }

    if (t === 'CARD_PLAYED') {
      const by = lastEvent.playerId != null ? normId(lastEvent.playerId) : null;
      const cardId = lastEvent.cardId ?? '';
      const mano = gameState?.currentMano ?? '';
      const playedLen = gameState?.playedCards?.[mano]?.length ?? '';
      const key = `${rid}-cp-${mano}-${playedLen}-${by}-${cardId}`;
      if (lastCardPlayedKeyRef.current === key) return;
      lastCardPlayedKeyRef.current = key;
      if (by && samePlayerId(by, myId)) {
        playSound('cardPlaySelf');
      } else if (by) {
        playSound('cardPlayOpponent');
      } else {
        playSound('cardPlay');
      }
      return () => clearSonBuenas();
    }

    if (t === 'GAME_OVER') {
      const w = lastEvent.winner != null ? normId(lastEvent.winner) : '';
      const s0 = gameState?.scores?.[Object.keys(gameState?.scores || {})[0]];
      const s1 = gameState?.scores?.[Object.keys(gameState?.scores || {})[1]];
      const key = `${rid}-go-${w}-${s0}-${s1}-${lastEvent.reason ?? ''}`;
      if (lastGameOverKeyRef.current === key) return;
      lastGameOverKeyRef.current = key;
      stopVoiceSounds();
      if (w && samePlayerId(w, myId)) playSound('victory');
      else if (w) playSound('defeat');
    }

    return () => clearSonBuenas();
  }, [lastEvent, myId, gameState?.roomId, gameState?.currentMano, gameState?.playedCards, gameState?.trucoBetStack, gameState?.envidoBetStack, gameState?.scores]);

  useEffect(() => {
    if (!gameOver || !myId) return;
    const w = gameOver.winner != null ? normId(gameOver.winner) : null;
    if (!w) return;
    const rid = roomKey(gameState);
    const key = `${rid}-go-${w}-${gameOver.reason ?? ''}`;
    if (lastGameOverKeyRef.current === key) return;
    lastGameOverKeyRef.current = key;
    stopVoiceSounds();
    if (samePlayerId(w, myId)) playSound('victory');
    else playSound('defeat');
  }, [gameOver, gameState?.roomId, myId]);

  useEffect(() => {
    if (!gameState?.envidoProofReveal?.cards?.length || !myId) return;
    const pr = gameState.envidoProofReveal;
    const key = `${pr.playerId}-${pr.reason}-${pr.cards.map(c => c.id).join(',')}`;
    if (lastEnvidoProofKeyRef.current === key) return;
    lastEnvidoProofKeyRef.current = key;
    const ownerId = pr.playerId != null ? normId(pr.playerId) : null;
    playSound('puntosEnMesa', { gender: getSoundGenderForActor(ownerId, myId) });
  }, [gameState?.envidoProofReveal, myId]);

  useEffect(() => {
    if (!gameState || !myId) return;
    const hand = gameState.myHand;
    if (!Array.isArray(hand) || hand.length !== 3) return;
    if (gameState.currentMano !== 0) return;
    const played = gameState.playedCards;
    const anyPlayed =
      Array.isArray(played) && played.some((m) => Array.isArray(m) && m.length > 0);
    if (anyPlayed) return;

    const handKey = hand
      .map((c) => c?.id ?? `${c?.value}_${c?.suit}`)
      .sort()
      .join(',');
    const key = `${roomKey(gameState)}-init-${handKey}`;
    if (lastCardInitKeyRef.current === key) return;
    lastCardInitKeyRef.current = key;
    playSound('cardInit');
  }, [
    gameState?.myHand,
    gameState?.currentMano,
    gameState?.playedCards,
    gameState?.roomId,
    myId,
  ]);

  useEffect(() => {
    if (!gameState || !myId) return;
    const w = gameState.waitingForPlayer != null ? normId(gameState.waitingForPlayer) : null;
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevWaitingRef.current = w;
      return;
    }
    const prev = prevWaitingRef.current;
    prevWaitingRef.current = w;
    if (w && prev != null && samePlayerId(w, myId) && !samePlayerId(prev, myId)) {
      playSound('turno');
    }
  }, [gameState?.waitingForPlayer, gameState, myId]);

  useEffect(() => {
    if (!gameState || !myId || gameOver) return;
    if (gameState.state === 'GAME_OVER') return;
    const results = gameState.manoResults;
    if (!Array.isArray(results)) return;
    const len = results.length;
    if (len < lastManoLenRef.current) {
      lastManoLenRef.current = len;
      return;
    }
    if (len === lastManoLenRef.current) return;
    lastManoLenRef.current = len;
    const winner = results[len - 1];
    if (winner == null) return;
    if (samePlayerId(winner, myId)) playSound('manoGanada');
    else playSound('manoPerdida');
  }, [gameState?.manoResults, gameState?.state, gameState, gameOver, myId]);
}

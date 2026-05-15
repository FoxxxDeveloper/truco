import { useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { playSound, preloadSounds, unlockAudio } from '../services/soundManager';

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

/**
 * Voz masculina = cantás / respondés vos; voz femenina = cantó o respondió el rival.
 *
 * @param {string | number | null | undefined} speakerId  Quién “habla” en el audio
 * @param {string | number | null | undefined} myUserId  Tu id de usuario (Auth)
 * @returns {'male' | 'female' | 'any'}
 */
export function getSoundGenderForActor(speakerId, myUserId) {
  if (speakerId == null || myUserId == null) return 'any';
  return samePlayerId(speakerId, myUserId) ? 'male' : 'female';
}

/**
 * Reproduce cantos según eventos confirmados por socket (lastEvent) y cambios de estado.
 * No usa ElevenLabs en runtime.
 *
 * @param {object | null} gameState
 * @param {{ id?: string | number } | null} user
 */
export function useGameSounds(gameState, user) {
  const { lastEvent } = useGame();
  const myId = user?.id != null ? normId(user.id) : null;

  const lastTrucoAnnRef = useRef(null);
  const lastTrucoResRef = useRef(null);
  const lastEnvidoAnnounceKeyRef = useRef(null);
  const lastEnvidoResultKeyRef = useRef(null);
  const lastFlorAnnounceKeyRef = useRef(null);
  const lastFlorResultKeyRef = useRef(null);
  const prevWaitingRef = useRef(null);
  const lastManoLenRef = useRef(0);
  const lastGameOverKeyRef = useRef(null);
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
    const rid = gameState?.roomId != null ? String(gameState.roomId) : null;
    if (rid && lastRoomIdRef.current !== rid) {
      lastRoomIdRef.current = rid;
      lastTrucoAnnRef.current = null;
      lastTrucoResRef.current = null;
      lastEnvidoAnnounceKeyRef.current = null;
      lastEnvidoResultKeyRef.current = null;
      lastFlorAnnounceKeyRef.current = null;
      lastFlorResultKeyRef.current = null;
      lastGameOverKeyRef.current = null;
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

    if (t === 'TRUCO_ANNOUNCED') {
      const bet = lastEvent.betType;
      const by = lastEvent.by != null ? normId(lastEvent.by) : null;
      const key = `${by}-${bet}`;
      if (lastTrucoAnnRef.current === key) return;
      lastTrucoAnnRef.current = key;
      const g = getSoundGenderForActor(by, myId);
      if (bet === 'retruco') playSound('retruco', { gender: g });
      else if (bet === 'vale4') playSound('valeCuatro', { gender: g });
      else playSound('truco', { gender: g });
      return () => clearSonBuenas();
    }

    if (t === 'TRUCO_RESULT') {
      const ev = lastEvent.event;
      const respondedBy =
        lastEvent.respondedBy != null ? normId(lastEvent.respondedBy) : null;
      const key = `${ev}-${lastEvent.stake ?? lastEvent.points ?? ''}-${respondedBy ?? ''}`;
      if (lastTrucoResRef.current === key) return;
      lastTrucoResRef.current = key;
      const g = getSoundGenderForActor(respondedBy, myId);
      if (ev === 'TRUCO_ACCEPTED') playSound('quiero', { gender: g });
      else if (ev === 'TRUCO_REJECTED') playSound('noQuiero', { gender: g });
      return () => clearSonBuenas();
    }

    if (t === 'ENVIDO_ANNOUNCED') {
      const bet = lastEvent.betType;
      const by = lastEvent.by != null ? normId(lastEvent.by) : null;
      const key = `${by}-${bet}`;
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
      const pts = lastEvent.points ?? '';
      const respondedBy =
        lastEvent.respondedBy != null ? normId(lastEvent.respondedBy) : null;
      const key = `${ev}-${pts}-${JSON.stringify(lastEvent.envidoReveal || {})}-${respondedBy ?? ''}`;
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
      const key = `${by}-${inner}`;
      if (lastFlorAnnounceKeyRef.current === key) return;
      lastFlorAnnounceKeyRef.current = key;
      const g = getSoundGenderForActor(by, myId);
      if (inner === 'FLOR_RAISED') playSound('contraFlor', { gender: g });
      else if (inner === 'FLOR_ANNOUNCED') playSound('flor', { gender: g });
      return () => clearSonBuenas();
    }

    if (t === 'FLOR_RESULT') {
      const pts = lastEvent.points ?? '';
      const w = lastEvent.winner != null ? normId(lastEvent.winner) : '';
      const respondedBy =
        lastEvent.respondedBy != null ? normId(lastEvent.respondedBy) : null;
      const key = `${w}-${pts}-${lastEvent.florPoints ? 'cmp' : 'nocmp'}-${respondedBy ?? ''}`;
      if (lastFlorResultKeyRef.current === key) return;
      lastFlorResultKeyRef.current = key;
      const g = getSoundGenderForActor(respondedBy, myId);
      if (lastEvent.florPoints) {
        playSound('quiero', { gender: g });
      } else if (lastEvent.respondedBy != null) {
        playSound('noQuiero', { gender: g });
      }
      return () => clearSonBuenas();
    }

    if (t === 'IRSE_AL_MAZO') {
      const by = lastEvent.by != null ? normId(lastEvent.by) : null;
      playSound('alMazo', { gender: getSoundGenderForActor(by, myId) });
      return () => clearSonBuenas();
    }

    if (t === 'GAME_OVER') {
      const w = lastEvent.winner != null ? normId(lastEvent.winner) : '';
      const key = `go-${w}`;
      if (lastGameOverKeyRef.current === key) return;
      lastGameOverKeyRef.current = key;
      if (w && samePlayerId(w, myId)) playSound('partidaGanada');
      else if (w) playSound('partidaPerdida');
    }

    return () => clearSonBuenas();
  }, [lastEvent, myId]);

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
    if (!gameState || !myId) return;
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
  }, [gameState?.manoResults, gameState, myId]);
}

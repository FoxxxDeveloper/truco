import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { challengeApi } from '../../services/api';

/**
 * Escucha retos de amigo (socket + GET pending) y muestra modal aceptar/rechazar.
 * Montado una vez en App (rutas protegidas siguen teniendo acceso vía token).
 */
export default function FriendChallengeListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState(null);

  const applyPayload = useCallback((p) => {
    if (!p?.challengeId) return;
    setIncoming((cur) => (cur?.challengeId === p.challengeId ? cur : { ...p }));
  }, []);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await challengeApi.getFriendPending();
      const list = res.data?.challenges || [];
      if (list.length) {
        const c = list[0];
        const gc = typeof c.game_config === 'string' ? JSON.parse(c.game_config) : (c.game_config || {});
        applyPayload({
          challengeId: c.id,
          creatorId: c.creator_id,
          creatorUsername: c.creator_username,
          kind: parseFloat(c.amount) > 0 ? 'competitive' : 'classic',
          amount: parseFloat(c.amount) || 0,
          puntosMaximos: gc.puntosMaximos ?? 30,
          florHabilitada: !!gc.florHabilitada,
          expiresAt: c.expires_at,
        });
      }
    } catch {
      /* ignore */
    }
  }, [user?.id, applyPayload]);

  useEffect(() => {
    if (!user?.id) return;
    loadPending();
    const t = setInterval(loadPending, 60000);
    return () => clearInterval(t);
  }, [user?.id, loadPending]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user?.id) return;
    const onRecv = (p) => applyPayload(p);
    socket.on('friend_challenge:received', onRecv);
    return () => socket.off('friend_challenge:received', onRecv);
  }, [user?.id, applyPayload]);

  const accept = async () => {
    if (!incoming?.challengeId) return;
    try {
      const res = await challengeApi.accept(incoming.challengeId);
      const battleId = res.data?.battleId || res.data?.challengeId || incoming.challengeId;
      const sock = getSocket();
      sock?.emit('battle:startGame', { battleId });
      toast.success('Reto aceptado');
      setIncoming(null);
      navigate('/game');
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo aceptar');
    }
  };

  const reject = async () => {
    if (!incoming?.challengeId) return;
    try {
      await challengeApi.reject(incoming.challengeId);
      toast.success('Reto rechazado');
      setIncoming(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo rechazar');
    }
  };

  if (!user) return null;

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          className="modal-overlay friend-incoming-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="modal-panel friend-incoming-panel fx-card"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
          >
            <h3 className="friend-incoming-title">
              {incoming.creatorUsername || 'Un jugador'} te retó
            </h3>
            <ul className="friend-incoming-list">
              <li>
                <strong>Tipo</strong> {incoming.kind === 'classic' ? 'Clásico (amistoso)' : 'Competitivo'}
              </li>
              <li>
                <strong>Puntos</strong> {incoming.puntosMaximos}
              </li>
              <li>
                <strong>Flor</strong> {incoming.florHabilitada ? 'Sí' : 'No'}
              </li>
              {incoming.kind === 'competitive' && (
                <li>
                  <strong>Monto</strong> {incoming.amount?.toLocaleString?.('es-AR')} cr
                </li>
              )}
            </ul>
            <p className="friend-incoming-exp">Tenés unos minutos para responder antes de que expire.</p>
            <div className="friend-incoming-actions">
              <button type="button" className="btn btn-ghost" onClick={reject}>
                Rechazar
              </button>
              <button type="button" className="btn btn-primary" onClick={accept}>
                Aceptar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

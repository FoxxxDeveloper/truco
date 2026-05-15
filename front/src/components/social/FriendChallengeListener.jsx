import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { challengeApi } from '../../services/api';

/**
 * Retos de amigo: toast compacto + "Ver" (abre chat privado en el lobby).
 * Aceptar / rechazar se hace desde la card en el chat o el modal "Ver reto".
 */
export default function FriendChallengeListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const shownIncoming = useRef(new Set());

  const openChatWithCreator = useCallback(
    (creatorId, creatorUsername) => {
      navigate('/lobby', {
        state: {
          openPrivateFriend: {
            id: Number(creatorId),
            username: creatorUsername || 'Jugador',
            avatar: null,
            openChallengeModal: false,
          },
        },
      });
    },
    [navigate]
  );

  const pushIncomingToast = useCallback(
    (p) => {
      if (!p?.challengeId || !p?.creatorId) return;
      if (shownIncoming.current.has(p.challengeId)) return;
      shownIncoming.current.add(p.challengeId);
      const name = p.creatorUsername || 'Un jugador';
      toast.custom(
        (t) => (
          <div className="friend-challenge-toast fx-card">
            <p className="friend-challenge-toast-text">
              <strong>{name}</strong> te envió un reto
            </p>
            <div className="friend-challenge-toast-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toast.dismiss(t)}>
                Cerrar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  toast.dismiss(t);
                  openChatWithCreator(p.creatorId, p.creatorUsername);
                }}
              >
                Ver
              </button>
            </div>
          </div>
        ),
        { duration: 14000, id: `fc-${p.challengeId}` }
      );
    },
    [openChatWithCreator]
  );

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await challengeApi.getFriendPending();
        if (cancelled) return;
        const list = res.data?.challenges || [];
        for (const c of list) {
          if (Number(c.creator_id) === Number(user.id)) continue;
          pushIncomingToast({
            challengeId: c.id,
            creatorId: c.creator_id,
            creatorUsername: c.creator_username,
          });
        }
      } catch {
        /* ignore */
      }
    };

    run();
    const t = setInterval(run, 120000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user?.id, pushIncomingToast]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user?.id) return;
    const onRecv = (p) => {
      if (Number(p?.creatorId) === Number(user.id)) return;
      pushIncomingToast(p);
    };
    const onUpd = (p) => {
      if (p?.status === 'rejected' && p?.toastFor === 'creator') {
        toast('Un reto que enviaste fue rechazado', { duration: 4000 });
      }
    };
    socket.on('friend_challenge:received', onRecv);
    socket.on('friend_challenge:updated', onUpd);
    return () => {
      socket.off('friend_challenge:received', onRecv);
      socket.off('friend_challenge:updated', onUpd);
    };
  }, [user?.id, pushIncomingToast]);

  if (!user) return null;
  return null;
}

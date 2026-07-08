/**
 * PublicProfileModal — perfil público con estado de amistad (friendshipStatus desde API).
 */
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  ShieldCheck,
  Shield,
  MessageCircle,
  Swords,
  UserPlus,
  UserMinus,
  Loader2,
} from 'lucide-react';
import { usersApi, socialApi } from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import TrucoAvatar from '../avatar/TrucoAvatar';

export default function PublicProfileModal({
  userId,
  onClose,
  onStartChat,
  onChallengeFriend,
  onFriendshipChange,
}) {
  const { user: me } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const loadProfile = useCallback(() => {
    setLoading(true);
    return usersApi
      .getPublic(userId)
      .then((res) => setProfile(res.data))
      .catch(() => {
        toast.error('No se pudo cargar el perfil');
        onClose?.();
      })
      .finally(() => setLoading(false));
  }, [userId, onClose]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const status = profile?.friendshipStatus || (Number(me?.id) === Number(userId) ? 'self' : 'none');

  const sendFriendReq = async () => {
    setActing(true);
    try {
      await socialApi.sendFriendRequest(userId);
      toast.success('Solicitud enviada');
      await loadProfile();
      onFriendshipChange?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar solicitud');
    } finally {
      setActing(false);
    }
  };

  const acceptIncoming = async () => {
    setActing(true);
    try {
      await socialApi.acceptFriend(userId);
      toast.success('¡Ahora son amigos!');
      await loadProfile();
      onFriendshipChange?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aceptar');
    } finally {
      setActing(false);
    }
  };

  const rejectIncoming = async () => {
    setActing(true);
    try {
      await socialApi.removeFriend(userId);
      toast.success('Solicitud rechazada');
      await loadProfile();
      onFriendshipChange?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setActing(false);
    }
  };

  const removeFriendship = async () => {
    setActing(true);
    try {
      await socialApi.removeFriend(userId);
      toast.success('Amigo eliminado');
      await loadProfile();
      onFriendshipChange?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    } finally {
      setActing(false);
    }
  };

  const openChat = () => {
    if (!profile) return;
    onStartChat?.({ id: profile.id, username: profile.username, avatar: profile.avatar });
    onClose?.();
  };

  const challenge = () => {
    if (!profile) return;
    onChallengeFriend?.({ id: profile.id, username: profile.username, avatar: profile.avatar });
    onClose?.();
  };

  return (
    <motion.div
      className="modal-overlay public-profile-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-panel public-profile-modal"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-profile-title"
      >
        <button type="button" className="btn-close public-profile-close" onClick={onClose} aria-label="Cerrar">
          <X size={18} aria-hidden />
        </button>

        {loading && <p className="public-profile-loading">Cargando…</p>}

        {!loading && profile && (
          <>
            <div className="public-profile-head">
              <div className="brand-logo-clean public-profile-avatar-ring">
                <TrucoAvatar username={profile.username} avatar={profile.avatar} size={72} className="public-profile-avatar-lg" />
              </div>
              <div className="public-profile-head-text">
                <div className="public-profile-name-row">
                  <h2 id="public-profile-title" className="public-profile-username">
                    {profile.username}
                  </h2>
                  {profile.identity_status === 'verified' ? (
                    <ShieldCheck className="public-profile-shield public-profile-shield--ok" size={18} aria-label="Identidad verificada" />
                  ) : (
                    <Shield className="public-profile-shield" size={18} aria-label="Identidad no verificada" />
                  )}
                </div>
                <p className="public-profile-elo">{profile.elo} pts</p>
              </div>
            </div>

            {profile.bio && <p className="public-profile-bio">{profile.bio}</p>}

            <div className="public-profile-stats">
              <div className="fx-card public-profile-stat">
                <span className="public-profile-stat-label">Victorias</span>
                <span className="public-profile-stat-value public-profile-stat-value--wins">{profile.wins}</span>
              </div>
              <div className="fx-card public-profile-stat">
                <span className="public-profile-stat-label">Derrotas</span>
                <span className="public-profile-stat-value public-profile-stat-value--losses">{profile.losses}</span>
              </div>
              <div className="fx-card public-profile-stat">
                <span className="public-profile-stat-label">Win rate</span>
                <span className="public-profile-stat-value">{profile.winrate != null ? `${profile.winrate}%` : '—'}</span>
              </div>
            </div>

            <div className="public-profile-actions">
              {status === 'self' && <p className="public-profile-self-note">Este es tu perfil</p>}

              {status === 'friends' && (
                <>
                  <span className="fx-badge public-profile-friend-badge">Ya son amigos</span>
                  <div className="public-profile-action-row">
                    {onStartChat && (
                      <button type="button" className="btn btn-primary btn-sm public-profile-action-btn" onClick={openChat}>
                        <MessageCircle size={16} aria-hidden /> Chat
                      </button>
                    )}
                    {typeof onChallengeFriend === 'function' && (
                      <button type="button" className="btn btn-secondary btn-sm public-profile-action-btn" onClick={challenge}>
                        <Swords size={16} aria-hidden /> Retar
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm public-profile-action-btn public-profile-action-btn--danger"
                      onClick={removeFriendship}
                      disabled={acting}
                    >
                      <UserMinus size={16} aria-hidden /> Quitar
                    </button>
                  </div>
                </>
              )}

              {status === 'request_sent' && (
                <button type="button" className="btn btn-secondary btn-block" disabled>
                  Solicitud enviada
                </button>
              )}

              {status === 'request_received' && (
                <div className="public-profile-request-block">
                  <p className="public-profile-request-lead">Te envió una solicitud de amistad</p>
                  <div className="public-profile-action-row">
                    <button type="button" className="btn btn-primary btn-sm" onClick={acceptIncoming} disabled={acting}>
                      {acting ? <Loader2 className="spin" size={16} /> : 'Aceptar'}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={rejectIncoming} disabled={acting}>
                      Rechazar
                    </button>
                  </div>
                </div>
              )}

              {status === 'none' && (
                <button
                  type="button"
                  className="btn btn-primary btn-block public-profile-friend-btn"
                  onClick={sendFriendReq}
                  disabled={acting}
                >
                  {acting ? (
                    <>
                      <Loader2 className="spin" size={16} aria-hidden /> Enviando…
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} aria-hidden /> Agregar amigo
                    </>
                  )}
                </button>
              )}

              {status === 'blocked' && <p className="public-profile-muted">No disponible</p>}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

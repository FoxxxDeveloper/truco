/**
 * PublicProfileModal — shows another user's public profile.
 *
 * Props:
 *   userId  number — the user to show
 *   onClose () => void
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Shield, ShieldCheck } from 'lucide-react';
import { usersApi, socialApi } from '../../services/api';
import toast from 'react-hot-toast';

function AvatarBig({ username, avatar, size = 72 }) {
  const [err, setErr] = useState(false);
  const initials = (username || '?').slice(0, 2).toUpperCase();
  const hue = [...(username || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatar && !err) {
    return (
      <img
        src={avatar}
        alt={username}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--gold)', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue},48%,30%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 900, color: '#fff',
      border: '3px solid var(--gold)', flexShrink: 0,
      fontFamily: 'var(--font-display)',
    }}>
      {initials}
    </div>
  );
}

export default function PublicProfileModal({ userId, onClose }) {
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [adding, setAdding]       = useState(false);
  const [friendSent, setFriendSent] = useState(false);

  useEffect(() => {
    usersApi.getPublic(userId)
      .then(res => setProfile(res.data))
      .catch(() => toast.error('No se pudo cargar el perfil'))
      .finally(() => setLoading(false));
  }, [userId]);

  const sendFriendReq = async () => {
    setAdding(true);
    try {
      await socialApi.sendFriendRequest(userId);
      toast.success('Solicitud enviada');
      setFriendSent(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar solicitud');
    } finally {
      setAdding(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300, padding: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, rgba(42,19,6,0.98), rgba(20,8,2,0.99))',
          border: '1px solid rgba(246,196,83,0.32)',
          borderRadius: 20, padding: 28,
          width: 380, maxWidth: '100%',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', padding: 4,
          }}
        >
          <X size={18} />
        </button>

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Cargando…
          </div>
        )}

        {!loading && profile && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
              <AvatarBig username={profile.username} avatar={profile.avatar} size={72} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-display)', color: 'var(--gold)' }}>
                    {profile.username}
                  </h2>
                  {profile.identity_status === 'verified' ? (
                    <ShieldCheck size={16} color="#22c55e" title="Identidad verificada" />
                  ) : (
                    <Shield size={16} color="var(--text-muted)" title="No verificado" />
                  )}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                  ELO {profile.elo}
                </div>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p style={{ color: 'var(--text-soft)', fontSize: 13, lineHeight: 1.65, marginBottom: 16 }}>
                {profile.bio}
              </p>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              {[
                ['Victorias', profile.wins, 'var(--gold)'],
                ['Derrotas',  profile.losses, '#ef4444'],
                ['Winrate',   `${profile.winrate}%`, 'var(--text)'],
              ].map(([label, val, color]) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
                  <div style={{ color, fontSize: 20, fontWeight: 900, fontFamily: 'var(--font-display)' }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={sendFriendReq}
              disabled={adding || friendSent}
            >
              {friendSent ? '✓ Solicitud enviada' : adding ? 'Enviando…' : '+ Agregar amigo'}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

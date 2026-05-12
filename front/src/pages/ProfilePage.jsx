import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { profileApi, rankingApi } from '../services/api';

// ── Avatar component ──────────────────────────────────────────────
function Avatar({ src, username, size = 100 }) {
  const [imgError, setImgError] = useState(false);
  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={username}
        onError={() => setImgError(true)}
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          border: '3px solid var(--border-gold)', display: 'block',
        }}
      />
    );
  }
  const initials = (username || '?').slice(0, 2).toUpperCase();
  const hue = [...(username || '')].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 900, fontSize: size * 0.36,
      background: `hsl(${hue},48%,32%)`, color: '#fff',
      border: '3px solid var(--border-gold)', flexShrink: 0,
      fontFamily: 'var(--font-display)',
    }}>
      {initials}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px', textAlign: 'center',
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 900, fontFamily: 'var(--font-display)' }}>{value}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [rank, setRank]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit mode
  const [editing, setEditing]         = useState(false);
  const [editBio, setEditBio]         = useState('');
  const [editAvatar, setEditAvatar]   = useState('');
  const [saving, setSaving]           = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    Promise.all([profileApi.getMe(), rankingApi.getMe().catch(() => null)])
      .then(([pRes, rRes]) => {
        setProfile(pRes.data);
        setEditBio(pRes.data.bio || '');
        setEditAvatar(pRes.data.avatar || '');
        if (rRes) setRank(rRes.data);
      })
      .catch(() => toast.error('Error al cargar perfil'))
      .finally(() => setLoading(false));
  }, []);

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await profileApi.uploadAvatar(file);
      if (res.data?.avatarUrl) {
        // The API returns a relative path like /uploads/avatars/avatar_1_12345.jpg
        // For requests from the browser, this needs to be resolved relative to the API origin
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const apiOrigin = API_BASE.replace('/api', ''); // Remove /api suffix to get origin
        const url = apiOrigin + res.data.avatarUrl;
        setProfile(prev => ({ ...prev, avatar: url }));
        setEditAvatar(url);
        toast.success('Avatar actualizado');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir imagen');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (editBio.length > 500) { toast.error('La bio no puede superar 500 caracteres'); return; }
    if (editAvatar && !/^https?:\/\/.+\..+/.test(editAvatar)) {
      toast.error('Ingresá una URL válida para el avatar (https://...)');
      return;
    }
    setSaving(true);
    try {
      const body = {};
      if (editBio !== (profile.bio || ''))         body.bio    = editBio.trim();
      if (editAvatar !== (profile.avatar || ''))   body.avatar = editAvatar.trim();
      if (Object.keys(body).length === 0) { setEditing(false); return; }

      const res = await profileApi.update(body);
      if (res.data.ok) {
        setProfile(prev => ({ ...prev, ...body }));
        toast.success('Perfil actualizado');
        setEditing(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (!profile) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        No se pudo cargar el perfil.
        <br /><button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/lobby')}>← Volver</button>
      </div>
    );
  }

  const total   = (profile.wins || 0) + (profile.losses || 0);
  const winrate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', padding: '0 0 60px' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '1rem 2rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/lobby')}>← Volver</button>
        <h1 style={{ margin: 0, fontSize: 18 }}>👤 Mi Perfil</h1>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: '2rem', marginBottom: 24, display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          {/* Avatar + edit button */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Avatar src={editing ? editAvatar : profile.avatar} username={profile.username} size={100} />
            {!editing ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                ✏️ Editar perfil
              </button>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={handleAvatarFileChange}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Upload size={13} />
                  {uploadingAvatar ? 'Subiendo...' : 'Subir foto'}
                </button>
              </>
            )}
          </div>

          {/* Info / edit form */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 24, fontFamily: 'var(--font-display)', color: 'var(--gold)' }}>
                {profile.username}
              </h2>
              {rank && (
                <span style={{ background: 'rgba(246,196,83,0.15)', border: '1px solid var(--border-gold)', borderRadius: 999, padding: '3px 12px', fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>
                  ELO {rank.elo}
                </span>
              )}
              {rank?.rank && (
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  Puesto #{rank.rank}
                </span>
              )}
            </div>

            {!editing ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
                {profile.bio || <em style={{ opacity: 0.5 }}>Sin bio todavía. ¡Editá tu perfil!</em>}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Avatar URL */}
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 5 }}>
                    URL de foto de perfil (https://…)
                  </label>
                  <input
                    type="url"
                    className="form-input"
                    style={{ width: '100%' }}
                    placeholder="https://i.pravatar.cc/150?u=juanmanuel"
                    value={editAvatar}
                    onChange={e => setEditAvatar(e.target.value)}
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Podés usar servicios como Gravatar, DiceBear, o cualquier imagen pública.
                  </p>
                </div>

                {/* Bio */}
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 5 }}>
                    Bio <span style={{ opacity: 0.5 }}>({editBio.length}/500)</span>
                  </label>
                  <textarea
                    className="form-input"
                    style={{ width: '100%', minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder="Contá algo sobre vos…"
                    maxLength={500}
                    value={editBio}
                    onChange={e => setEditBio(e.target.value)}
                  />
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-accept" onClick={handleSave} disabled={saving}>
                    {saving ? 'Guardando…' : '✓ Guardar'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setEditing(false); setEditBio(profile.bio || ''); setEditAvatar(profile.avatar || ''); }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}
        >
          <StatCard label="ELO" value={rank?.elo ?? profile.elo ?? 1000} color="var(--gold)" />
          <StatCard label="Victorias" value={profile.wins || 0} color="var(--green)" />
          <StatCard label="Derrotas" value={profile.losses || 0} color="var(--red)" />
          <StatCard label="Win Rate" value={`${winrate}%`} color={winrate >= 50 ? 'var(--green)' : 'var(--text-muted)'} />
          <StatCard label="Créditos" value={`${(profile.balance || 0).toFixed(0)} CRD`} color="var(--gold)" />
          {rank?.rank && <StatCard label="Ranking" value={`#${rank.rank}`} color="var(--text)" />}
        </motion.div>

        {/* Account info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Cuenta</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['Email', profile.email],
              ['Miembro desde', new Date(profile.created_at || Date.now()).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })],
              ['Telegram', profile.telegram_linked ? '✅ Vinculado' : '❌ No vinculado'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{label}</span>
                <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>{val}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

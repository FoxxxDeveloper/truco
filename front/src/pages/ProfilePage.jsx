import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { profileApi, rankingApi } from '../services/api';
import AppHeader from '../components/layout/AppHeader';
import TrucoAvatar from '../components/avatar/TrucoAvatar';
import { useAuth } from '../context/AuthContext';
import {
  encodeAvatarConfig,
  generateRandomAvataaarsConfig,
  isStorableTrucoFxAvatar,
} from '../utils/avatar';

function StatCard({ label, value, mod = '' }) {
  return (
    <div className={`fx-card profile-stat-card ${mod}`.trim()}>
      <span className="profile-stat-label">{label}</span>
      <span className="profile-stat-value">{value}</span>
    </div>
  );
}

function randomAvatarString(username) {
  const cfg = generateRandomAvataaarsConfig(username, `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  return encodeAvatarConfig(cfg);
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [rank, setRank] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  const [selectedAvatar, setSelectedAvatar] = useState(null);

  useEffect(() => {
    Promise.all([profileApi.getMe(), rankingApi.getMe().catch(() => null)])
      .then(([pRes, rRes]) => {
        setProfile(pRes.data);
        setEditBio(pRes.data.bio || '');
        if (rRes) setRank(rRes.data);
      })
      .catch(() => toast.error('Error al cargar perfil'))
      .finally(() => setLoading(false));
  }, []);

  const openEditProfile = () => {
    setEditBio(profile.bio || '');
    setSelectedAvatar(profile.avatar ?? null);
    setEditing(true);
  };

  const generateNextAvatar = () => {
    if (!profile?.username) return;
    const next = randomAvatarString(profile.username);
    if (next) setSelectedAvatar(next);
  };

  const bioChanged = editBio.trim() !== (profile?.bio || '').trim();
  const savedAvatar = profile?.avatar ?? '';
  const avatarChanged =
    Boolean(selectedAvatar)
    && isStorableTrucoFxAvatar(selectedAvatar)
    && String(selectedAvatar) !== String(savedAvatar);
  const hasChanges = bioChanged || avatarChanged;

  const handleSaveProfile = async () => {
    if (editBio.length > 500) {
      toast.error('La bio no puede superar 500 caracteres');
      return;
    }
    if (!hasChanges) {
      setEditing(false);
      return;
    }
    if (avatarChanged && (!selectedAvatar || !isStorableTrucoFxAvatar(selectedAvatar))) {
      toast.error('Generá un avatar con el botón antes de guardar');
      return;
    }
    setSaving(true);
    try {
      if (bioChanged) {
        await profileApi.update({ bio: editBio.trim() });
      }
      if (avatarChanged) {
        await profileApi.setAvatarChoice({ avatar: selectedAvatar });
      }
      const nextAvatar = avatarChanged ? selectedAvatar : profile.avatar;
      setProfile((prev) => ({
        ...prev,
        bio: editBio.trim(),
        avatar: nextAvatar,
      }));
      if (avatarChanged) {
        updateUser({ avatar: nextAvatar });
      }
      toast.success('Perfil actualizado');
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-page profile-page--et5 page-container app-page">
        <AppHeader />
        <div className="page-shell profile-page-shell--loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page profile-page--et5 page-container app-page profile-empty">
        <AppHeader />
        <div className="page-shell">
          <p>No se pudo cargar el perfil.</p>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/lobby')}>
            Volver al lobby
          </button>
        </div>
      </div>
    );
  }

  const total = (profile.wins || 0) + (profile.losses || 0);
  const winrate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;

  return (
    <div className="profile-page profile-page--et5 page-container app-page">
      <AppHeader />
      <div className="page-shell">
      <header className="profile-page-header profile-page-header--et5 profile-page-header--compact">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/lobby')}>
          ← Volver al lobby
        </button>
      </header>

      <motion.section
        className="fx-card profile-hero profile-hero--et5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="profile-hero-main">
          <div className="profile-avatar-column profile-hero-avatar-block">
            <div className="profile-avatar-wrap profile-avatar-wrap--et5">
              <TrucoAvatar
                avatar={editing ? (selectedAvatar ?? profile.avatar) : profile.avatar}
                username={profile.username}
                size={editing ? 120 : 112}
                className="profile-avatar-lg"
              />
            </div>
            {!editing ? (
              <button type="button" className="btn btn-gold btn-sm profile-edit-trigger" onClick={openEditProfile}>
                Editar perfil
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-secondary btn-sm profile-avatar-random-btn" onClick={generateNextAvatar}>
                  Generar otros
                </button>
                <p className="profile-avatar-save-hint">Se guarda al tocar Guardar cambios</p>
              </>
            )}
          </div>

          <div className="profile-hero-info">
            <div className="profile-name-row">
              <h1 className="profile-username">{profile.username}</h1>
              {rank && <span className="fx-badge fx-badge--gold">{rank.elo} pts</span>}
              {rank?.rank != null && <span className="fx-badge fx-badge--muted">Puesto #{rank.rank}</span>}
            </div>
            <div className="profile-history-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/partidas')}>
                Historial de partidas
              </button>
            </div>

            {!editing ? (
              <p className="profile-bio">
                {profile.bio || (
                  <span className="profile-bio-empty">Sin bio todavía. Editá tu perfil para contar algo sobre vos.</span>
                )}
              </p>
            ) : (
              <div className="profile-edit-fields">
                <div className="profile-avatar-section fx-card profile-photo-card profile-trucofx-avatar-card">
                  <h3 className="section-header profile-photo-title">Avatar TrucoFX</h3>
                  <p className="profile-photo-lead">Tu avatar actual se mantiene hasta que elijas otro.</p>
                  <p className="profile-field-hint">Usá &quot;Generar otros&quot; debajo de la foto solo si querés cambiarlo.</p>
                  <p className="profile-field-hint">Por seguridad, no usamos fotos ni links externos.</p>
                  <p className="profile-field-hint profile-avatar-section-inline-hint">
                    El cambio se ve en tu foto de la izquierda; usá el botón debajo del avatar.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="profile-bio">
                    Bio ({editBio.length}/500)
                  </label>
                  <textarea
                    id="profile-bio"
                    className="form-input"
                    rows={4}
                    maxLength={500}
                    placeholder="Contá algo sobre vos…"
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                  />
                </div>

                <div className="profile-edit-actions">
                  <button type="button" className="btn btn-primary" onClick={handleSaveProfile} disabled={saving || !hasChanges}>
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditing(false);
                      setEditBio(profile.bio || '');
                      setSelectedAvatar(profile.avatar ?? null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.section>

      <motion.div
        className="profile-stats-grid"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
      >
        <StatCard label="Puntos" value={rank?.elo ?? profile.elo ?? 1000} mod="profile-stat--elo" />
        <StatCard label="Victorias" value={profile.wins || 0} mod="profile-stat--wins" />
        <StatCard label="Derrotas" value={profile.losses || 0} mod="profile-stat--losses" />
        <StatCard label="Win rate" value={`${winrate}%`} mod={winrate >= 50 ? 'profile-stat--wr-good' : ''} />
        <StatCard label="Créditos" value={`${(profile.balance || 0).toFixed(0)} cr`} mod="profile-stat--credits" />
        {rank?.rank != null && <StatCard label="Ranking global" value={`#${rank.rank}`} />}
      </motion.div>

      <motion.section
        className="fx-card profile-account-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="section-header">Cuenta</h2>
        <dl className="profile-account-dl">
          <div className="profile-account-row">
            <dt>Email</dt>
            <dd>{profile.email}</dd>
          </div>
          <div className="profile-account-row">
            <dt>Miembro desde</dt>
            <dd>
              {new Date(profile.created_at || Date.now()).toLocaleDateString('es-AR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
          <div className="profile-account-row">
            <dt>Telegram</dt>
            <dd>{profile.telegram_linked ? 'Vinculado' : 'No vinculado'}</dd>
          </div>
        </dl>
      </motion.section>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { profileApi, rankingApi } from '../services/api';
import AppHeader from '../components/layout/AppHeader';
import TrucoAvatar from '../components/avatar/TrucoAvatar';
import { useAuth } from '../context/AuthContext';
import { generateAvatarOptions, isTrucoAvatar } from '../utils/avatar';

function StatCard({ label, value, mod = '' }) {
  return (
    <div className={`fx-card profile-stat-card ${mod}`.trim()}>
      <span className="profile-stat-label">{label}</span>
      <span className="profile-stat-value">{value}</span>
    </div>
  );
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
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [avatarOptions, setAvatarOptions] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

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

  useEffect(() => {
    if (!editing || !profile?.username) return;
    const opts = generateAvatarOptions(profile.username, 8, Date.now());
    setAvatarOptions(opts);
    if (isTrucoAvatar(profile.avatar)) {
      setSelectedCandidate(profile.avatar);
    } else {
      setSelectedCandidate(opts[0] ?? null);
    }
  }, [editing, profile?.username]);

  const regenerateAvatarOptions = () => {
    if (!profile?.username) return;
    const opts = generateAvatarOptions(profile.username, 8, Date.now());
    setAvatarOptions(opts);
    setSelectedCandidate(opts[0] ?? null);
  };

  const handleSaveBio = async () => {
    if (editBio.length > 500) {
      toast.error('La bio no puede superar 500 caracteres');
      return;
    }
    setSaving(true);
    try {
      if (editBio.trim() === (profile.bio || '').trim()) {
        setEditing(false);
        return;
      }
      const res = await profileApi.update({ bio: editBio.trim() });
      if (res.data.ok) {
        setProfile((prev) => ({ ...prev, bio: editBio.trim() }));
        toast.success('Perfil actualizado');
        setEditing(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!selectedCandidate || !isTrucoAvatar(selectedCandidate)) {
      toast.error('Elegí un avatar de la grilla');
      return;
    }
    setSavingAvatar(true);
    try {
      const res = await profileApi.setAvatarChoice({ avatar: selectedCandidate });
      const next = res.data?.avatar ?? selectedCandidate;
      setProfile((prev) => ({ ...prev, avatar: next }));
      updateUser({ avatar: next });
      toast.success('Avatar guardado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar el avatar');
    } finally {
      setSavingAvatar(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen profile-page profile-page--et5 page-shell">
        <AppHeader />
        <div className="spinner" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page profile-page--et5 page-shell profile-empty">
        <AppHeader />
        <p>No se pudo cargar el perfil.</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/lobby')}>
          Volver al lobby
        </button>
      </div>
    );
  }

  const total = (profile.wins || 0) + (profile.losses || 0);
  const winrate = total > 0 ? Math.round((profile.wins / total) * 100) : 0;

  return (
    <div className="profile-page profile-page--et5 page-shell">
      <AppHeader />
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
          <div className="profile-avatar-column">
            <div className="profile-avatar-wrap profile-avatar-wrap--et5">
              <TrucoAvatar avatar={profile.avatar} username={profile.username} size={112} className="profile-avatar-lg" />
            </div>
            {!editing ? (
              <button type="button" className="btn btn-gold btn-sm profile-edit-trigger" onClick={() => setEditing(true)}>
                Editar perfil
              </button>
            ) : null}
          </div>

          <div className="profile-hero-info">
            <div className="profile-name-row">
              <h1 className="profile-username">{profile.username}</h1>
              {rank && <span className="fx-badge fx-badge--gold">ELO {rank.elo}</span>}
              {rank?.rank != null && <span className="fx-badge fx-badge--muted">Puesto #{rank.rank}</span>}
            </div>

            {!editing ? (
              <p className="profile-bio">
                {profile.bio || (
                  <span className="profile-bio-empty">Sin bio todavía. Editá tu perfil para contar algo sobre vos.</span>
                )}
              </p>
            ) : (
              <div className="profile-edit-fields">
                <div className="profile-photo-block fx-card profile-photo-card profile-trucofx-avatar-card">
                  <h3 className="section-header profile-photo-title">Avatar TrucoFX</h3>
                  <p className="profile-photo-lead">Elegí un avatar inspirado en el Truco Argentino.</p>
                  <p className="profile-field-hint">Podés generar otro hasta encontrar uno que te guste.</p>
                  <p className="profile-field-hint">Por seguridad, no usamos fotos ni links externos.</p>

                  <div className="profile-trucofx-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={regenerateAvatarOptions}>
                      Generar otro
                    </button>
                    <button
                      type="button"
                      className="btn btn-gold btn-sm"
                      onClick={handleSaveAvatar}
                      disabled={savingAvatar || !selectedCandidate}
                    >
                      {savingAvatar ? 'Guardando…' : 'Guardar avatar'}
                    </button>
                  </div>

                  <p className="profile-sublabel">Opciones</p>
                  <div className="profile-preset-grid">
                    {avatarOptions.map((opt) => {
                      const active = selectedCandidate === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          className={`profile-preset-btn${active ? ' profile-preset-btn--active' : ''}`.trim()}
                          onClick={() => setSelectedCandidate(opt)}
                          title={opt}
                        >
                          <span className="profile-preset-icon profile-preset-icon--truco">
                            <TrucoAvatar avatar={opt} username={profile.username} size={48} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
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
                  <button type="button" className="btn btn-primary" onClick={handleSaveBio} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setEditing(false);
                      setEditBio(profile.bio || '');
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
        <StatCard label="ELO" value={rank?.elo ?? profile.elo ?? 1000} mod="profile-stat--elo" />
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
  );
}

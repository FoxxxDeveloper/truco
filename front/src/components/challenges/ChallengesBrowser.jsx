import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { challengeApi, walletApi } from '../../services/api';

const POINTS_OPTIONS = [15, 30];

export default function ChallengesBrowser({ onClose }) {
  const { user }  = useAuth();
  const [challenges, setChallenges] = useState([]);
  const [balance, setBalance]       = useState(null);
  const [tab, setTab]               = useState('open');
  const [form, setForm]             = useState({ amount: '', puntosMaximos: 30, florHabilitada: false });
  const [loading, setLoading]       = useState(false);

  const load = useCallback(async () => {
    try {
      const [chalRes, walRes] = await Promise.all([
        challengeApi.list(),
        walletApi.getBalance(),
      ]);
      setChallenges(chalRes.data.challenges || []);
      setBalance(parseFloat(walRes.data.balance));
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const createChallenge = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return toast.error('Monto inválido');
    if (balance !== null && amt > balance) return toast.error('Saldo insuficiente');
    setLoading(true);
    try {
      await challengeApi.create({
        amount: amt, isPrivate: false,
        gameConfig: { puntosMaximos: form.puntosMaximos, florHabilitada: form.florHabilitada, modo: 'apuesta' },
      });
      toast.success('Reto creado. Esperando rival…');
      setForm({ amount: '', puntosMaximos: 30, florHabilitada: false });
      setTab('open');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const acceptChallenge = async (challengeId) => {
    setLoading(true);
    try {
      await challengeApi.accept(challengeId);
      toast.success('¡Reto aceptado! Buscando partida…');
      onClose();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const cancelChallenge = async (id) => {
    try {
      await challengeApi.cancel(id);
      toast.success('Reto cancelado');
      load();
    } catch {
      toast.error('Error al cancelar');
    }
  };

  const myChallenges = challenges.filter(c => c.creator_id === user?.id);
  const otherChallenges = challenges.filter(c => c.creator_id !== user?.id);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', zIndex: 200 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 440, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>⚔️ Partidas apostadas</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>

        {balance !== null && (
          <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '8px 14px', marginBottom: 14, color: '#4ade80', fontWeight: 700 }}>
            💰 Saldo disponible: ${balance.toFixed(2)}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: 'var(--bg-surface)', borderRadius: 10, padding: 4 }}>
          {[['open', `Abiertas (${otherChallenges.length})`], ['mine', `Mis retos (${myChallenges.length})`], ['create', '+ Crear']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '7px 4px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: tab === id ? 'var(--accent-blue)' : 'transparent',
              color: tab === id ? '#fff' : 'var(--text-muted)',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {tab === 'open' && (
            otherChallenges.length === 0
              ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No hay retos abiertos</p>
              : otherChallenges.map(c => (
                <ChallengeCard key={c.id} c={c} onAccept={() => acceptChallenge(c.id)} loading={loading} />
              ))
          )}

          {tab === 'mine' && (
            myChallenges.length === 0
              ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No tenés retos activos</p>
              : myChallenges.map(c => (
                <ChallengeCard key={c.id} c={c} onCancel={() => cancelChallenge(c.id)} loading={loading} mine />
              ))
          )}

          {tab === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 6 }}>Monto apostado ($)</label>
                <input type="number" min="1" step="0.01" placeholder="Ej: 100"
                  value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="form-input" />
              </div>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 6 }}>Puntos para ganar</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {POINTS_OPTIONS.map(p => (
                    <button key={p} onClick={() => setForm(f => ({ ...f, puntosMaximos: p }))} style={{
                      flex: 1, padding: '9px 0', borderRadius: 8, border: `2px solid ${form.puntosMaximos === p ? 'var(--accent-blue)' : 'var(--border)'}`,
                      background: form.puntosMaximos === p ? 'rgba(31,111,235,0.15)' : 'var(--bg-surface)',
                      color: form.puntosMaximos === p ? 'var(--accent-blue)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer',
                    }}>{p} pts</button>
                  ))}
                </div>
              </div>
              <label style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={form.florHabilitada} onChange={e => setForm(f => ({ ...f, florHabilitada: e.target.checked }))}
                  style={{ width: 16, height: 16 }} />
                Flor habilitada
              </label>
              <button onClick={createChallenge} disabled={loading} className="btn btn-raise"
                style={{ width: '100%', padding: '12px 0', fontSize: 15 }}>
                {loading ? 'Creando…' : '⚔️ Publicar reto'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChallengeCard({ c, onAccept, onCancel, loading, mine }) {
  const expiresIn = Math.max(0, Math.floor((new Date(c.expires_at) - Date.now()) / 60000));
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 800, fontSize: 18 }}>
            💰 ${parseFloat(c.amount).toFixed(2)}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
            {mine ? 'Tu reto' : `por ${c.creator_username}`} · {c.game_config?.puntosMaximos || 30}pts
            {c.game_config?.florHabilitada ? ' · con Flor 🌸' : ''}
          </div>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, background: 'var(--bg-surface2)', padding: '3px 8px', borderRadius: 12 }}>
          {expiresIn > 0 ? `${expiresIn}min` : 'Expira pronto'}
        </div>
      </div>
      {mine
        ? <button onClick={onCancel} disabled={loading} className="btn btn-danger" style={{ width: '100%', fontSize: 13 }}>Cancelar reto</button>
        : <button onClick={onAccept} disabled={loading} className="btn btn-raise" style={{ width: '100%', fontSize: 14 }}>⚔️ Aceptar reto</button>
      }
    </div>
  );
}


  const acceptChallenge = async (challengeId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/challenges/${challengeId}/accept`, { method: 'POST', headers: h });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success('¡Reto aceptado! Buscando partida…');
      onClose();
      // Join the room created by acceptChallenge
      if (data.roomId && joinQueue) {
        // Handled by matchmaking socket — room is already created in backend
      }
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cancelChallenge = async (id) => {
    const res = await fetch(`${API}/api/challenges/${id}`, { method: 'DELETE', headers: h });
    if (res.ok) { toast.success('Reto cancelado'); load(); }
    else toast.error('Error al cancelar');
  };

  const myChallenges = challenges.filter(c => c.creator_id === user?.id);
  const otherChallenges = challenges.filter(c => c.creator_id !== user?.id);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 100 }}
      onClick={onClose}
    >
      <motion.div
        style={{ background: '#1e2a3a', borderRadius: 16, padding: 24, width: 420, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: '#fff' }}>⚔️ Partidas con apuestas</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {balance !== null && (
          <div style={{ background: '#243447', borderRadius: 8, padding: '8px 14px', marginBottom: 12, color: '#4ade80', fontWeight: 700 }}>
            💰 Saldo: ${balance.toFixed(2)}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['open', `Abiertas (${otherChallenges.length})`], ['mine', `Mis retos (${myChallenges.length})`], ['create', 'Crear']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === id ? '#3b82f6' : '#243447', color: '#fff', fontWeight: 600, fontSize: 12,
            }}>{label}</button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Open challenges from others */}
          {tab === 'open' && (
            otherChallenges.length === 0
              ? <p style={{ color: '#9ca3af', textAlign: 'center' }}>No hay retos abiertos</p>
              : otherChallenges.map(c => (
                <ChallengeCard key={c.id} c={c} onAccept={() => acceptChallenge(c.id)} loading={loading} />
              ))
          )}

          {/* User's own open challenges */}
          {tab === 'mine' && (
            myChallenges.length === 0
              ? <p style={{ color: '#9ca3af', textAlign: 'center' }}>No tenés retos activos</p>
              : myChallenges.map(c => (
                <ChallengeCard key={c.id} c={c} onCancel={() => cancelChallenge(c.id)} loading={loading} mine />
              ))
          )}

          {/* Create form */}
          {tab === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ color: '#9ca3af', fontSize: 13 }}>Monto apostado ($)</label>
              <input
                type="number" min="1" step="0.01" placeholder="Ej: 100"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#243447', color: '#fff' }}
              />

              <label style={{ color: '#9ca3af', fontSize: 13 }}>Puntos máximos</label>
              <select value={form.puntosMaximos} onChange={e => setForm(f => ({ ...f, puntosMaximos: Number(e.target.value) }))}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#243447', color: '#fff' }}>
                {POINTS_OPTIONS.map(p => <option key={p} value={p}>{p} puntos</option>)}
              </select>

              <label style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.florHabilitada} onChange={e => setForm(f => ({ ...f, florHabilitada: e.target.checked }))} />
                Flor habilitada
              </label>

              <button onClick={createChallenge} disabled={loading} style={{
                padding: '12px 0', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: '#d97706', color: '#111', fontWeight: 700, fontSize: 15, marginTop: 4,
              }}>
                {loading ? 'Creando…' : '⚔️ Crear reto'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChallengeCard({ c, onAccept, onCancel, loading, mine }) {
  const expiresIn = Math.max(0, Math.floor((new Date(c.expires_at) - Date.now()) / 60000));

  return (
    <div style={{ background: '#243447', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
            💰 ${parseFloat(c.amount).toFixed(2)}
          </div>
          <div style={{ color: '#9ca3af', fontSize: 12 }}>
            {mine ? 'Tu reto' : `por ${c.creator_username}`} · {c.game_config?.puntosMaximos || 30}pts
            {c.game_config?.florHabilitada ? ' · con Flor' : ''}
          </div>
        </div>
        <div style={{ color: '#6b7280', fontSize: 11 }}>
          {expiresIn > 0 ? `Expira en ${expiresIn}min` : 'Expira pronto'}
        </div>
      </div>
      {mine
        ? <button onClick={onCancel} disabled={loading} style={{
          width: '100%', padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: '#7f1d1d', color: '#fff', fontWeight: 600,
        }}>Cancelar</button>
        : <button onClick={onAccept} disabled={loading} style={{
          width: '100%', padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: '#d97706', color: '#111', fontWeight: 700,
        }}>⚔️ Aceptar reto</button>
      }
    </div>
  );
}

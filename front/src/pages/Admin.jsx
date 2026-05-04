import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../services/api';
import toast from 'react-hot-toast';

const TABS = ['Dashboard', 'Usuarios', 'Transacciones', 'Partidas', 'Auditoría'];

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab]       = useState('Dashboard');
  const [data, setData]     = useState({});
  const [loading, setLoading] = useState(true);

  // Guard: only admins
  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/lobby');
  }, [user, navigate]);

  useEffect(() => { loadTab(tab); }, [tab]);

  const loadTab = async (t) => {
    setLoading(true);
    try {
      if (t === 'Dashboard') {
        const r = await adminApi.dashboard();
        setData(r.data);
      } else if (t === 'Usuarios') {
        const r = await adminApi.listUsers();
        setData({ users: r.data.users });
      } else if (t === 'Transacciones') {
        const r = await adminApi.listTransactions({ status: 'pending' });
        setData({ transactions: r.data.transactions });
      } else if (t === 'Partidas') {
        const r = await adminApi.listGames();
        setData({ games: r.data.games });
      } else if (t === 'Auditoría') {
        const r = await adminApi.listTransactions({});
        setData({ logs: r.data.transactions });
      }
    } catch (err) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (userId, field, value) => {
    try {
      await adminApi.updateUser(userId, { [field]: value });
      toast.success('Usuario actualizado');
      loadTab('Usuarios');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const approveTransaction = async (id) => {
    try {
      await adminApi.approveDeposit(id);
      toast.success('Transacción aprobada');
      loadTab('Transacciones');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const rejectTransaction = async (id) => {
    const reason = prompt('Motivo del rechazo:');
    if (!reason) return;
    try {
      await adminApi.rejectDeposit(id, { reason });
      toast.success('Transacción rechazada');
      loadTab('Transacciones');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '1rem 2rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => navigate('/lobby')} className="btn btn-ghost btn-sm">← Lobby</button>
        <h1 style={{ fontSize: 18, margin: 0 }}>🛡️ Panel de Administración</h1>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>
          Admin: <strong>{user?.username}</strong>
        </span>
      </header>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            color: tab === t ? 'var(--accent-blue)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
        {loading && <div className="spinner-center"><div className="spinner" /></div>}

        {/* Dashboard */}
        {!loading && tab === 'Dashboard' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {[
              ['👥 Usuarios', data.users, '#4ade80'],
              ['🎮 Partidas activas', data.activeGames, '#60a5fa'],
              ['⏳ Txs pendientes', data.pendingTxs, '#fb923c'],
              ['💰 Saldo total', `$${(data.totalBalance || 0).toFixed(2)}`, '#facc15'],
              ['⚔️ Retos abiertos', data.openChallenges, '#c084fc'],
            ].map(([label, val, color]) => (
              <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>{label}</div>
                <div style={{ color, fontSize: 28, fontWeight: 800 }}>{val ?? '—'}</div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Users */}
        {!loading && tab === 'Usuarios' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['ID', 'Usuario', 'Email', 'Rol', 'Estado', 'ELO', 'Saldo', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.users || []).map(u => (
                  <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{u.id}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.username}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{u.email}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <select value={u.role} onChange={e => updateUser(u.id, 'role', e.target.value)}
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <select value={u.status} onChange={e => updateUser(u.id, 'status', e.target.value)}
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: u.status === 'active' ? '#4ade80' : '#f87171', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                        <option value="active">active</option>
                        <option value="suspended">suspended</option>
                        <option value="banned">banned</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--accent-gold)', fontWeight: 700 }}>{u.elo}</td>
                    <td style={{ padding: '10px 14px', color: '#4ade80', fontWeight: 600 }}>${parseFloat(u.balance || 0).toFixed(2)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const amt = prompt(`Ajuste de balance para ${u.username} (negativo para deducir):`);
                          if (!amt) return;
                          const reason = prompt('Motivo:');
                          if (!reason) return;
                          adminApi.adjustBalance(u.id, { amount: parseFloat(amt), reason })
                            .then(() => { toast.success('Balance ajustado'); loadTab('Usuarios'); })
                            .catch(e => toast.error(e.response?.data?.error || 'Error'));
                        }}>
                        $ Ajustar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Transactions */}
        {!loading && tab === 'Transacciones' && (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 13 }}>Mostrando transacciones pendientes. Aprobar o rechazar:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(data.transactions || []).length === 0
                ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Sin transacciones pendientes</p>
                : (data.transactions || []).map(tx => (
                  <div key={tx.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{tx.username} — <span style={{ color: tx.type === 'deposit' ? '#4ade80' : '#f87171', textTransform: 'capitalize' }}>{tx.type}</span></div>
                      <div style={{ color: 'var(--accent-gold)', fontSize: 18, fontWeight: 800 }}>${parseFloat(tx.amount).toFixed(2)}</div>
                      {tx.reference && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Ref: {tx.reference}</div>}
                      <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{new Date(tx.created_at).toLocaleString('es-AR')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-accept btn-sm" onClick={() => approveTransaction(tx.id)}>✓ Aprobar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => rejectTransaction(tx.id)}>✗ Rechazar</button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* Games */}
        {!loading && tab === 'Partidas' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['Room', 'Jugador 1', 'Jugador 2', 'Estado', 'Ganador', 'Inicio'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.games || []).map(g => (
                  <tr key={g.room_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{g.room_id?.substring(0, 8)}…</td>
                    <td style={{ padding: '10px 14px' }}>{g.player1_username}</td>
                    <td style={{ padding: '10px 14px' }}>{g.player2_username}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                        background: g.status === 'active' ? 'rgba(74,222,128,0.1)' : g.status === 'finished' ? 'rgba(31,111,235,0.1)' : 'rgba(248,113,113,0.1)',
                        color: g.status === 'active' ? '#4ade80' : g.status === 'finished' ? '#60a5fa' : '#f87171',
                      }}>{g.status}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--accent-gold)', fontWeight: 600 }}>{g.winner_username || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                      {g.started_at ? new Date(g.started_at).toLocaleString('es-AR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Audit logs (reusing transaction list here for display) */}
        {!loading && tab === 'Auditoría' && (
          <div style={{ overflowX: 'auto' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 13 }}>
              Historial de transacciones completo (más recientes primero)
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['ID', 'Usuario', 'Tipo', 'Monto', 'Estado', 'Referencia', 'Fecha'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.logs || []).map(tx => (
                  <tr key={tx.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{tx.id}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{tx.username}</td>
                    <td style={{ padding: '10px 14px', textTransform: 'capitalize', fontSize: 12 }}>{tx.type}</td>
                    <td style={{ padding: '10px 14px', color: ['deposit','prize','bet_win'].includes(tx.type) ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {['deposit','prize','bet_win'].includes(tx.type) ? '+' : '−'}${Math.abs(parseFloat(tx.amount)).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, textTransform: 'capitalize', color: tx.status === 'completed' ? '#4ade80' : tx.status === 'pending' ? '#fb923c' : '#f87171' }}>
                      {tx.status}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 11 }}>{tx.reference || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 11 }}>
                      {new Date(tx.created_at).toLocaleString('es-AR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

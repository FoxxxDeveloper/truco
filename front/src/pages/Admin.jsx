import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../services/api';
import toast from 'react-hot-toast';

const TABS = ['Dashboard', 'Cajero', 'Usuarios', 'Transacciones', 'Partidas', 'Auditoría'];

// ─── Cashier Panel ─────────────────────────────────────────────────
function CajeroPanel() {
  const [search, setSearch]   = useState('');
  const [users, setUsers]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount]   = useState('');
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);

  const searchUsers = async () => {
    if (!search.trim()) return;
    try {
      const r = await adminApi.listUsers({ search: search.trim(), limit: 10, offset: 0 });
      setUsers(r.data.users || []);
    } catch {
      toast.error('Error al buscar usuarios');
    }
  };

  const handleAdjust = async (delta) => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Monto inválido'); return; }
    if (!reason.trim())   { toast.error('Ingresá un motivo'); return; }
    if (!selected)        { toast.error('Seleccioná un usuario'); return; }
    setLoading(true);
    try {
      await adminApi.adjustBalance(selected.id, {
        amount: delta > 0 ? amt : -amt,
        reason: reason.trim(),
      });
      toast.success(`${delta > 0 ? '+' : '−'}${amt} CRD → ${selected.username}`);
      // Refresh user list to show updated balance
      const r = await adminApi.listUsers({ search: search.trim(), limit: 10, offset: 0 });
      setUsers(r.data.users || []);
      setSelected(prev => (r.data.users || []).find(u => u.id === prev?.id) || null);
      setAmount('');
      setReason('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al ajustar créditos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

      {/* Left: user search */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--gold)' }}>🔍 Buscar jugador</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="Username o email"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchUsers()}
          />
          <button className="btn btn-ghost btn-sm" onClick={searchUsers}>Buscar</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {users.map(u => (
            <div
              key={u.id}
              onClick={() => setSelected(u)}
              style={{
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                background: selected?.id === u.id ? 'rgba(246,196,83,0.12)' : 'var(--bg-surface)',
                border: `1px solid ${selected?.id === u.id ? 'var(--border-gold)' : 'var(--border)'}`,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{u.username}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.email}</div>
              <div style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                🪙 {parseFloat(u.balance || 0).toFixed(0)} CRD
                {parseFloat(u.reserved || 0) > 0 && (
                  <span style={{ color: '#fb923c', fontWeight: 400, marginLeft: 8 }}>
                    🔒 {parseFloat(u.reserved).toFixed(0)} reservados
                  </span>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 12 }}>
              Buscá un jugador para empezar
            </p>
          )}
        </div>
      </div>

      {/* Right: adjustment form */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--gold)' }}>🪙 Ajuste de créditos</h3>
        {selected ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              Jugador: <strong style={{ color: 'var(--text)' }}>{selected.username}</strong>
              {' · '}Saldo actual: <strong style={{ color: 'var(--gold)' }}>{parseFloat(selected.balance || 0).toFixed(0)} CRD</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 6 }}>Cantidad de créditos</label>
                <input type="number" min="1" step="1" placeholder="500" className="form-input" style={{ width: '100%' }}
                  value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'block', marginBottom: 6 }}>Motivo / referencia</label>
                <input type="text" placeholder="Depósito MP confirmado" className="form-input" style={{ width: '100%' }}
                  value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  className="btn btn-accept"
                  style={{ flex: 1, padding: '11px 0' }}
                  disabled={loading}
                  onClick={() => handleAdjust(1)}
                >
                  {loading ? '…' : '➕ Acreditar CRD'}
                </button>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, padding: '11px 0' }}
                  disabled={loading}
                  onClick={() => handleAdjust(-1)}
                >
                  {loading ? '…' : '➖ Deducir CRD'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '2rem 0' }}>
            Seleccioná un jugador de la lista
          </p>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab]         = useState('Dashboard');
  const [data, setData]       = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/lobby');
  }, [user, navigate]);

  const loadTab = useCallback(async (t) => {
    if (t === 'Cajero') { setLoading(false); return; } // cashier is self-contained
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
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

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
      toast.success('Transacción aprobada ✓');
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '1rem 2rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => navigate('/lobby')} className="btn btn-ghost btn-sm">← Lobby</button>
        <h1 style={{ fontSize: 18, margin: 0 }}>🛡️ Panel de Administración</h1>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>
          Admin: <strong style={{ color: 'var(--gold)' }}>{user?.username}</strong>
        </span>
      </header>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            color: tab === t ? 'var(--gold)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
        {loading && tab !== 'Cajero' && <div className="spinner-center"><div className="spinner" /></div>}

        {/* ─── Dashboard ─── */}
        {!loading && tab === 'Dashboard' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
              {[
                ['👥 Usuarios', data.users, '#4ade80'],
                ['🎮 Partidas activas', data.activeGames, '#60a5fa'],
                ['⏳ Solicitudes pendientes', data.pendingTxs, '#fb923c'],
                ['🪙 Créditos totales', `${(data.totalBalance || 0).toFixed(0)} CRD`, '#facc15'],
                ['⚔️ Retos abiertos', data.openChallenges, '#c084fc'],
              ].map(([label, val, color]) => (
                <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', textAlign: 'center' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>{label}</div>
                  <div style={{ color, fontSize: 26, fontWeight: 800 }}>{val ?? '—'}</div>
                </motion.div>
              ))}
            </div>
            {data.pendingTxs > 0 && (
              <div style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 12, padding: '14px 20px', color: '#fb923c', fontWeight: 600 }}>
                ⚠️ Hay {data.pendingTxs} solicitud{data.pendingTxs !== 1 ? 'es' : ''} de créditos pendiente{data.pendingTxs !== 1 ? 's' : ''} de aprobación.
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }} onClick={() => setTab('Transacciones')}>
                  Ver solicitudes →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Cajero ─── */}
        {tab === 'Cajero' && <CajeroPanel />}

        {/* ─── Users ─── */}
        {!loading && tab === 'Usuarios' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['ID', 'Usuario', 'Email', 'Rol', 'Estado', 'ELO', 'Créditos', 'Acciones'].map(h => (
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
                    <td style={{ padding: '10px 14px', color: 'var(--gold)', fontWeight: 700 }}>{u.elo}</td>
                    <td style={{ padding: '10px 14px', color: '#4ade80', fontWeight: 600 }}>
                      {parseFloat(u.balance || 0).toFixed(0)} CRD
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setTab('Cajero');
                        }}
                        title="Ir al Cajero para ajustar créditos"
                      >
                        🪙 Cajero
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Transacciones ─── */}
        {!loading && tab === 'Transacciones' && (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13 }}>
              Solicitudes de carga/retiro de créditos pendientes de aprobación:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(data.transactions || []).length === 0
                ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>✓ Sin solicitudes pendientes</p>
                : (data.transactions || []).map(tx => (
                  <div key={tx.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        {tx.username}
                        <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: tx.type === 'deposit' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', color: tx.type === 'deposit' ? '#4ade80' : '#f87171' }}>
                          {tx.type === 'deposit' ? '⬆ CARGA' : '⬇ RETIRO'}
                        </span>
                      </div>
                      <div style={{ color: 'var(--gold)', fontSize: 22, fontWeight: 900 }}>
                        {parseFloat(tx.amount).toFixed(0)} CRD
                      </div>
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

        {/* ─── Games ─── */}
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
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', background: g.status === 'active' ? 'rgba(74,222,128,0.1)' : 'rgba(31,111,235,0.1)', color: g.status === 'active' ? '#4ade80' : '#60a5fa' }}>
                        {g.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--gold)', fontWeight: 600 }}>{g.winner_username || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                      {g.started_at ? new Date(g.started_at).toLocaleString('es-AR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Auditoría ─── */}
        {!loading && tab === 'Auditoría' && (
          <div style={{ overflowX: 'auto' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 13 }}>Historial completo de movimientos de créditos (más recientes primero)</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['ID', 'Usuario', 'Tipo', 'Créditos', 'Estado', 'Referencia', 'Fecha'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.logs || []).map(tx => (
                  <tr key={tx.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{tx.id}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{tx.username}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{tx.type}</td>
                    <td style={{ padding: '10px 14px', color: ['deposit','prize','bet_win','refund','bet_refund'].includes(tx.type) ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {['deposit','prize','bet_win','refund','bet_refund'].includes(tx.type) ? '+' : '−'}{Math.abs(parseFloat(tx.amount)).toFixed(0)} CRD
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: tx.status === 'completed' ? '#4ade80' : tx.status === 'pending' ? '#fb923c' : '#f87171' }}>
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


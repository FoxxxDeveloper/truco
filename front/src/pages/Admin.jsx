import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Gamepad2,
  Clock,
  Coins,
  Swords,
  Search,
  Plus,
  Minus,
  Shield,
  ArrowLeft,
  AlertTriangle,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  X,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../services/api';
import toast from 'react-hot-toast';
import TournamentAdminPanel from '../components/admin/TournamentAdminPanel';
import BrandNavLockup from '../components/brand/BrandNavLockup';

const TABS = ['Dashboard', 'Cajero', 'Usuarios', 'Transacciones', 'Partidas', 'Auditoría', 'Verificaciones', 'Torneos'];

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
    <div className="admin-cajero-grid">
      <div className="fx-card admin-cajero-card">
        <h3 className="section-header admin-cajero-card-title">Buscar jugador</h3>
        <div className="admin-cajero-search-row">
          <input
            className="form-input admin-cajero-search-input"
            placeholder="Username o email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
          />
          <button type="button" className="btn btn-secondary btn-sm admin-cajero-search-btn" onClick={searchUsers}>
            <Search size={16} aria-hidden />
            Buscar
          </button>
        </div>
        <div className="admin-cajero-user-list">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`admin-cajero-user-row${selected?.id === u.id ? ' admin-cajero-user-row--selected' : ''}`.trim()}
              onClick={() => setSelected(u)}
            >
              <div className="admin-cajero-user-name">{u.username}</div>
              <div className="admin-cajero-user-email">{u.email}</div>
              <div className="admin-cajero-user-balance">
                <Coins size={14} aria-hidden />
                {parseFloat(u.balance || 0).toFixed(0)} CRD
                {parseFloat(u.reserved || 0) > 0 && (
                  <span className="admin-cajero-reserved">Reservado: {parseFloat(u.reserved).toFixed(0)}</span>
                )}
              </div>
            </button>
          ))}
          {users.length === 0 && <p className="admin-cajero-empty">Buscá un jugador para empezar</p>}
        </div>
      </div>

      <div className="fx-card admin-cajero-card">
        <h3 className="section-header admin-cajero-card-title">Ajuste de créditos</h3>
        {selected ? (
          <>
            <p className="admin-cajero-selected-meta">
              Jugador: <strong>{selected.username}</strong>
              {' · '}
              Saldo: <strong className="admin-cajero-saldo-strong">{parseFloat(selected.balance || 0).toFixed(0)} CRD</strong>
            </p>
            <div className="admin-cajero-form">
              <div className="form-group">
                <label className="form-label" htmlFor="cajero-amount">
                  Cantidad de créditos
                </label>
                <input
                  id="cajero-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="500"
                  className="form-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cajero-reason">
                  Motivo / referencia
                </label>
                <input
                  id="cajero-reason"
                  type="text"
                  placeholder="Depósito MP confirmado"
                  className="form-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="admin-cajero-actions">
                <button type="button" className="btn btn-accept btn-sm admin-cajero-action-btn" disabled={loading} onClick={() => handleAdjust(1)}>
                  <Plus size={16} aria-hidden />
                  {loading ? '…' : 'Acreditar'}
                </button>
                <button type="button" className="btn btn-danger btn-sm admin-cajero-action-btn" disabled={loading} onClick={() => handleAdjust(-1)}>
                  <Minus size={16} aria-hidden />
                  {loading ? '…' : 'Deducir'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="admin-cajero-placeholder">Seleccioná un jugador de la lista</p>
        )}
      </div>
    </div>
  );
}

// ─── Verifications Panel ───────────────────────────────────────────────────
function VerificationsPanel() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [working, setWorking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.listVerifications({ status: statusFilter });
      setList(r.data.verifications || []);
    } catch {
      toast.error('Error cargando verificaciones');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (userId, username) => {
    if (!window.confirm(`¿Aprobar verificación de ${username}?`)) return;
    setWorking(userId);
    try {
      await adminApi.approveVerification(userId);
      toast.success(`Verificación de ${username} aprobada`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aprobar');
    } finally {
      setWorking(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) {
      toast.error('El motivo es obligatorio');
      return;
    }
    setWorking(rejectTarget.user_id);
    try {
      await adminApi.rejectVerification(rejectTarget.user_id, { reason: rejectReason });
      toast.success(`Verificación de ${rejectTarget.username} rechazada`);
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al rechazar');
    } finally {
      setWorking(null);
    }
  };

  const statusBadgeClass = (s) => {
    if (s === 'verified') return 'admin-verif-badge admin-verif-badge--ok';
    if (s === 'pending') return 'admin-verif-badge admin-verif-badge--pending';
    if (s === 'rejected') return 'admin-verif-badge admin-verif-badge--reject';
    return 'admin-verif-badge admin-verif-badge--muted';
  };

  return (
    <div className="admin-verif-panel">
      <div className="admin-verif-toolbar">
        <h3 className="admin-verif-title">Verificaciones de identidad</h3>
        <select
          className="form-input admin-verif-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {['pending', 'verified', 'rejected', 'all'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm admin-verif-refresh" onClick={load}>
          ↻ Actualizar
        </button>
      </div>

      {loading && <p className="admin-verif-loading">Cargando…</p>}

      {!loading && list.length === 0 && (
        <p className="admin-verif-empty">No hay solicitudes con estado &quot;{statusFilter}&quot;.</p>
      )}

      {!loading && list.length > 0 && (
        <div className="admin-verif-table-wrap">
          <table className="admin-verif-table">
            <thead>
              <tr>
                {['Usuario', 'Nombre legal', 'Documento', 'Nacimiento', 'País', 'Estado', 'Enviado', 'Acciones'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.user_id}>
                  <td>
                    <span className="admin-verif-username">{v.username}</span>
                    <br />
                    <span className="admin-verif-email">{v.email}</span>
                  </td>
                  <td>
                    {v.legal_first_name} {v.legal_last_name}
                  </td>
                  <td className="admin-verif-muted">
                    {v.document_type?.toUpperCase()}: {v.document_number_masked}
                  </td>
                  <td className="admin-verif-muted">{v.date_of_birth ? new Date(v.date_of_birth).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="admin-verif-muted">
                    {v.country}
                    {v.province ? `, ${v.province}` : ''}
                  </td>
                  <td>
                    <span className={statusBadgeClass(v.identity_status)}>{v.identity_status}</span>
                    {v.rejection_reason && (
                      <span className="admin-verif-reject-hint" title={v.rejection_reason}>
                        <Info size={13} aria-hidden />
                      </span>
                    )}
                  </td>
                  <td className="admin-verif-muted">{new Date(v.created_at).toLocaleDateString('es-AR')}</td>
                  <td className="admin-verif-actions">
                    {v.identity_status === 'pending' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-accept btn-sm admin-verif-btn-approve"
                          onClick={() => handleApprove(v.user_id, v.username)}
                          disabled={working === v.user_id}
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm admin-verif-btn-reject"
                          onClick={() => {
                            setRejectTarget(v);
                            setRejectReason('');
                          }}
                          disabled={working === v.user_id}
                        >
                          Rechazar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejectTarget && (
        <div className="admin-verif-modal-overlay" role="presentation">
          <div className="fx-card admin-verif-modal" role="dialog" aria-modal="true" aria-labelledby="admin-verif-reject-title">
            <h3 id="admin-verif-reject-title" className="admin-verif-modal-title">
              Rechazar verificación
            </h3>
            <p className="admin-verif-modal-user">
              Usuario: <strong>{rejectTarget.username}</strong>
            </p>
            <textarea
              className="form-input admin-verif-reject-textarea"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo (obligatorio)"
              maxLength={500}
              rows={4}
            />
            <div className="admin-verif-modal-actions">
              <button
                type="button"
                className="btn btn-danger btn-reject admin-verif-modal-confirm"
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim() || working !== null}
              >
                Confirmar rechazo
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setRejectTarget(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
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
    if (t === 'Cajero' || t === 'Torneos' || t === 'Verificaciones') {
      setLoading(false);
      return;
    }
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

  const statusBadgeClass = (status) => {
    if (status === 'active') return 'admin-status-badge admin-status-badge--active';
    if (status === 'suspended') return 'admin-status-badge admin-status-badge--suspended';
    if (status === 'banned') return 'admin-status-badge admin-status-badge--banned';
    return 'admin-status-badge admin-status-badge--muted';
  };

  const roleBadgeClass = (role) =>
    role === 'admin' ? 'admin-role-badge admin-role-badge--admin' : 'admin-role-badge admin-role-badge--user';

  return (
    <div className="admin-page">
      <div className="page-shell admin-page-shell">
        <header className="admin-hero fx-card">
          <div className="admin-hero-top">
            <button type="button" className="btn btn-ghost btn-sm admin-hero-back" onClick={() => navigate('/lobby')}>
              <ArrowLeft size={18} aria-hidden />
              Volver al lobby
            </button>
            <BrandNavLockup className="admin-hero-brand" size="sm" showSubtitle={false} />
            <div className="admin-hero-admin-chip fx-badge fx-badge--muted">
              <Shield size={12} aria-hidden />
              <span>
                Admin: <strong>{user?.username}</strong>
              </span>
            </div>
          </div>
          <h1 className="admin-hero-title">Panel de administración</h1>
          <p className="admin-hero-sub">Gestión de usuarios, torneos, wallet y seguridad</p>
        </header>

        <nav className="admin-tabs" aria-label="Secciones del panel">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`admin-tab${tab === t ? ' admin-tab--active' : ''}`.trim()}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="admin-body">
          {loading && tab !== 'Cajero' && tab !== 'Torneos' && tab !== 'Verificaciones' && (
            <div className="spinner-center">
              <div className="spinner" />
            </div>
          )}

          {!loading && tab === 'Dashboard' && (
            <div className="admin-dashboard">
              <div className="admin-metrics-grid">
                {[
                  { label: 'Usuarios', icon: Users, value: data.users, mod: 'admin-metric--users' },
                  { label: 'Partidas activas', icon: Gamepad2, value: data.activeGames, mod: 'admin-metric--games' },
                  { label: 'Solicitudes pendientes', icon: Clock, value: data.pendingTxs, mod: 'admin-metric--pending' },
                  { label: 'Créditos en sistema', icon: Coins, value: `${(data.totalBalance ?? 0).toFixed(0)} CRD`, mod: 'admin-metric--credits' },
                  { label: 'Retos abiertos', icon: Swords, value: data.openChallenges, mod: 'admin-metric--challenges' },
                ].map(({ label, icon: Icon, value, mod }) => (
                  <motion.div
                    key={label}
                    className={`fx-card admin-metric-card ${mod}`.trim()}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="admin-metric-icon-wrap" aria-hidden>
                      <Icon size={22} />
                    </div>
                    <div className="admin-metric-label">{label}</div>
                    <div className="admin-metric-value">{value ?? '—'}</div>
                  </motion.div>
                ))}
              </div>
              {data.pendingTxs > 0 && (
                <div className="fx-card admin-alert-pending">
                  <AlertTriangle className="admin-alert-icon" size={20} aria-hidden />
                  <span>
                    Hay {data.pendingTxs} solicitud{data.pendingTxs !== 1 ? 'es' : ''} de créditos pendiente{data.pendingTxs !== 1 ? 's' : ''} de
                    aprobación.
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm admin-alert-btn" onClick={() => setTab('Transacciones')}>
                    Ver solicitudes
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'Cajero' && <CajeroPanel />}

          {!loading && tab === 'Usuarios' && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {['ID', 'Usuario', 'Email', 'Rol', 'Estado', 'ELO', 'Créditos', 'Acciones'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.users || []).map((u) => (
                    <tr key={u.id}>
                      <td className="admin-table-muted">{u.id}</td>
                      <td className="admin-table-strong">{u.username}</td>
                      <td className="admin-table-muted">{u.email}</td>
                      <td>
                        <div className="admin-table-cell-stack">
                          <span className={roleBadgeClass(u.role)}>{u.role}</span>
                          <select
                            value={u.role}
                            className="form-input admin-table-select"
                            onChange={(e) => updateUser(u.id, 'role', e.target.value)}
                          >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                          </select>
                        </div>
                      </td>
                      <td>
                        <div className="admin-table-cell-stack">
                          <span className={statusBadgeClass(u.status)}>{u.status}</span>
                          <select
                            value={u.status}
                            className="form-input admin-table-select"
                            onChange={(e) => updateUser(u.id, 'status', e.target.value)}
                          >
                            <option value="active">active</option>
                            <option value="suspended">suspended</option>
                            <option value="banned">banned</option>
                          </select>
                        </div>
                      </td>
                      <td className="admin-table-gold">{u.elo}</td>
                      <td className="admin-table-credits">{parseFloat(u.balance || 0).toFixed(0)} CRD</td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab('Cajero')} title="Ir al Cajero para ajustar créditos">
                          <Wallet size={14} aria-hidden />
                          Cajero
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && tab === 'Transacciones' && (
            <div className="admin-tx-section">
              <p className="admin-section-lead">Solicitudes de carga o retiro de créditos pendientes de aprobación.</p>
              <div className="admin-tx-list">
                {(data.transactions || []).length === 0 ? (
                  <p className="admin-empty-state">Sin solicitudes pendientes</p>
                ) : (
                  (data.transactions || []).map((tx) => (
                    <div key={tx.id} className="fx-card admin-tx-card">
                      <div className="admin-tx-main">
                        <div className="admin-tx-userline">
                          <span className="admin-tx-username">{tx.username}</span>
                          <span className={`fx-badge admin-tx-type-badge${tx.type === 'deposit' ? ' admin-tx-type-badge--in' : ' admin-tx-type-badge--out'}`.trim()}>
                            {tx.type === 'deposit' ? (
                              <>
                                <ArrowDownToLine size={12} aria-hidden /> Carga
                              </>
                            ) : (
                              <>
                                <ArrowUpFromLine size={12} aria-hidden /> Retiro
                              </>
                            )}
                          </span>
                        </div>
                        <div className="admin-tx-amount">{parseFloat(tx.amount).toFixed(0)} CRD</div>
                        {tx.reference && <div className="admin-tx-ref">Ref: {tx.reference}</div>}
                        <div className="admin-tx-date">{new Date(tx.created_at).toLocaleString('es-AR')}</div>
                      </div>
                      <div className="admin-tx-actions">
                        <button type="button" className="btn btn-accept btn-sm" onClick={() => approveTransaction(tx.id)}>
                          <Check size={14} aria-hidden />
                          Aprobar
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => rejectTransaction(tx.id)}>
                          <X size={14} aria-hidden />
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {!loading && tab === 'Partidas' && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {['Room', 'Jugador 1', 'Jugador 2', 'Estado', 'Ganador', 'Inicio'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.games || []).map((g) => (
                    <tr key={g.room_id}>
                      <td className="admin-table-mono">{g.room_id?.substring(0, 8)}…</td>
                      <td>{g.player1_username}</td>
                      <td>{g.player2_username}</td>
                      <td>
                        <span className={`fx-badge admin-game-status${g.status === 'active' ? ' admin-game-status--active' : ' admin-game-status--idle'}`.trim()}>
                          {g.status}
                        </span>
                      </td>
                      <td className="admin-table-gold">{g.winner_username || '—'}</td>
                      <td className="admin-table-muted">{g.started_at ? new Date(g.started_at).toLocaleString('es-AR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && tab === 'Auditoría' && (
            <div className="admin-audit">
              <p className="admin-section-lead">Historial de movimientos de créditos (más recientes primero).</p>
              <div className="admin-table-wrap">
                <table className="admin-table admin-table--compact">
                  <thead>
                    <tr>
                      {['ID', 'Usuario', 'Tipo', 'Créditos', 'Estado', 'Referencia', 'Fecha'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.logs || []).map((tx) => (
                      <tr key={tx.id}>
                        <td className="admin-table-muted">{tx.id}</td>
                        <td className="admin-table-strong">{tx.username}</td>
                        <td className="admin-table-muted">{tx.type}</td>
                        <td
                          className={
                            ['deposit', 'prize', 'bet_win', 'refund', 'bet_refund'].includes(tx.type)
                              ? 'admin-table-pos'
                              : 'admin-table-neg'
                          }
                        >
                          {['deposit', 'prize', 'bet_win', 'refund', 'bet_refund'].includes(tx.type) ? '+' : '−'}
                          {Math.abs(parseFloat(tx.amount)).toFixed(0)} CRD
                        </td>
                        <td>
                          <span
                            className={`fx-badge admin-audit-status${tx.status === 'completed' ? ' admin-audit-status--ok' : tx.status === 'pending' ? ' admin-audit-status--pending' : ' admin-audit-status--fail'}`.trim()}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="admin-table-muted admin-table-sm">{tx.reference || '—'}</td>
                        <td className="admin-table-muted admin-table-sm">{new Date(tx.created_at).toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'Verificaciones' && <VerificationsPanel />}

          {tab === 'Torneos' && (
            <div className="admin-tournament-embed">
              <TournamentAdminPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


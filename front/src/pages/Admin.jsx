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

/** Lista de usuarios desde API o estado Admin; tolera dashboard donde `users` es un número (conteo). */
function normalizeUsersResponse(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.users)) return data.users;
  if (Array.isArray(data?.data?.users)) return data.data.users;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.users?.rows)) return data.users.rows;
  if (import.meta.env.DEV && data.users != null && !Array.isArray(data.users)) {
    console.warn('[Admin] users no es un array (p. ej. conteo del dashboard u otra forma); usando []', data);
  }
  return [];
}

function identityStatusBadgeClass(s) {
  if (s === 'verified') return 'admin-verif-badge admin-verif-badge--ok';
  if (s === 'pending') return 'admin-verif-badge admin-verif-badge--pending';
  if (s === 'rejected') return 'admin-verif-badge admin-verif-badge--reject';
  return 'admin-verif-badge admin-verif-badge--muted';
}

// ─── Cashier Panel ─────────────────────────────────────────────────
function CajeroPanel({ presetUser, onPresetConsumed }) {
  const [search, setSearch]   = useState('');
  const [users, setUsers]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount]   = useState('');
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!presetUser?.id) return;
    setSelected(presetUser);
    setSearch(presetUser.username || presetUser.email || '');
    setUsers([presetUser]);
    onPresetConsumed?.();
  }, [presetUser?.id, onPresetConsumed]);

  const searchUsers = async () => {
    if (!search.trim()) return;
    try {
      const r = await adminApi.listUsers({ search: search.trim(), limit: 10, page: 1 });
      setUsers(normalizeUsersResponse(r.data));
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
      const r = await adminApi.listUsers({ search: search.trim() || selected.username, limit: 10, page: 1 });
      const list = normalizeUsersResponse(r.data);
      setUsers(list);
      setSelected((prev) => list.find((u) => u.id === prev?.id) || null);
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
  const [tab, setTab] = useState('Dashboard');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [cashierPreset, setCashierPreset] = useState(null);

  const [usersRows, setUsersRows] = useState([]);
  const [usersPagination, setUsersPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearchQ, setUserSearchQ] = useState('');
  const [ufRole, setUfRole] = useState('');
  const [ufStatus, setUfStatus] = useState('');
  const [ufVer, setUfVer] = useState('');
  const [usersFetchNonce, setUsersFetchNonce] = useState(0);
  const [editUser, setEditUser] = useState(null);
  const [viewVerifyUser, setViewVerifyUser] = useState(null);
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    role: 'user',
    status: 'active',
    password: '',
    password2: '',
  });

  const [txRows, setTxRows] = useState([]);
  const [txPage, setTxPage] = useState(1);
  const [txLimit] = useState(30);
  const [txPagination, setTxPagination] = useState({ total: 0, totalPages: 1 });
  const [txFetchNonce, setTxFetchNonce] = useState(0);
  const [txDetail, setTxDetail] = useState(null);

  const [auditRows, setAuditRows] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit] = useState(50);
  const [auditSearchInput, setAuditSearchInput] = useState('');
  const [auditSearchQ, setAuditSearchQ] = useState('');
  const [auditType, setAuditType] = useState('');
  const [auditStatus, setAuditStatus] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [auditPagination, setAuditPagination] = useState({ total: 0, totalPages: 1 });

  const [gamesFetchNonce, setGamesFetchNonce] = useState(0);
  const [resolveGame, setResolveGame] = useState(null);
  const [resolveWinnerId, setResolveWinnerId] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/lobby');
  }, [user, navigate]);

  useEffect(() => {
    setUsersPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [userSearchQ, ufRole, ufStatus, ufVer]);

  const loadTab = useCallback(async (t) => {
    if (t === 'Cajero' || t === 'Torneos' || t === 'Verificaciones' || t === 'Usuarios' || t === 'Transacciones' || t === 'Auditoría' || t === 'Partidas') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (t === 'Dashboard') {
        const r = await adminApi.dashboard();
        setData(r.data);
      }
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTab(tab);
  }, [tab, loadTab]);

  useEffect(() => {
    if (tab !== 'Usuarios') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await adminApi.listUsers({
          page: usersPagination.page,
          limit: usersPagination.limit,
          search: userSearchQ || undefined,
          role: ufRole || undefined,
          status: ufStatus || undefined,
          verificationStatus: ufVer || undefined,
        });
        if (!cancelled) {
          setUsersRows(r.data.users || []);
          if (r.data.pagination) setUsersPagination(r.data.pagination);
        }
      } catch {
        if (!cancelled) toast.error('Error al cargar usuarios');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, usersPagination.page, usersPagination.limit, userSearchQ, ufRole, ufStatus, ufVer, usersFetchNonce]);

  useEffect(() => {
    if (tab !== 'Transacciones') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await adminApi.listTransactions({ status: 'pending', page: txPage, limit: txLimit });
        if (!cancelled) {
          setTxRows(r.data.transactions || []);
          if (r.data.pagination) {
            const { total, totalPages, page, limit } = r.data.pagination;
            setTxPagination({ total, totalPages, page, limit });
          }
        }
      } catch {
        if (!cancelled) toast.error('Error al cargar transacciones');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, txPage, txLimit, txFetchNonce]);

  useEffect(() => {
    if (tab !== 'Auditoría') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await adminApi.listTransactions({
          page: auditPage,
          limit: auditLimit,
          search: auditSearchQ || undefined,
          type: auditType || undefined,
          status: auditStatus || undefined,
          dateFrom: auditDateFrom || undefined,
          dateTo: auditDateTo || undefined,
        });
        if (!cancelled) {
          setAuditRows(r.data.transactions || []);
          if (r.data.pagination) {
            const { total, totalPages } = r.data.pagination;
            setAuditPagination({ total, totalPages });
          }
        }
      } catch {
        if (!cancelled) toast.error('Error al cargar auditoría');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, auditPage, auditLimit, auditSearchQ, auditType, auditStatus, auditDateFrom, auditDateTo]);

  useEffect(() => {
    if (tab !== 'Partidas') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await adminApi.listGames({ limit: 100 });
        if (!cancelled) setData((prev) => ({ ...prev, games: r.data.games || [] }));
      } catch {
        if (!cancelled) toast.error('Error al cargar partidas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, gamesFetchNonce]);

  const openEditUser = (u) => {
    setEditForm({
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      password: '',
      password2: '',
    });
    setEditUser(u);
  };

  const saveEditUser = async () => {
    if (!editUser) return;
    if (editForm.password && editForm.password !== editForm.password2) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    try {
      const body = {
        username: editForm.username.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        status: editForm.status,
        reason: 'admin_panel',
      };
      if (editForm.password.trim()) body.password = editForm.password;
      await adminApi.updateUser(editUser.id, body);
      toast.success('Usuario actualizado');
      setEditUser(null);
      setUsersFetchNonce((n) => n + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const goAuditForUser = (u) => {
    setAuditSearchInput(String(u.id));
    setAuditSearchQ(String(u.id));
    setAuditPage(1);
    setAuditType('');
    setAuditStatus('');
    setTab('Auditoría');
  };

  const goUsersForSearch = (q) => {
    setUserSearchInput(q);
    setUserSearchQ(q);
    setUsersPagination((p) => ({ ...p, page: 1 }));
    setTab('Usuarios');
  };

  const submitResolveGame = async () => {
    if (!resolveGame || !resolveWinnerId) return;
    try {
      await adminApi.resolveAbandonGame(resolveGame.room_id, {
        winnerId: Number(resolveWinnerId),
        reason: 'admin_resolve_paused',
      });
      toast.success('Partida resuelta');
      setResolveGame(null);
      setResolveWinnerId('');
      setGamesFetchNonce((n) => n + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const approveTransaction = async (id) => {
    try {
      await adminApi.approveDeposit(id);
      toast.success('Transacción aprobada');
      setTxFetchNonce((n) => n + 1);
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
      setTxFetchNonce((n) => n + 1);
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

          {tab === 'Cajero' && (
            <CajeroPanel presetUser={cashierPreset} onPresetConsumed={() => setCashierPreset(null)} />
          )}

          {!loading && tab === 'Usuarios' && (
            <div className="admin-users-section">
              <div className="admin-cajero-search-row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                <input
                  className="form-input admin-cajero-search-input"
                  placeholder="Username, email o ID"
                  value={userSearchInput}
                  onChange={(e) => setUserSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setUserSearchQ(userSearchInput.trim());
                      setUsersPagination((p) => ({ ...p, page: 1 }));
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm admin-cajero-search-btn"
                  onClick={() => {
                    setUserSearchQ(userSearchInput.trim());
                    setUsersPagination((p) => ({ ...p, page: 1 }));
                  }}
                >
                  <Search size={16} aria-hidden />
                  Buscar
                </button>
                <select
                  className="form-input"
                  style={{ minWidth: 100 }}
                  value={ufRole}
                  onChange={(e) => {
                    setUfRole(e.target.value);
                    setUsersPagination((p) => ({ ...p, page: 1 }));
                  }}
                >
                  <option value="">Rol (todos)</option>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <select
                  className="form-input"
                  style={{ minWidth: 110 }}
                  value={ufStatus}
                  onChange={(e) => {
                    setUfStatus(e.target.value);
                    setUsersPagination((p) => ({ ...p, page: 1 }));
                  }}
                >
                  <option value="">Estado</option>
                  <option value="active">active</option>
                  <option value="banned">banned</option>
                  <option value="suspended">suspended</option>
                </select>
                <select
                  className="form-input"
                  style={{ minWidth: 130 }}
                  value={ufVer}
                  onChange={(e) => {
                    setUfVer(e.target.value);
                    setUsersPagination((p) => ({ ...p, page: 1 }));
                  }}
                >
                  <option value="">Verificación</option>
                  <option value="verified">verified</option>
                  <option value="pending">pending</option>
                  <option value="rejected">rejected</option>
                  <option value="unverified">unverified</option>
                </select>
                <select
                  className="form-input"
                  style={{ minWidth: 80 }}
                  value={String(usersPagination.limit)}
                  onChange={(e) => setUsersPagination((p) => ({ ...p, limit: Number(e.target.value), page: 1 }))}
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </div>
              <p className="admin-section-lead" style={{ marginTop: 0 }}>
                Total: {usersPagination.total ?? 0} usuario{(usersPagination.total || 0) !== 1 ? 's' : ''}
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      {['ID', 'Usuario', 'Email', 'Verificación', 'Rol', 'Estado', 'Puntos', 'W/L', 'Créditos', 'Retiro pend.', 'Acciones'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usersRows.map((u) => {
                      const ver = u.verification || {};
                      const idStatus = ver.identity_status || 'unverified';
                      return (
                        <tr key={u.id}>
                          <td className="admin-table-muted">{u.id}</td>
                          <td className="admin-table-strong">{u.username}</td>
                          <td className="admin-table-muted">{u.email}</td>
                          <td>
                            <span className={identityStatusBadgeClass(idStatus)}>{idStatus}</span>
                          </td>
                          <td>
                            <span className={roleBadgeClass(u.role)}>{u.role}</span>
                          </td>
                          <td>
                            <span className={statusBadgeClass(u.status)}>{u.status}</span>
                          </td>
                          <td className="admin-table-gold">{u.elo ?? '—'}</td>
                          <td className="admin-table-muted">
                            {u.wins ?? 0}/{u.losses ?? 0}
                          </td>
                          <td className="admin-table-credits">{parseFloat(u.balance || 0).toFixed(0)} CRD</td>
                          <td className="admin-table-muted">
                            {parseFloat(u.pendingWithdrawal || 0) > 0 ? `${parseFloat(u.pendingWithdrawal).toFixed(0)} CRD` : '—'}
                          </td>
                          <td>
                            <div className="admin-table-cell-stack" style={{ alignItems: 'flex-start' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setCashierPreset(u);
                                  setTab('Cajero');
                                }}
                              >
                                <Wallet size={14} aria-hidden />
                                Cajero
                              </button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => goAuditForUser(u)}>
                                Movimientos
                              </button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewVerifyUser(u)}>
                                Ver datos
                              </button>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => openEditUser(u)}>
                                Editar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="admin-cajero-search-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={usersPagination.page <= 1}
                  onClick={() => setUsersPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                >
                  Anterior
                </button>
                <span className="admin-table-muted">
                  Página {usersPagination.page} / {usersPagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={usersPagination.page >= (usersPagination.totalPages || 1)}
                  onClick={() => setUsersPagination((p) => ({ ...p, page: p.page + 1 }))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {!loading && tab === 'Transacciones' && (
            <div className="admin-tx-section">
              <p className="admin-section-lead">Solicitudes de carga o retiro de créditos pendientes de aprobación.</p>
              <p className="admin-table-muted" style={{ marginBottom: 8 }}>
                Mostrando página {txPagination.page || txPage} — total {txPagination.total ?? 0}
              </p>
              <div className="admin-tx-list">
                {txRows.length === 0 ? (
                  <p className="admin-empty-state">Sin solicitudes pendientes</p>
                ) : (
                  txRows.map((tx) => {
                    const v = tx.verification || {};
                    const idOk = v.identity_status === 'verified' && v.age_verified;
                    const isWithdrawal = tx.type === 'withdrawal';
                    return (
                      <div key={tx.id} className="fx-card admin-tx-card">
                        <div className="admin-tx-main">
                          <div className="admin-tx-userline">
                            <span className="admin-tx-username">{tx.username}</span>
                            <span className="admin-table-muted" style={{ fontSize: 12 }}>
                              {tx.email}
                            </span>
                            <span
                              className={`fx-badge admin-tx-type-badge${tx.type === 'deposit' ? ' admin-tx-type-badge--in' : ' admin-tx-type-badge--out'}`.trim()}
                            >
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
                          {isWithdrawal && (
                            <div style={{ marginTop: 8 }}>
                              {!idOk && (
                                <p className="admin-alert-pending" style={{ padding: '8px 10px', fontSize: 13 }}>
                                  <AlertTriangle size={16} aria-hidden style={{ verticalAlign: 'middle', marginRight: 6 }} />
                                  {v.identity_status === 'unverified' || !v.identity_status
                                    ? 'Usuario sin identidad verificada. No debería aprobarse el retiro.'
                                    : 'Identidad no verificada o edad no confirmada.'}
                                </p>
                              )}
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTxDetail(tx)}>
                                Ver retiro + identidad
                              </button>
                            </div>
                          )}
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
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => goUsersForSearch(tx.username)}>
                            Ver usuario
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab('Verificaciones')}>
                            Verificación
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="admin-cajero-search-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={txPage <= 1} onClick={() => setTxPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </button>
                <span className="admin-table-muted">Página {txPage}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={txPage >= (txPagination.totalPages || 1)}
                  onClick={() => setTxPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {!loading && tab === 'Partidas' && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {['Room', 'Jugador 1', 'Jugador 2', 'Estado', 'Ganador', 'Inicio', 'Acciones'].map((h) => (
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
                        <div className="admin-table-cell-stack">
                          <span
                            className={`fx-badge admin-game-status${
                              g.display_status === 'active' || g.computed_status === 'active'
                                ? ' admin-game-status--active'
                                : ' admin-game-status--idle'
                            }`.trim()}
                          >
                            {g.display_status ?? g.status}
                          </span>
                          {g.needsResolution && (
                            <span className="fx-badge admin-audit-status admin-audit-status--pending">Requiere resolución</span>
                          )}
                        </div>
                      </td>
                      <td className="admin-table-gold">{g.winner_username || '—'}</td>
                      <td className="admin-table-muted">{g.started_at ? new Date(g.started_at).toLocaleString('es-AR') : '—'}</td>
                      <td>
                        {g.needsResolution && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setResolveGame(g);
                              setResolveWinnerId('');
                            }}
                          >
                            Resolver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && tab === 'Auditoría' && (
            <div className="admin-audit">
              <p className="admin-section-lead">Historial de movimientos de créditos (usuario, tipo, fechas).</p>
              <div className="admin-cajero-search-row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                <input
                  className="form-input admin-cajero-search-input"
                  placeholder="Username, email o user_id"
                  value={auditSearchInput}
                  onChange={(e) => setAuditSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setAuditSearchQ(auditSearchInput.trim());
                      setAuditPage(1);
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm admin-cajero-search-btn"
                  onClick={() => {
                    setAuditSearchQ(auditSearchInput.trim());
                    setAuditPage(1);
                  }}
                >
                  <Search size={16} aria-hidden />
                  Buscar
                </button>
                <input
                  className="form-input"
                  style={{ minWidth: 130 }}
                  type="date"
                  value={auditDateFrom}
                  onChange={(e) => {
                    setAuditDateFrom(e.target.value);
                    setAuditPage(1);
                  }}
                />
                <input
                  className="form-input"
                  style={{ minWidth: 130 }}
                  type="date"
                  value={auditDateTo}
                  onChange={(e) => {
                    setAuditDateTo(e.target.value);
                    setAuditPage(1);
                  }}
                />
                <select
                  className="form-input"
                  value={auditType}
                  onChange={(e) => {
                    setAuditType(e.target.value);
                    setAuditPage(1);
                  }}
                >
                  <option value="">Tipo (todos)</option>
                  <option value="deposit">deposit</option>
                  <option value="withdrawal">withdrawal</option>
                  <option value="bet_lock">bet_lock</option>
                  <option value="bet_win">bet_win</option>
                  <option value="bet_loss">bet_loss</option>
                  <option value="bet_refund">bet_refund</option>
                  <option value="refund">refund</option>
                  <option value="adjustment">adjustment</option>
                  <option value="tournament_entry">tournament_entry</option>
                  <option value="tournament_prize">tournament_prize</option>
                  <option value="tournament_refund">tournament_refund</option>
                </select>
                <select
                  className="form-input"
                  value={auditStatus}
                  onChange={(e) => {
                    setAuditStatus(e.target.value);
                    setAuditPage(1);
                  }}
                >
                  <option value="">Estado (todos)</option>
                  <option value="pending">pending</option>
                  <option value="completed">completed</option>
                  <option value="failed">failed</option>
                  <option value="cancelled">cancelled</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
              <p className="admin-table-muted" style={{ marginBottom: 8 }}>
                Total movimientos: {auditPagination.total ?? 0}
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table admin-table--compact">
                  <thead>
                    <tr>
                      {['ID', 'Usuario', 'Email', 'Tipo', 'Créditos', 'Estado', 'Referencia', 'Fecha'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((tx) => (
                      <tr key={tx.id}>
                        <td className="admin-table-muted">{tx.id}</td>
                        <td className="admin-table-strong">{tx.username}</td>
                        <td className="admin-table-muted admin-table-sm">{tx.email}</td>
                        <td className="admin-table-muted">{tx.type}</td>
                        <td
                          className={
                            ['deposit', 'prize', 'bet_win', 'refund', 'bet_refund', 'tournament_prize', 'tournament_refund'].includes(tx.type)
                              ? 'admin-table-pos'
                              : 'admin-table-neg'
                          }
                        >
                          {['deposit', 'prize', 'bet_win', 'refund', 'bet_refund', 'tournament_prize', 'tournament_refund'].includes(tx.type)
                            ? '+'
                            : '−'}
                          {Math.abs(parseFloat(tx.amount)).toFixed(0)} CRD
                        </td>
                        <td>
                          <span
                            className={`fx-badge admin-audit-status${
                              tx.status === 'completed'
                                ? ' admin-audit-status--ok'
                                : tx.status === 'pending'
                                  ? ' admin-audit-status--pending'
                                  : ' admin-audit-status--fail'
                            }`.trim()}
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
              <div className="admin-cajero-search-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <span className="admin-table-muted">
                  Página {auditPage} / {auditPagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={auditPage >= (auditPagination.totalPages || 1)}
                  onClick={() => setAuditPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {editUser && (
            <div className="admin-verif-modal-overlay" role="presentation">
              <div className="fx-card admin-verif-modal" role="dialog" aria-modal="true" aria-labelledby="admin-edit-user-title">
                <h3 id="admin-edit-user-title" className="admin-verif-modal-title">
                  Editar usuario #{editUser.id}
                </h3>
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-eu-user">
                    Username
                  </label>
                  <input
                    id="adm-eu-user"
                    className="form-input"
                    value={editForm.username}
                    onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-eu-email">
                    Email
                  </label>
                  <input
                    id="adm-eu-email"
                    type="email"
                    className="form-input"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-eu-role">
                    Rol
                  </label>
                  <select
                    id="adm-eu-role"
                    className="form-input"
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-eu-status">
                    Estado
                  </label>
                  <select
                    id="adm-eu-status"
                    className="form-input"
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="banned">banned</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-eu-pw">
                    Nueva clave (opcional)
                  </label>
                  <input
                    id="adm-eu-pw"
                    type="password"
                    autoComplete="new-password"
                    className="form-input"
                    value={editForm.password}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Dejar vacío para no cambiar"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-eu-pw2">
                    Confirmar clave
                  </label>
                  <input
                    id="adm-eu-pw2"
                    type="password"
                    autoComplete="new-password"
                    className="form-input"
                    value={editForm.password2}
                    onChange={(e) => setEditForm((f) => ({ ...f, password2: e.target.value }))}
                  />
                </div>
                <div className="admin-verif-modal-actions">
                  <button type="button" className="btn btn-primary" onClick={saveEditUser}>
                    Guardar
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {viewVerifyUser && (
            <div className="admin-verif-modal-overlay" role="presentation">
              <div className="fx-card admin-verif-modal" role="dialog" aria-modal="true">
                <h3 className="admin-verif-modal-title">Datos de verificación</h3>
                <p className="admin-verif-modal-user">
                  <strong>{viewVerifyUser.username}</strong>
                  <br />
                  <span className="admin-verif-email">{viewVerifyUser.email}</span>
                </p>
                {(() => {
                  const ver = viewVerifyUser.verification || {};
                  const idStatus = ver.identity_status || 'unverified';
                  if (idStatus === 'unverified' && !ver.legal_first_name && !ver.legal_last_name) {
                    return <p className="admin-verif-empty">Sin verificación cargada.</p>;
                  }
                  return (
                    <div className="admin-verify-readout" style={{ fontSize: 14, lineHeight: 1.5 }}>
                      <p>
                        Estado: <span className={identityStatusBadgeClass(idStatus)}>{idStatus}</span>
                      </p>
                      <p>Edad verificada: {ver.age_verified ? 'Sí' : 'No'}</p>
                      <p>
                        Nombre legal: {ver.legal_first_name || '—'} {ver.legal_last_name || '—'}
                      </p>
                      <p>
                        Documento: {ver.document_type ? `${ver.document_type.toUpperCase()} ` : ''}
                        {ver.document_number_masked || '—'}
                      </p>
                      <p>Fecha de nacimiento: {ver.date_of_birth ? new Date(ver.date_of_birth).toLocaleDateString('es-AR') : '—'}</p>
                      <p>
                        País / provincia: {ver.country || '—'}
                        {ver.province ? `, ${ver.province}` : ''}
                      </p>
                      {ver.rejection_reason && (
                        <p>
                          Motivo rechazo: <em>{ver.rejection_reason}</em>
                        </p>
                      )}
                      <p>Fecha revisión: {ver.reviewed_at ? new Date(ver.reviewed_at).toLocaleString('es-AR') : '—'}</p>
                      <p>
                        Admin revisó: {ver.reviewer_username || (ver.reviewed_by ? `#${ver.reviewed_by}` : '—')}
                      </p>
                    </div>
                  );
                })()}
                <div className="admin-verif-modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setViewVerifyUser(null)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {resolveGame && (
            <div className="admin-verif-modal-overlay" role="presentation">
              <div className="fx-card admin-verif-modal" role="dialog" aria-modal="true">
                <h3 className="admin-verif-modal-title">Resolver partida pausada</h3>
                <p className="admin-verif-modal-user">
                  Room <span className="admin-table-mono">{resolveGame.room_id}</span>
                </p>
                <p className="admin-table-muted" style={{ fontSize: 13 }}>
                  Elegí ganador por abandono. Solo usar en partidas atascadas en pausa.
                </p>
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-resolve-w">
                    Ganador (user id)
                  </label>
                  <select
                    id="adm-resolve-w"
                    className="form-input"
                    value={resolveWinnerId}
                    onChange={(e) => setResolveWinnerId(e.target.value)}
                  >
                    <option value="">— Elegir —</option>
                    <option value={String(resolveGame.player1_id)}>
                      {resolveGame.player1_username} (#{resolveGame.player1_id})
                    </option>
                    <option value={String(resolveGame.player2_id)}>
                      {resolveGame.player2_username} (#{resolveGame.player2_id})
                    </option>
                  </select>
                </div>
                <div className="admin-verif-modal-actions">
                  <button type="button" className="btn btn-primary" onClick={submitResolveGame}>
                    Confirmar
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setResolveGame(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {txDetail && (
            <div className="admin-verif-modal-overlay" role="presentation">
              <div className="fx-card admin-verif-modal" role="dialog" aria-modal="true" style={{ maxWidth: 520 }}>
                <h3 className="admin-verif-modal-title">Retiro vs identidad verificada</h3>
                <p className="admin-verif-modal-user">
                  {txDetail.username} · {txDetail.email} · tx #{txDetail.id}
                </p>
                <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>
                  <p>
                    <strong>A) Datos del retiro</strong>
                  </p>
                  <p>Monto: {parseFloat(txDetail.amount).toFixed(0)} CRD</p>
                  <p>Referencia: {txDetail.reference || '—'}</p>
                  <p>
                    Metadata:{' '}
                    {txDetail.metadata && typeof txDetail.metadata === 'object'
                      ? JSON.stringify(txDetail.metadata, null, 2)
                      : '—'}
                  </p>
                  <p>
                    <strong>B) Datos verificados del usuario</strong>
                  </p>
                  {(() => {
                    const v = txDetail.verification || {};
                    return (
                      <>
                        <p>
                          Estado identidad: <span className={identityStatusBadgeClass(v.identity_status || 'unverified')}>{v.identity_status || 'unverified'}</span>
                        </p>
                        <p>Edad verificada: {v.age_verified ? 'Sí' : 'No'}</p>
                        <p>
                          Nombre: {v.legal_first_name || '—'} {v.legal_last_name || '—'}
                        </p>
                        <p>
                          Doc: {v.document_type ? `${v.document_type} ` : ''}
                          {v.document_number_masked || '—'}
                        </p>
                        <p>Nacimiento: {v.date_of_birth ? new Date(v.date_of_birth).toLocaleDateString('es-AR') : '—'}</p>
                        <p>
                          País: {v.country || '—'} {v.province ? `, ${v.province}` : ''}
                        </p>
                      </>
                    );
                  })()}
                  <p className="admin-alert-pending" style={{ padding: '10px 12px', fontSize: 13 }}>
                    <AlertTriangle size={16} aria-hidden style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Verificá que la cuenta de retiro pertenezca a la misma persona validada en identidad. La aprobación sigue siendo manual.
                  </p>
                </div>
                <div className="admin-verif-modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setTxDetail(null)}>
                    Cerrar
                  </button>
                </div>
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


/**
 * WalletPanel — TrucoFX wallet modal.
 *
 * GET  /api/wallet              → { balance, reserved, pendingWithdrawal }
 * GET  /api/wallet/transactions → { transactions: [...] }
 * POST /api/wallet/deposit/request  (unused — Telegram flow)
 * POST /api/wallet/withdraw/request
 * POST /api/wallet/withdraw/:id/cancel
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { walletApi } from '../../services/api';

const TABS = [
  { id: 'balance',  label: '💰 Saldo'    },
  { id: 'history',  label: '📋 Historial' },
  { id: 'deposit',  label: '➕ Depositar' },
  { id: 'withdraw', label: '➖ Retirar'   },
];

// ── Tx metadata ──────────────────────────────────────────────────────────────
const TX_META = {
  deposit:    { label: 'Depósito acreditado', icon: '⬆️', sign: +1 },
  withdrawal: { label: 'Retiro',               icon: '⬇️', sign: -1 },
  bet_lock:   { label: 'Apuesta bloqueada',    icon: '🔒', sign: -1 },
  bet_refund: { label: 'Apuesta devuelta',     icon: '↩️', sign: +1 },
  bet_win:    { label: 'Premio ganado',         icon: '🏆', sign: +1 },
  bet_loss:   { label: 'Apuesta perdida',       icon: '💀', sign:  0 },
  commission: { label: 'Comisión',              icon: '🏛️', sign: -1 },
  adjustment: { label: 'Ajuste',                icon: '⚙️', sign: +1 },
};

const STATUS_COLOR = {
  pending:   '#f59e0b',
  cancelled: '#94a3b8',
  completed: '#4ade80',
};

function fmtDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ── Balance tab ───────────────────────────────────────────────────────────────
function BalanceView({ wallet }) {
  if (!wallet) return <p className="wp-loading">Cargando...</p>;
  const available       = parseFloat(wallet.balance || 0);
  const pendingWithdraw = parseFloat(wallet.pendingWithdrawal || 0);
  const inGame          = Math.max(0, parseFloat(wallet.reserved || 0) - pendingWithdraw);

  const Card = ({ label, value, cls, note }) => (
    <div className={`wp-balance-card ${cls}`}>
      <span className="wp-card-label">{label}</span>
      <span className="wp-card-value">{value.toLocaleString('es-AR')} cr</span>
      {note && <span className="wp-card-note">{note}</span>}
    </div>
  );

  return (
    <div className="wp-balance-view">
      <Card label="Saldo disponible"      value={available}       cls="available" note="1 crédito = $1 ARS" />
      {inGame > 0 && (
        <Card label="En juego / bloqueado" value={inGame}          cls="ingame"    note="Liberado al terminar la partida" />
      )}
      {pendingWithdraw > 0 && (
        <Card label="Pendiente de retiro"  value={pendingWithdraw} cls="pending-w" note="El admin procesará tu solicitud pronto" />
      )}
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryView({ transactions, loading, onCancelWithdraw }) {
  if (loading) return <p className="wp-loading">Cargando...</p>;
  if (!transactions.length) return <p className="wp-empty">Sin transacciones aún.</p>;

  return (
    <div className="wp-tx-list">
      {transactions.map(tx => {
        const meta   = TX_META[tx.type] || { label: tx.type, icon: '💸', sign: +1 };
        const amount = parseFloat(tx.amount || 0);

        let displayAmt, amtColor;
        if (meta.sign === +1) {
          displayAmt = `+${amount.toLocaleString('es-AR')}`;
          amtColor   = '#4ade80';
        } else if (meta.sign === -1) {
          displayAmt = `−${amount.toLocaleString('es-AR')}`;
          amtColor   = '#f87171';
        } else {
          // bet_loss: money was already removed at bet_lock time
          displayAmt = `−${amount.toLocaleString('es-AR')}`;
          amtColor   = '#f87171';
        }

        if (tx.type === 'withdrawal' && STATUS_COLOR[tx.status]) {
          amtColor = STATUS_COLOR[tx.status];
        }

        return (
          <div key={tx.id} className="wp-tx-row">
            <span className="wp-tx-icon">{meta.icon}</span>
            <div className="wp-tx-info">
              <span className="wp-tx-label">{meta.label}</span>
              {tx.status && tx.status !== 'completed' && (
                <span className="wp-tx-status" style={{ color: STATUS_COLOR[tx.status] || '#94a3b8' }}>
                  {tx.status === 'pending' ? 'pendiente' : tx.status === 'cancelled' ? 'cancelado' : tx.status}
                </span>
              )}
              <span className="wp-tx-date">{fmtDate(tx.created_at)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className="wp-tx-amount" style={{ color: amtColor }}>
                {displayAmt} cr
              </span>
              {tx.type === 'withdrawal' && tx.status === 'pending' && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', color: '#f87171', borderColor: '#f87171' }}
                  onClick={() => onCancelWithdraw(tx.id)}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Deposit tab — Telegram flow ───────────────────────────────────────────────
function DepositForm({ user }) {
  const PRESETS = [1000, 2500, 5000, 10000];
  const [amount, setAmount] = useState('');

  const telegramMsg = `Hola, quiero cargar créditos en TrucoFX.\nUsuario: ${user?.username || ''}\nID: ${user?.id || ''}\nMonto: $${amount || '___'} ARS`;
  const telegramUrl = `https://t.me/TrucoFX?text=${encodeURIComponent(telegramMsg)}`;

  const copyMsg = () => {
    navigator.clipboard.writeText(telegramMsg).then(() => toast.success('Mensaje copiado'));
  };

  return (
    <div className="wp-deposit-telegram">
      <div className="wp-tg-header">
        <span className="wp-tg-icon">✈️</span>
        <div>
          <p className="wp-tg-title">Depositar por Telegram</p>
          <p className="wp-tg-sub">Contactá a @TrucoFX para coordinar la carga</p>
        </div>
      </div>

      <p className="wp-tg-instructions">
        Elegí un monto, copiá el mensaje y envialo a <strong>@TrucoFX</strong> en Telegram.
        Un administrador acreditará los créditos manualmente.
      </p>

      <div className="wp-preset-amounts">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            className={`wp-preset-btn${amount === String(p) ? ' active' : ''}`}
            onClick={() => setAmount(String(p))}
          >
            ${p.toLocaleString('es-AR')}
          </button>
        ))}
      </div>

      <div className="form-group" style={{ marginTop: 8 }}>
        <label>Otro monto</label>
        <input
          type="number"
          className="form-input"
          min="100"
          step="100"
          value={PRESETS.includes(Number(amount)) ? '' : amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Ej: 7500"
        />
      </div>

      <div className="wp-tg-msg-preview">
        <pre>{telegramMsg}</pre>
      </div>

      <div className="wp-tg-actions">
        <button type="button" className="btn btn-ghost" onClick={copyMsg}>
          📋 Copiar mensaje
        </button>
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          ✈️ Abrir Telegram
        </a>
      </div>
    </div>
  );
}

// ── Withdraw tab ──────────────────────────────────────────────────────────────
function WithdrawForm({ wallet, onSuccess }) {
  const [amount,  setAmount]  = useState('');
  const [method,  setMethod]  = useState('transferencia');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const available = parseFloat(wallet?.balance || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0)    return toast.error('Monto inválido');
    if (n > available)   return toast.error(`Saldo insuficiente. Disponible: ${available.toLocaleString('es-AR')} cr`);
    if (!details.trim()) return toast.error('Ingresá CBU / Alias');
    setLoading(true);
    try {
      await walletApi.withdrawRequest({ amount: n, method, details: details.trim() });
      toast.success('Retiro solicitado. Podés cancelarlo desde el Historial mientras esté pendiente.');
      setAmount('');
      setDetails('');
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al solicitar retiro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="wp-form" onSubmit={handleSubmit}>
      <div className="wp-withdraw-info">
        <div className="wp-wi-row">
          <span>Disponible</span>
          <strong style={{ color: '#4ade80' }}>{available.toLocaleString('es-AR')} cr</strong>
        </div>
        {wallet?.pendingWithdrawal > 0 && (
          <div className="wp-wi-row">
            <span>Ya en retiro</span>
            <strong style={{ color: '#f59e0b' }}>
              {parseFloat(wallet.pendingWithdrawal).toLocaleString('es-AR')} cr
            </strong>
          </div>
        )}
      </div>

      <div className="form-group">
        <label>Método</label>
        <select className="form-input" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="transferencia">Transferencia bancaria</option>
          <option value="mercadopago">MercadoPago</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="form-group">
        <label>CBU / Alias / CVU</label>
        <textarea
          className="form-input"
          rows={2}
          value={details}
          onChange={e => setDetails(e.target.value)}
          placeholder="CBU: 0000... o Alias: nombre.apellido"
          required
        />
      </div>
      <div className="form-group">
        <label>Monto a retirar</label>
        <input
          type="number"
          className="form-input"
          min="100"
          step="100"
          max={available}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Ej: 5000"
          required
        />
      </div>
      <button type="submit" className="btn btn-danger" disabled={loading || available <= 0}>
        {loading ? 'Enviando...' : 'Solicitar retiro'}
      </button>
      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
        El saldo se descuenta inmediatamente y queda como "Pendiente de retiro".
        Podés cancelarlo desde el Historial.
      </p>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WalletPanel({ onClose }) {
  const { user } = useAuth();
  const [tab,          setTab]          = useState('balance');
  const [wallet,       setWallet]       = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading,    setTxLoading]    = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const r = await walletApi.getBalance();
      setWallet(r.data);
    } catch { /* ignore */ }
  }, []);

  const loadHistory = useCallback(async () => {
    setTxLoading(true);
    try {
      const r = await walletApi.getHistory({ limit: 50 });
      setTransactions(r.data.transactions || []);
    } catch {
      toast.error('Error al cargar historial');
    } finally {
      setTxLoading(false);
    }
  }, []);

  const handleCancelWithdraw = useCallback(async (txId) => {
    try {
      await walletApi.cancelWithdrawal(txId);
      toast.success('Retiro cancelado. Tu saldo fue devuelto.');
      loadWallet();
      loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cancelar el retiro');
    }
  }, [loadWallet, loadHistory]);

  useEffect(() => { loadWallet(); }, [loadWallet]);
  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="modal-panel wp-panel"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>💰 Mi billetera</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <nav className="wp-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`wp-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="wp-body">
          <AnimatePresence mode="wait">
            {tab === 'balance' && (
              <motion.div key="balance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <BalanceView wallet={wallet} />
              </motion.div>
            )}
            {tab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <HistoryView
                  transactions={transactions}
                  loading={txLoading}
                  onCancelWithdraw={handleCancelWithdraw}
                />
              </motion.div>
            )}
            {tab === 'deposit' && (
              <motion.div key="deposit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <DepositForm user={user} />
              </motion.div>
            )}
            {tab === 'withdraw' && (
              <motion.div key="withdraw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <WithdrawForm
                  wallet={wallet}
                  onSuccess={() => { loadWallet(); setTab('history'); }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * WalletPanel — Modal panel showing wallet balance, transaction history,
 * and deposit/withdraw request forms.
 *
 * Uses:
 *   GET  /api/wallet              → { balance, reserved }
 *   GET  /api/wallet/transactions → { transactions: [...] }
 *   POST /api/wallet/deposit/request
 *   POST /api/wallet/withdraw/request
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { walletApi } from '../../services/api';

const TABS = [
  { id: 'balance',    label: '💰 Saldo'    },
  { id: 'history',    label: '📋 Historial' },
  { id: 'deposit',    label: '➕ Depositar' },
  { id: 'withdraw',   label: '➖ Retirar'   },
];

// ── Transaction type display ─────────────────────────────────────────────────
const TX_LABELS = {
  deposit:       { label: 'Depósito',      color: '#4ade80' },
  withdrawal:    { label: 'Retiro',         color: '#f87171' },
  bet_lock:      { label: 'Apuesta bloq.',  color: '#fb923c' },
  bet_refund:    { label: 'Reembolso',      color: '#60a5fa' },
  bet_win:       { label: '¡Ganaste!',      color: '#4ade80' },
  bet_loss:      { label: 'Pérdida',        color: '#f87171' },
  commission:    { label: 'Comisión',       color: '#94a3b8' },
  adjustment:    { label: 'Ajuste',         color: '#e2e8f0' },
};

function TxIcon({ type }) {
  const map = {
    deposit: '⬆️', withdrawal: '⬇️', bet_lock: '🔒',
    bet_refund: '↩️', bet_win: '🏆', bet_loss: '💀',
    commission: '🏛️', adjustment: '⚙️',
  };
  return <span style={{ fontSize: '1.1rem' }}>{map[type] || '💸'}</span>;
}

function formatDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

// ── Balance tab ───────────────────────────────────────────────────────────────
function BalanceView({ wallet }) {
  if (!wallet) return <p className="wp-loading">Cargando...</p>;
  const available = parseFloat(wallet.balance || 0);
  const reserved  = parseFloat(wallet.reserved || 0);
  return (
    <div className="wp-balance-view">
      <div className="wp-balance-main">
        <span className="wp-balance-label">Saldo disponible</span>
        <span className="wp-balance-value">{available.toLocaleString('es-AR')} cr</span>
      </div>
      {reserved > 0 && (
        <div className="wp-balance-reserved">
          <span className="wp-balance-label">En apuestas activas</span>
          <span className="wp-balance-value reserved">{reserved.toLocaleString('es-AR')} cr</span>
        </div>
      )}
      <div className="wp-balance-total">
        <span className="wp-balance-label">Total (disp. + bloq.)</span>
        <span className="wp-balance-value total">{(available + reserved).toLocaleString('es-AR')} cr</span>
      </div>
      <p className="wp-balance-note">
        Los créditos son virtuales para jugar en la plataforma.
      </p>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryView({ transactions, loading }) {
  if (loading) return <p className="wp-loading">Cargando...</p>;
  if (!transactions.length) return <p className="wp-empty">Sin transacciones recientes.</p>;
  return (
    <div className="wp-tx-list">
      {transactions.map(tx => {
        const meta = TX_LABELS[tx.type] || { label: tx.type, color: '#e2e8f0' };
        const amount = parseFloat(tx.amount || 0);
        const isPositive = amount > 0;
        return (
          <div key={tx.id} className="wp-tx-row">
            <TxIcon type={tx.type} />
            <div className="wp-tx-info">
              <span className="wp-tx-label">{meta.label}</span>
              {tx.description && <span className="wp-tx-desc">{tx.description}</span>}
              <span className="wp-tx-date">{formatDate(tx.created_at)}</span>
            </div>
            <span className="wp-tx-amount" style={{ color: isPositive ? '#4ade80' : '#f87171' }}>
              {isPositive ? '+' : ''}{amount.toLocaleString('es-AR')} cr
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Deposit tab ───────────────────────────────────────────────────────────────
function DepositForm() {
  const [amount, setAmount]   = useState('');
  const [method, setMethod]   = useState('mercadopago');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0) return toast.error('Monto inválido');
    setLoading(true);
    try {
      await walletApi.depositRequest({ amount: n, method });
      toast.success('Solicitud enviada. El admin la procesará pronto.');
      setAmount('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al solicitar depósito');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="wp-form" onSubmit={handleSubmit}>
      <p className="wp-form-note">
        Enviá una solicitud. Un administrador acreditará los créditos manualmente.
      </p>
      <div className="form-group">
        <label>Método de pago</label>
        <select className="form-input" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="mercadopago">MercadoPago</option>
          <option value="transferencia">Transferencia bancaria</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="form-group">
        <label>Monto (créditos)</label>
        <input
          type="number"
          className="form-input"
          min="100"
          step="100"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Ej: 5000"
          required
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Enviando...' : 'Solicitar depósito'}
      </button>
    </form>
  );
}

// ── Withdraw tab ──────────────────────────────────────────────────────────────
function WithdrawForm({ balance }) {
  const [amount,  setAmount]  = useState('');
  const [method,  setMethod]  = useState('transferencia');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0) return toast.error('Monto inválido');
    if (n > (parseFloat(balance?.balance) || 0)) return toast.error('Saldo insuficiente');
    if (!details.trim()) return toast.error('Ingresá los datos de retiro');
    setLoading(true);
    try {
      await walletApi.withdrawRequest({ amount: n, method, details: details.trim() });
      toast.success('Solicitud de retiro enviada. El admin la procesará.');
      setAmount('');
      setDetails('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al solicitar retiro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="wp-form" onSubmit={handleSubmit}>
      <p className="wp-form-note">
        Disponible: <strong>{parseFloat(balance?.balance || 0).toLocaleString('es-AR')} cr</strong>
      </p>
      <div className="form-group">
        <label>Método</label>
        <select className="form-input" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="transferencia">Transferencia bancaria</option>
          <option value="mercadopago">MercadoPago</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div className="form-group">
        <label>CBU / Alias / Datos de cobro</label>
        <textarea
          className="form-input"
          rows={3}
          value={details}
          onChange={e => setDetails(e.target.value)}
          placeholder="CBU: 0000... / Alias: nombre.apellido"
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
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Ej: 5000"
          required
        />
      </div>
      <button type="submit" className="btn btn-danger" disabled={loading}>
        {loading ? 'Enviando...' : 'Solicitar retiro'}
      </button>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WalletPanel({ onClose }) {
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
      const r = await walletApi.getHistory({ limit: 40 });
      setTransactions(r.data.transactions || []);
    } catch {
      toast.error('Error al cargar historial');
    } finally {
      setTxLoading(false);
    }
  }, []);

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
                <HistoryView transactions={transactions} loading={txLoading} />
              </motion.div>
            )}
            {tab === 'deposit' && (
              <motion.div key="deposit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <DepositForm />
              </motion.div>
            )}
            {tab === 'withdraw' && (
              <motion.div key="withdraw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <WithdrawForm balance={wallet} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

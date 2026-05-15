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
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Trophy,
  MinusCircle,
  RotateCcw,
  Percent,
  Lock,
  Settings,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
  Coins,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { walletApi, verificationApi } from '../../services/api';

const TABS = [
  { id: 'balance', label: 'Saldo' },
  { id: 'history', label: 'Historial' },
  { id: 'deposit', label: 'Depósito' },
  { id: 'withdraw', label: 'Retiro' },
];

// ── Tx metadata ──────────────────────────────────────────────────────────────
const TX_META = {
  deposit: { label: 'Depósito acreditado', Icon: ArrowDownCircle, sign: +1 },
  withdrawal: { label: 'Retiro', Icon: ArrowUpCircle, sign: -1 },
  bet_lock: { label: 'Apuesta bloqueada', Icon: Lock, sign: -1 },
  bet_refund: { label: 'Reembolso / devolución', Icon: RotateCcw, sign: +1 },
  bet_win: { label: 'Premio (batalla)', Icon: Trophy, sign: +1 },
  bet_loss: { label: 'Pérdida de apuesta', Icon: MinusCircle, sign: -1 },
  commission: { label: 'Comisión', Icon: Percent, sign: -1 },
  adjustment: { label: 'Ajuste', Icon: Settings, sign: +1 },
  tournament_entry: { label: 'Inscripción torneo', Icon: MinusCircle, sign: -1 },
  tournament_prize: { label: 'Premio torneo', Icon: Trophy, sign: +1 },
  tournament_refund: { label: 'Reembolso torneo', Icon: RotateCcw, sign: +1 },
  prize: { label: 'Premio', Icon: Trophy, sign: +1 },
  refund: { label: 'Reembolso', Icon: RotateCcw, sign: +1 },
};

const STATUS_META = {
  pending: { colorClass: 'wallet-tx-status--pending', label: 'pendiente', Icon: Clock },
  completed: { colorClass: 'wallet-tx-status--completed', label: 'completado', Icon: CheckCircle },
  cancelled: { colorClass: 'wallet-tx-status--cancelled', label: 'cancelado', Icon: Ban },
  failed: { colorClass: 'wallet-tx-status--failed', label: 'fallido', Icon: XCircle },
  rejected: { colorClass: 'wallet-tx-status--rejected', label: 'rechazado', Icon: XCircle },
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
  const available = parseFloat(wallet.balance || 0);
  const pendingWithdraw = parseFloat(wallet.pendingWithdrawal || 0);
  const inGame = Math.max(0, parseFloat(wallet.reserved || 0) - pendingWithdraw);

  const Card = ({ label, value, cls, note }) => (
    <div className={`wallet-balance-card wp-balance-card ${cls} fx-card`}>
      <span className="wp-card-label">{label}</span>
      <span className="wp-card-value">{value.toLocaleString('es-AR')} cr</span>
      {note && <span className="wp-card-note">{note}</span>}
    </div>
  );

  return (
    <div className="wallet-balance-grid wp-balance-view">
      <Card label="Saldo disponible" value={available} cls="available" note="1 crédito = $1 ARS" />
      <Card
        label="Créditos en juego / bloqueados"
        value={inGame}
        cls="ingame"
        note={inGame > 0 ? 'Se liberan al terminar la partida o la operación.' : 'Sin fondos retenidos en partidas.'}
      />
      <Card
        label="Pendiente de retiro"
        value={pendingWithdraw}
        cls="pending-w"
        note={
          pendingWithdraw > 0
            ? 'Reservado hasta que se procese o canceles el retiro.'
            : 'Sin retiros pendientes.'
        }
      />
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryView({ transactions, loading, onCancelWithdraw }) {
  if (loading) return <p className="wp-loading">Cargando...</p>;
  if (!transactions.length) return <p className="wp-empty">Sin movimientos aún.</p>;

  return (
    <div className="wp-tx-list wallet-history-list">
      {transactions.map((tx) => {
        const meta = TX_META[tx.type] || { label: tx.type, Icon: Coins, sign: +1 };
        const amount = parseFloat(tx.amount || 0);
        const TxTypeIcon = meta.Icon;

        let displayAmt;
        let rowMod = 'wallet-history-item--neutral';
        if (meta.sign === +1) {
          displayAmt = `+${amount.toLocaleString('es-AR')}`;
          rowMod = 'wallet-history-item--positive';
        } else if (meta.sign === -1) {
          displayAmt = `−${amount.toLocaleString('es-AR')}`;
          rowMod = 'wallet-history-item--negative';
        } else {
          displayAmt = `−${amount.toLocaleString('es-AR')}`;
          rowMod = 'wallet-history-item--negative';
        }

        const st = tx.status ? STATUS_META[tx.status] : null;
        const StatusIcon = st?.Icon;

        return (
          <div key={tx.id} className={`wp-tx-row wallet-history-item ${rowMod}`}>
            <span className="wp-tx-icon" aria-hidden>
              <TxTypeIcon className="wp-tx-type-icon" size={22} strokeWidth={2} />
            </span>
            <div className="wp-tx-info">
              <span className="wp-tx-label">{meta.label}</span>
              {st && StatusIcon && (
                <span className={`fx-badge fx-badge--muted wp-tx-status ${st.colorClass}`}>
                  <StatusIcon className="wp-tx-status-icon" size={12} strokeWidth={2.5} aria-hidden />
                  {st.label}
                </span>
              )}
              <span className="wp-tx-date">{fmtDate(tx.created_at)}</span>
            </div>
            <div className="wallet-history-item-amounts">
              <span
                className={`wp-tx-amount wallet-tx-amount${
                  rowMod === 'wallet-history-item--positive' ? ' wallet-tx-amount--plus' : ' wallet-tx-amount--minus'
                }`}
              >
                {displayAmt} cr
              </span>
              {tx.type === 'withdrawal' && tx.status === 'pending' && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm wallet-cancel-withdraw"
                  onClick={() => onCancelWithdraw(tx.id)}
                >
                  Cancelar retiro
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Deposit tab — Telegram (manual cajero, sin monto en app) ───────────────────
function DepositForm() {
  const telegramUrl = 'https://t.me/TrucoFX';

  return (
    <div className="wallet-action-card wp-deposit-telegram fx-card">
      <div className="wp-tg-header">
        <span className="wp-tg-icon" aria-hidden>
          <ExternalLink className="wp-tg-icon-svg" size={28} strokeWidth={2} />
        </span>
        <div>
          <p className="wp-tg-title">Cargar saldo</p>
          <p className="wp-tg-sub">Para cargar créditos, escribinos por Telegram.</p>
        </div>
      </div>

      <p className="wp-tg-instructions">
        Un administrador te indicará los pasos y acreditará el saldo manualmente.
      </p>
      <p className="wp-tg-instructions wp-tg-instructions--muted">
        No hay carga automática dentro de la app.
      </p>

      <div className="wallet-deposit-actions wp-tg-actions">
        <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block wp-tg-open-btn">
          <ExternalLink size={18} aria-hidden className="wp-tg-open-btn-ic" />
          Abrir Telegram
        </a>
      </div>
    </div>
  );
}

// ── Withdraw tab ──────────────────────────────────────────────────────────────
function WithdrawForm({ wallet, onSuccess, verification }) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('transferencia');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const available = parseFloat(wallet?.balance || 0);
  const idOk = verification?.identity_status === 'verified' && verification?.age_verified;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0) return toast.error('Monto inválido');
    if (n > available) return toast.error(`Saldo insuficiente. Disponible: ${available.toLocaleString('es-AR')} cr`);
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
    <form className="wp-form wallet-action-card fx-card" onSubmit={handleSubmit}>
      <div className="wp-withdraw-info">
        <div className="wp-wi-row">
          <span>Disponible</span>
          <strong className="wallet-amount-available">{available.toLocaleString('es-AR')} cr</strong>
        </div>
        {wallet?.pendingWithdrawal > 0 && (
          <div className="wp-wi-row">
            <span>Reservado para retiros</span>
            <strong className="wallet-amount-pending">{parseFloat(wallet.pendingWithdrawal).toLocaleString('es-AR')} cr</strong>
          </div>
        )}
      </div>

      {!idOk && (
        <div className="fx-card admin-alert-pending" style={{ marginBottom: 12, padding: '10px 12px', fontSize: 13 }}>
          <p style={{ margin: 0 }}>
            Necesitás verificar tu identidad antes de solicitar retiros.
          </p>
          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => navigate('/verification')}>
            Verificar identidad
          </button>
        </div>
      )}

      <div className="form-group">
        <label>Método</label>
        <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
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
          onChange={(e) => setDetails(e.target.value)}
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
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Ej: 5000"
          required
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading || available <= 0 || !idOk}>
        {loading ? 'Enviando…' : 'Solicitar retiro'}
      </button>
      <p className="wp-form-note wallet-withdraw-note">
        Para retirar créditos por dinero, la cuenta de destino debe estar a tu nombre y coincidir con los datos de identidad verificados. Si no coincide, el retiro puede ser rechazado.
      </p>
      <p className="wp-form-note wallet-withdraw-note" style={{ marginTop: 6 }}>
        Al solicitar un retiro, el monto se descuenta de tu saldo disponible y queda reservado como pendiente. Podés cancelar un retiro pendiente desde el historial y el saldo vuelve a tu cuenta.
      </p>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WalletPanel({ onClose, initialTab = 'balance' }) {
  const { user } = useAuth();
  const [tab,          setTab]          = useState(initialTab);
  const [wallet,       setWallet]       = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [verification, setVerification] = useState(null);

  const loadWallet = useCallback(async () => {
    try {
      const r = await walletApi.getBalance();
      setWallet(r.data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadVerification = useCallback(async () => {
    try {
      const r = await verificationApi.getStatus();
      setVerification(r.data);
    } catch {
      setVerification(null);
    }
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

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  useEffect(() => {
    if (tab === 'withdraw') loadVerification();
  }, [tab, loadVerification]);

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="modal-panel wp-panel wallet-panel wallet-panel--solid wallet-panel-responsive"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header wallet-panel-header">
          <div className="wallet-panel-headings">
            <h2 className="wallet-panel-title">Wallet</h2>
            <p className="wallet-panel-subtitle">Tus créditos TrucoFX</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <nav className="wp-tabs wallet-tabs" aria-label="Secciones de wallet">
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

        <div className="wp-body wallet-panel-body">
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
                <DepositForm />
              </motion.div>
            )}
            {tab === 'withdraw' && (
              <motion.div key="withdraw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <WithdrawForm
                  wallet={wallet}
                  verification={verification}
                  onSuccess={() => {
                    loadWallet();
                    loadVerification();
                    setTab('history');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

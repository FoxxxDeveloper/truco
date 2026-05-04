import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { walletApi } from '../../services/api';

const TABS = ['Historia', 'Depositar', 'Retirar'];

export default function WalletPanel({ onClose }) {
  const [balance, setBalance]     = useState(null);
  const [reserved, setReserved]   = useState(0);
  const [transactions, setTxs]    = useState([]);
  const [activeTab, setActiveTab] = useState('Historia');
  const [amount, setAmount]       = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading]     = useState(false);

  const fetchWallet = useCallback(async () => {
    try {
      const [walletRes, txRes] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getHistory({ limit: 30, offset: 0 }),
      ]);
      setBalance(parseFloat(walletRes.data.balance));
      setReserved(parseFloat(walletRes.data.reserved || 0));
      setTxs(txRes.data.transactions || []);
    } catch {
      toast.error('Error al cargar billetera');
    }
  }, []);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  const handleRequest = async (type) => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error('Monto inválido');
    if (!reference.trim()) return toast.error('Ingresá una referencia');
    setLoading(true);
    try {
      const fn = type === 'deposit' ? walletApi.depositRequest : walletApi.withdrawRequest;
      const { data } = await fn({ amount: amt, reference: reference.trim() });
      toast.success(data.message || 'Solicitud enviada');
      setAmount('');
      setReference('');
      fetchWallet();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const typeColor = (type) =>
    ({ deposit: '#4ade80', withdrawal: '#f87171', prize: '#facc15', bet_win: '#4ade80', bet_lock: '#f87171', refund: '#60a5fa' })[type] || '#ccc';

  const typeLabel = (type) =>
    ({ deposit: 'Depósito', withdrawal: 'Retiro', prize: 'Premio', bet_win: 'Ganancia apuesta', bet_lock: 'Apuesta reservada', commission: 'Comisión', refund: 'Reintegro', bet_refund: 'Reintegro apuesta' })[type] || type;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', zIndex: 200 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 420, maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>💰 Billetera</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Balance */}
        <div style={{ background: 'linear-gradient(135deg, #0f4c2a, #1a6b3c)', borderRadius: 12, padding: '20px 24px', marginBottom: 20, textAlign: 'center', border: '1px solid #2d8a52' }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Saldo disponible</div>
          <div style={{ color: '#4ade80', fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>
            ${balance !== null ? balance.toFixed(2) : '—'}
          </div>
          {reserved > 0 && (
            <div style={{ color: '#fb923c', fontSize: 12, marginTop: 4 }}>
              En reserva: ${reserved.toFixed(2)}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: 'var(--bg-surface)', borderRadius: 10, padding: 4 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: activeTab === t ? 'var(--accent-blue)' : 'transparent',
              color: activeTab === t ? '#fff' : 'var(--text-muted)',
            }}>{t}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {activeTab === 'Historia' && (
            transactions.length === 0
              ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Sin movimientos aún</p>
              : transactions.map(tx => (
                <div key={tx.id} style={{
                  background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 14px',
                  marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  border: '1px solid var(--border)',
                }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{typeLabel(tx.type)}</div>
                    {tx.reference && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{tx.reference}</div>}
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{new Date(tx.created_at).toLocaleString('es-AR')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: typeColor(tx.type), fontWeight: 700, fontSize: 16 }}>
                      {['deposit','prize','bet_win','refund','bet_refund'].includes(tx.type) ? '+' : '−'}${Math.abs(tx.amount).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: tx.status === 'completed' ? '#4ade80' : tx.status === 'pending' ? '#fb923c' : '#9ca3af', textTransform: 'uppercase' }}>
                      {tx.status}
                    </div>
                  </div>
                </div>
              ))
          )}

          {(activeTab === 'Depositar' || activeTab === 'Retirar') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                {activeTab === 'Depositar'
                  ? 'Ingresá el monto y tu número de comprobante. Un admin confirmará el acreditado vía Telegram.'
                  : 'Ingresá el monto a retirar y tu CVU/alias. Los fondos quedan reservados hasta la confirmación.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ color: 'var(--text-muted)', fontSize: 12 }}>Monto ($)</label>
                <input
                  type="number" min="1" step="0.01" placeholder="0.00" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="form-input"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {activeTab === 'Depositar' ? 'N° de comprobante / referencia' : 'CVU / Alias destino'}
                </label>
                <input
                  type="text" placeholder={activeTab === 'Depositar' ? 'Ej: 0000012345678' : 'Ej: mi.alias.mp'}
                  value={reference} onChange={e => setReference(e.target.value)}
                  className="form-input"
                />
              </div>
              <button
                disabled={loading}
                onClick={() => handleRequest(activeTab === 'Depositar' ? 'deposit' : 'withdraw')}
                className={`btn ${activeTab === 'Depositar' ? 'btn-accept' : 'btn-danger'}`}
                style={{ width: '100%', padding: '12px 0', fontSize: 15, marginTop: 4 }}
              >
                {loading ? 'Enviando…' : activeTab === 'Depositar' ? '📥 Solicitar depósito' : '📤 Solicitar retiro'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}


  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', zIndex: 100,
      }}
      onClick={onClose}
    >
      <motion.div
        style={{ background: '#1e2a3a', borderRadius: 16, padding: 24, width: 400, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: '#fff' }}>💰 Billetera</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Balance */}
        <div style={{ background: '#243447', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ color: '#9ca3af', fontSize: 12 }}>Saldo disponible</div>
          <div style={{ color: '#4ade80', fontSize: 32, fontWeight: 700 }}>
            ${balance !== null ? balance.toFixed(2) : '—'}
          </div>
          {reserved > 0 && <div style={{ color: '#f87171', fontSize: 12 }}>En espera: ${reserved.toFixed(2)}</div>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: activeTab === t ? '#3b82f6' : '#243447', color: '#fff', fontWeight: 600,
            }}>{t}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {activeTab === 'Historia' && (
            transactions.length === 0
              ? <p style={{ color: '#9ca3af', textAlign: 'center' }}>Sin movimientos</p>
              : transactions.map(tx => (
                <div key={tx.id} style={{
                  background: '#243447', borderRadius: 8, padding: '10px 14px',
                  marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ color: '#fff', fontSize: 13 }}>{tx.description || tx.type}</div>
                    <div style={{ color: '#9ca3af', fontSize: 11 }}>{new Date(tx.created_at).toLocaleString('es-AR')}</div>
                  </div>
                  <div style={{ color: typeColor(tx.type), fontWeight: 700, fontSize: 15 }}>
                    {tx.type === 'deposit' || tx.type === 'prize' || tx.type === 'refund' ? '+' : '−'}${Math.abs(tx.amount).toFixed(2)}
                  </div>
                </div>
              ))
          )}

          {(activeTab === 'Depositar' || activeTab === 'Retirar') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
                {activeTab === 'Depositar'
                  ? 'Ingresá el monto y el número de comprobante de tu transferencia. Un administrador confirmará el acreditado vía Telegram.'
                  : 'Ingresá el monto que deseás retirar. Los fondos se reservarán hasta que el administrador confirme la transferencia.'}
              </p>
              <input
                type="number" min="1" step="0.01" placeholder="Monto" value={amount}
                onChange={e => setAmount(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#243447', color: '#fff' }}
              />
              <input
                type="text" placeholder={activeTab === 'Depositar' ? 'N° de comprobante / referencia' : 'CVU / Alias destino'}
                value={reference} onChange={e => setReference(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#243447', color: '#fff' }}
              />
              <button
                disabled={loading}
                onClick={() => handleRequest(activeTab === 'Depositar' ? 'deposit/request' : 'withdraw/request')}
                style={{
                  padding: '12px 0', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  background: activeTab === 'Depositar' ? '#4ade80' : '#f87171', color: '#111', fontWeight: 700, fontSize: 15,
                }}
              >
                {loading ? 'Enviando…' : activeTab === 'Depositar' ? 'Solicitar depósito' : 'Solicitar retiro'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

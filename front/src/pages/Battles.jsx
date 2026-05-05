/**
 * Battles.jsx — Batallas Competitivas
 * Tabs: Disponibles | Mis salas | Activa | Historial | Crear sala
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useGame } from '../context/GameContext';
import { battleApi, walletApi } from '../services/api';
import { getSocket } from '../services/socket';

const TABS = [
  { id: 'available', label: '⚔️ Disponibles' },
  { id: 'mine',      label: '🃏 Mis salas'   },
  { id: 'active',    label: '🎮 En curso'     },
  { id: 'history',   label: '📜 Historial'   },
  { id: 'create',    label: '➕ Crear'        },
];

const MIN_BET = 2500;

// ── Countdown component ─────────────────────────────────────────────────────
function Countdown({ expiresAt }) {
  const [left, setLeft] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = new Date(expiresAt) - Date.now();
      if (ms <= 0) { setLeft('Expirada'); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return <span className="battle-countdown">{left}</span>;
}

// ── Battle card for "Disponibles" tab ───────────────────────────────────────
function PublicBattleCard({ battle, onAccept, loading }) {
  const config = battle.config || {};
  return (
    <motion.div
      className="battle-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <div className="battle-card-header">
        <span className="battle-creator">⚔️ {battle.creatorUsername}</span>
        {battle.creatorElo && <span className="battle-elo">ELO {battle.creatorElo}</span>}
        <Countdown expiresAt={battle.expiresAt} />
      </div>
      <div className="battle-amounts">
        <div className="battle-bet">
          <span className="label">Tu apuesta</span>
          <span className="value">{battle.amount.toLocaleString('es-AR')} cr</span>
        </div>
        <div className="battle-prize">
          <span className="label">Premio si ganás</span>
          <span className="value prize">{battle.prize.toLocaleString('es-AR')} cr</span>
        </div>
        <div className="battle-gain">
          <span className="label">Ganancia neta</span>
          <span className="value gain">+{battle.netGain.toLocaleString('es-AR')} cr</span>
        </div>
      </div>
      <div className="battle-config-chips">
        <span>{config.puntosMaximos} pts</span>
        <span>{config.florHabilitada ? 'Con flor' : 'Sin flor'}</span>
        <span>Turno {config.turnTimeoutSecs}s</span>
      </div>
      <button
        className="btn btn-primary battle-btn"
        onClick={() => onAccept(battle.id)}
        disabled={loading}
      >
        {loading ? 'Aceptando...' : 'Aceptar desafío'}
      </button>
    </motion.div>
  );
}

// ── My room card ─────────────────────────────────────────────────────────────
function MyBattleCard({ battle, onCancel, loading }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (battle.inviteCode) {
      navigator.clipboard.writeText(battle.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statusLabel = {
    open:      'Esperando rival',
    accepted:  'En partida',
    active:    'En partida',
    finished:  'Finalizada',
    cancelled: 'Cancelada',
    expired:   'Expirada',
    refunded:  'Reembolsada',
  }[battle.status] || battle.status;

  return (
    <motion.div
      className={`battle-card battle-mine status-${battle.status}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="battle-card-header">
        <span className={`battle-status-badge status-${battle.status}`}>{statusLabel}</span>
        {battle.rival && <span className="battle-rival">vs {battle.rival}</span>}
        {battle.status === 'open' && <Countdown expiresAt={battle.expiresAt} />}
      </div>
      <div className="battle-amounts">
        <div className="battle-bet">
          <span className="label">Apostado</span>
          <span className="value">{battle.amount.toLocaleString('es-AR')} cr</span>
        </div>
        <div className="battle-prize">
          <span className="label">Premio</span>
          <span className="value prize">{battle.prize.toLocaleString('es-AR')} cr</span>
        </div>
      </div>
      {battle.isPrivate && battle.iCreator && battle.inviteCode && battle.status === 'open' && (
        <div className="invite-code-row">
          <span className="invite-code">{battle.inviteCode}</span>
          <button className="btn btn-ghost btn-sm" onClick={copyCode}>
            {copied ? '✓ Copiado' : 'Copiar código'}
          </button>
        </div>
      )}
      {battle.iCreator && battle.status === 'open' && (
        <button
          className="btn btn-danger btn-sm battle-btn"
          onClick={() => onCancel(battle.id)}
          disabled={loading}
        >
          {loading ? 'Cancelando...' : 'Cancelar sala'}
        </button>
      )}
    </motion.div>
  );
}

// ── History card ──────────────────────────────────────────────────────────────
function HistoryCard({ battle }) {
  const won = battle.iWon;
  return (
    <div className={`battle-card battle-history ${won ? 'won' : 'lost'}`}>
      <div className="battle-card-header">
        <span className={`result-badge ${won ? 'won' : 'lost'}`}>
          {won ? '🏆 Victoria' : '💀 Derrota'}
        </span>
        <span className="battle-rival">vs {battle.rival || '—'}</span>
        <span className="history-date">{new Date(battle.createdAt).toLocaleDateString('es-AR')}</span>
      </div>
      <div className="battle-amounts">
        <span className={`result-amount ${won ? 'gain' : 'loss'}`}>
          {battle.resultText || (won ? `+${battle.netGain.toLocaleString('es-AR')} cr` : `-${battle.amount.toLocaleString('es-AR')} cr`)}
        </span>
      </div>
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────
function CreateForm({ onCreated, balance }) {
  const [amount,      setAmount]      = useState('');
  const [visibility,  setVisibility]  = useState('public');
  const [puntosMax,   setPuntosMax]   = useState(30);
  const [florEnabled, setFlorEnabled] = useState(false);
  const [loading,     setLoading]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (!n || n < MIN_BET) return toast.error(`Mínimo ${MIN_BET.toLocaleString('es-AR')} créditos`);
    if (n > (balance || 0)) return toast.error('Saldo insuficiente');

    setLoading(true);
    try {
      const res = await battleApi.create({
        amount: n,
        visibility,
        gameConfig: { puntosMaximos: puntosMax, florHabilitada: florEnabled },
      });
      toast.success('¡Sala creada! Esperá a tu rival');
      onCreated(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear sala');
    } finally {
      setLoading(false);
    }
  };

  const n = parseInt(amount, 10) || 0;
  const prize   = n >= MIN_BET ? Math.round(n * 2 * 0.90) : 0;
  const netGain = prize - n;

  return (
    <form className="create-battle-form" onSubmit={handleSubmit}>
      <h3>Nueva sala de batalla</h3>

      <div className="form-group">
        <label>Monto a apostar (mín. {MIN_BET.toLocaleString('es-AR')} cr)</label>
        <input
          type="number"
          min={MIN_BET}
          step={100}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="2500"
          className="form-input"
          required
        />
        {n >= MIN_BET && (
          <div className="prize-preview">
            <span>Premio si ganás: <strong>{prize.toLocaleString('es-AR')} cr</strong></span>
            <span>Ganancia neta: <strong>+{netGain.toLocaleString('es-AR')} cr</strong></span>
          </div>
        )}
      </div>

      <div className="form-group">
        <label>Visibilidad</label>
        <div className="radio-group">
          <label className="radio-label">
            <input type="radio" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
            Pública (cualquiera puede unirse)
          </label>
          <label className="radio-label">
            <input type="radio" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
            Privada (por código de invitación)
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>Puntos para ganar</label>
        <select value={puntosMax} onChange={e => setPuntosMax(Number(e.target.value))} className="form-input">
          <option value={15}>15</option>
          <option value={30}>30 (estándar)</option>
        </select>
      </div>

      <div className="form-group checkbox-group">
        <label>
          <input type="checkbox" checked={florEnabled} onChange={e => setFlorEnabled(e.target.checked)} />
          Habilitar Flor
        </label>
      </div>

      {balance !== null && (
        <p className="balance-note">Tu saldo disponible: {(balance || 0).toLocaleString('es-AR')} cr</p>
      )}

      <button type="submit" className="btn btn-primary btn-large" disabled={loading || n < MIN_BET}>
        {loading ? 'Creando...' : 'Crear sala'}
      </button>
    </form>
  );
}

// ── Join private ───────────────────────────────────────────────────────────────
function JoinPrivate({ onJoined }) {
  const [code,    setCode]    = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await battleApi.joinPrivate(code.trim().toUpperCase());
      onJoined(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Código inválido o sala no encontrada');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="join-private-form" onSubmit={handleSubmit}>
      <h4>Unirse a sala privada</h4>
      <div className="form-group" style={{ flexDirection: 'row', gap: 8 }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={10}
          placeholder="CÓDIGO"
          className="form-input"
          style={{ flex: 1, letterSpacing: 4, textTransform: 'uppercase' }}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !code.trim()}>
          {loading ? '...' : 'Unirse'}
        </button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Battles() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const { gameState, roomId, gameOver, attachListeners } = useGame();
  const socket = getSocket();

  const [tab,         setTab]        = useState('available');
  const [publicList,  setPublicList] = useState([]);
  const [myList,      setMyList]     = useState([]);
  const [active,      setActive]     = useState(null);
  const [history,     setHistory]    = useState([]);
  const [balance,     setBalance]    = useState(null);
  const [loadingId,   setLoadingId]  = useState(null);
  const [fetching,    setFetching]   = useState(false);
  const refreshRef = useRef(null);

  // Navigate to game when a battle starts
  useEffect(() => {
    attachListeners?.();
  }, [attachListeners]);

  useEffect(() => {
    if ((gameState || roomId) && !gameOver) {
      navigate('/game');
    }
  }, [gameState, roomId, gameOver, navigate]);

  const loadBalance = useCallback(async () => {
    try {
      const r = await walletApi.getBalance();
      setBalance(parseFloat(r.data.balance || 0));
    } catch { /* non-critical */ }
  }, []);

  const loadPublic = useCallback(async () => {
    setFetching(true);
    try {
      const r = await battleApi.list();
      setPublicList(r.data.battles || []);
    } catch { toast.error('Error cargando salas'); }
    finally  { setFetching(false); }
  }, []);

  const loadMine = useCallback(async () => {
    setFetching(true);
    try {
      const r = await battleApi.listMine();
      setMyList(r.data.battles || []);
    } catch { toast.error('Error cargando tus salas'); }
    finally { setFetching(false); }
  }, []);

  const loadActive = useCallback(async () => {
    try {
      const r = await battleApi.getActive();
      setActive(r.data.battle);
    } catch { /* ignore */ }
  }, []);

  const loadHistory = useCallback(async () => {
    setFetching(true);
    try {
      const r = await battleApi.getHistory();
      setHistory(r.data.history || []);
    } catch { toast.error('Error cargando historial'); }
    finally { setFetching(false); }
  }, []);

  // Load data when tab changes
  useEffect(() => {
    loadBalance();
    if (tab === 'available') loadPublic();
    if (tab === 'mine')      loadMine();
    if (tab === 'active')    loadActive();
    if (tab === 'history')   loadHistory();
  }, [tab, loadPublic, loadMine, loadActive, loadHistory, loadBalance]);

  // Auto-refresh public list every 15s
  useEffect(() => {
    if (tab !== 'available') return;
    const id = setInterval(loadPublic, 15000);
    return () => clearInterval(id);
  }, [tab, loadPublic]);

  const handleAccept = async (battleId) => {
    setLoadingId(battleId);
    try {
      const res = await battleApi.accept(battleId);
      const data = res.data;
      toast.success('¡Batalla aceptada! Iniciando partida...');

      // Trigger game start via socket
      if (socket) {
        socket.emit('battle:startGame', {
          battleId:   data.battleId,
          roomId:     data.roomId,
          creatorId:  data.creatorId,
          opponentId: data.opponentId,
          amount:     data.amount,
          prize:      data.prize,
          gameConfig: data.gameConfig,
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo aceptar la batalla');
    } finally {
      setLoadingId(null);
    }
  };

  const handleCancel = async (battleId) => {
    setLoadingId(battleId);
    try {
      await battleApi.cancel(battleId);
      toast.success('Sala cancelada. Tu saldo fue liberado');
      loadMine();
      loadBalance();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cancelar');
    } finally {
      setLoadingId(null);
    }
  };

  const handleCreated = (data) => {
    setTab('mine');
    loadMine();
    loadBalance();
  };

  const handleJoined = (data) => {
    toast.success('¡Uniéndote! Iniciando partida...');
    if (socket) {
      socket.emit('battle:startGame', {
        battleId:   data.battleId,
        roomId:     data.roomId,
        creatorId:  data.creatorId,
        opponentId: data.opponentId,
        amount:     data.amount,
        prize:      data.prize,
        gameConfig: data.gameConfig,
      });
    }
  };

  return (
    <div className="battles-page">
      <header className="battles-header">
        <button className="btn btn-ghost" onClick={() => navigate('/lobby')}>← Volver</button>
        <h1>⚔️ Batallas Competitivas</h1>
        {balance !== null && (
          <span className="balance-display">
            💰 {balance.toLocaleString('es-AR')} cr
          </span>
        )}
      </header>

      <nav className="battles-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="battles-main">
        <AnimatePresence mode="wait">
          {/* ── Disponibles ── */}
          {tab === 'available' && (
            <motion.div key="available" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="battles-section-header">
                <h2>Salas públicas abiertas</h2>
                <button className="btn btn-ghost btn-sm" onClick={loadPublic} disabled={fetching}>
                  {fetching ? '...' : '↻ Actualizar'}
                </button>
              </div>

              {/* Join private */}
              <JoinPrivate onJoined={handleJoined} />

              {fetching && publicList.length === 0 && <p className="empty-state">Cargando...</p>}
              {!fetching && publicList.length === 0 && (
                <p className="empty-state">No hay salas disponibles. ¡Creá la primera!</p>
              )}
              <div className="battles-grid">
                <AnimatePresence>
                  {publicList.map(b => (
                    <PublicBattleCard
                      key={b.id}
                      battle={b}
                      onAccept={handleAccept}
                      loading={loadingId === b.id}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ── Mis salas ── */}
          {tab === 'mine' && (
            <motion.div key="mine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="battles-section-header">
                <h2>Mis salas</h2>
                <button className="btn btn-ghost btn-sm" onClick={loadMine} disabled={fetching}>
                  {fetching ? '...' : '↻ Actualizar'}
                </button>
              </div>
              {!fetching && myList.length === 0 && (
                <p className="empty-state">No tenés salas. ¡Creá una nueva!</p>
              )}
              <div className="battles-grid">
                {myList.map(b => (
                  <MyBattleCard
                    key={b.id}
                    battle={b}
                    onCancel={handleCancel}
                    loading={loadingId === b.id}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Activa ── */}
          {tab === 'active' && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2>Partida activa</h2>
              {active ? (
                <div className="active-battle">
                  <MyBattleCard battle={active} onCancel={() => {}} loading={false} />
                  <button className="btn btn-primary" onClick={() => navigate('/game')}>
                    Ir a la partida
                  </button>
                </div>
              ) : (
                <p className="empty-state">No tenés una batalla en curso actualmente.</p>
              )}
            </motion.div>
          )}

          {/* ── Historial ── */}
          {tab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2>Historial de batallas</h2>
              {!fetching && history.length === 0 && (
                <p className="empty-state">Aún no jugaste batallas competitivas.</p>
              )}
              <div className="battles-grid">
                {history.map(b => <HistoryCard key={b.id} battle={b} />)}
              </div>
            </motion.div>
          )}

          {/* ── Crear ── */}
          {tab === 'create' && (
            <motion.div key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CreateForm onCreated={handleCreated} balance={balance} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

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
import { battleApi, walletApi, verificationApi } from '../services/api';
import { getSocket } from '../services/socket';
import AppHeader from '../components/layout/AppHeader';

const TABS = [
  { id: 'available', label: 'Disponibles' },
  { id: 'mine', label: 'Mis salas' },
  { id: 'active', label: 'En curso' },
  { id: 'history', label: 'Historial' },
  { id: 'create', label: 'Crear' },
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
  const turnSec = config.turnTimeoutSecs ?? 30;
  return (
    <motion.div
      className="battle-card battle-card--et3 fx-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <div className="battle-card-top">
        <span className="battle-card-amount-main">{battle.amount.toLocaleString('es-AR')} cr</span>
        <span className="fx-badge fx-badge--muted battle-card-state">Abierta</span>
      </div>
      <div className="battle-card-header">
        <span className="battle-creator">{battle.creatorUsername}</span>
        {battle.creatorElo != null && <span className="battle-elo">{battle.creatorElo} pts</span>}
        <Countdown expiresAt={battle.expiresAt} />
      </div>
      <div className="battle-amounts">
        <div className="battle-bet">
          <span className="label">Apostás</span>
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
        <span className="fx-badge fx-badge--muted">{config.puntosMaximos} pts</span>
        <span className="fx-badge fx-badge--muted">{config.florHabilitada ? 'Con flor' : 'Sin flor'}</span>
        <span className="fx-badge fx-badge--muted">Turno {turnSec}s</span>
      </div>
      <button
        type="button"
        className="btn btn-primary battle-btn"
        onClick={() => onAccept(battle.id)}
        disabled={loading}
      >
        {loading ? 'Aceptando…' : 'Aceptar reto'}
      </button>
    </motion.div>
  );
}

// ── My room card ─────────────────────────────────────────────────────────────
function MyBattleCard({ battle, onCancel, loading }) {
  const navigate = useNavigate();
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

  const config = battle.config || {};
  const turnSec = config.turnTimeoutSecs ?? 30;

  return (
    <motion.div
      className={`battle-card battle-mine battle-card--et3 fx-card status-${battle.status}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="battle-card-top">
        <span className="battle-card-amount-main">{battle.amount.toLocaleString('es-AR')} cr</span>
        <span className={`battle-status-badge status-${battle.status}`}>{statusLabel}</span>
      </div>
      <div className="battle-card-header">
        {battle.rival && <span className="battle-rival">vs {battle.rival}</span>}
        {battle.status === 'open' && <Countdown expiresAt={battle.expiresAt} />}
      </div>
      <div className="battle-config-chips">
        <span className="fx-badge fx-badge--muted">{config.puntosMaximos ?? 30} pts</span>
        <span className="fx-badge fx-badge--muted">{config.florHabilitada ? 'Con flor' : 'Sin flor'}</span>
        <span className="fx-badge fx-badge--muted">Turno {turnSec}s</span>
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyCode}>
            {copied ? 'Copiado' : 'Copiar código'}
          </button>
        </div>
      )}
      {battle.iCreator && battle.status === 'open' && (
        <button
          type="button"
          className="btn btn-danger btn-sm battle-btn"
          onClick={() => onCancel(battle.id)}
          disabled={loading}
        >
          {loading ? 'Cancelando…' : 'Cancelar sala'}
        </button>
      )}
      {(battle.status === 'active' || battle.status === 'accepted') && (
        <button type="button" className="btn btn-primary battle-btn" onClick={() => navigate('/game')}>
          Entrar a la partida
        </button>
      )}
    </motion.div>
  );
}

// ── History card ──────────────────────────────────────────────────────────────
function HistoryCard({ battle }) {
  const finished = battle.status === 'finished';
  const won = finished && battle.iWon;
  const lost = finished && battle.winnerId != null && !battle.iWon;
  const inconclusive = finished && battle.winnerId == null;

  const badgeLabel =
    battle.status === 'finished'
      ? inconclusive
        ? 'Sin resultado'
        : won
          ? 'Victoria'
          : 'Derrota'
      : battle.status === 'cancelled'
        ? 'Cancelada'
        : battle.status === 'expired'
          ? 'Expirada'
          : battle.status === 'refunded'
            ? 'Reembolsada'
            : battle.status === 'open'
              ? 'Abierta'
              : battle.status || '—';

  const badgeTone = won ? 'success' : lost ? 'danger' : 'muted';

  const creditLine =
    battle.hasCreditMovement && battle.resultText
      ? battle.resultText
      : finished
        ? 'Sin movimiento de créditos'
        : '';

  return (
    <div className={`battle-card battle-history battle-card--et3 fx-card ${won ? 'won' : lost ? 'lost' : ''}`}>
      <div className="battle-card-header">
        <span className={`result-badge fx-badge fx-badge--${badgeTone}`}>{badgeLabel}</span>
        <span className="battle-rival">vs {battle.rival || '—'}</span>
        <span className="history-date">{new Date(battle.createdAt).toLocaleDateString('es-AR')}</span>
      </div>
      {finished && (
        <div className="battle-amounts">
          <span className={`result-amount ${won ? 'gain' : lost ? 'loss' : ''}`}>{creditLine}</span>
        </div>
      )}
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
    <div className="fx-card battle-create-panel">
      <h3 className="section-header battle-create-title">Crear batalla</h3>
      <form className="create-battle-form create-battle-form--embedded" onSubmit={handleSubmit}>
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

      <button type="submit" className="btn btn-primary btn-large battle-create-submit" disabled={loading || n < MIN_BET}>
        {loading ? 'Creando…' : 'Crear batalla'}
      </button>
    </form>
    </div>
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
    <form className="join-private-form fx-card battle-join-panel" onSubmit={handleSubmit}>
      <h4 className="section-header battle-join-title">Unirse a sala privada</h4>
      <div className="form-group join-private-row">
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={10}
          placeholder="CÓDIGO"
          className="form-input join-private-input"
        />
        <button type="submit" className="btn btn-primary join-private-submit" disabled={loading || !code.trim()}>
          {loading ? '…' : 'Unirse'}
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
  const [verifyStatus, setVerifyStatus] = useState(null);
  const refreshRef = useRef(null);

  // Navigate to game when a battle starts
  useEffect(() => {
    attachListeners?.();
  }, [attachListeners]);

  useEffect(() => {
    if (gameState && !gameOver) {
      navigate('/game');
    }
  }, [gameState, gameOver, navigate]);

  const loadBalance = useCallback(async () => {
    try {
      const r = await walletApi.getBalance();
      setBalance(parseFloat(r.data.balance || 0));
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    verificationApi.getStatus()
      .then(res => setVerifyStatus(res.data?.identity_status || 'unverified'))
      .catch(() => setVerifyStatus('unverified'));
  }, [user]);

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

      // Trigger game start via socket — server loads all data from DB
      if (socket) {
        socket.emit('battle:startGame', { battleId: data.battleId });
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
      socket.emit('battle:startGame', { battleId: data.battleId });
    }
  };

  return (
    <div className="battles-page battle-page page-container app-page battle-page--et3">
      <AppHeader />

      <div className="page-shell battles-page-shell">
      <header className="battle-hero fx-card battle-hero--premium">
        <div className="battle-hero-top battle-hero-top--compact">
          <div className="battle-hero-meta">
            {verifyStatus === 'verified' && (
              <span className="fx-badge fx-badge--success battle-verify-chip">Verificado</span>
            )}
            {verifyStatus === 'pending' && (
              <span className="fx-badge fx-badge--warning battle-verify-chip">Verificación pendiente</span>
            )}
            {verifyStatus === 'rejected' && (
              <span className="fx-badge fx-badge--danger battle-verify-chip">Verificación rechazada</span>
            )}
            {verifyStatus &&
              verifyStatus !== 'verified' &&
              verifyStatus !== 'pending' &&
              verifyStatus !== 'rejected' && (
                <span className="fx-badge fx-badge--muted battle-verify-chip">No verificado</span>
              )}
          </div>
        </div>
        <h1 className="battle-page-title section-header">Batallas competitivas</h1>
        <p className="battle-hero-sub">Competí por créditos contra otros jugadores.</p>
      </header>

      <section className="fx-card battle-info-strip" aria-label="Cómo funcionan las batallas">
        <ul className="battle-info-list">
          <li>Las batallas usan créditos.</li>
          <li>1 crédito = 1 peso argentino.</li>
          <li>Solo usuarios verificados pueden participar.</li>
          <li>La comisión de la casa se descuenta del pozo final.</li>
        </ul>
      </section>

      {verifyStatus && verifyStatus !== 'verified' && (
        <div
          className={`battle-verify-banner${verifyStatus === 'pending' ? ' battle-verify-banner--pending' : ''}${
            verifyStatus === 'rejected' ? ' battle-verify-banner--rejected' : ''
          }`}
        >
          <p className="battle-verify-banner-text">
            {verifyStatus === 'pending'
              ? 'Tu verificación de identidad está pendiente de revisión.'
              : verifyStatus === 'rejected'
                ? 'Tu verificación fue rechazada. Corregí los datos para participar.'
                : 'Para crear o aceptar batallas necesitás verificar tu identidad.'}
          </p>
          <button type="button" className="btn btn-primary btn-sm battle-verify-banner-btn" onClick={() => navigate('/verification')}>
            {verifyStatus === 'pending' ? 'Ver estado' : 'Verificar identidad'}
          </button>
        </div>
      )}

      <nav className="battles-tabs battle-tabs" aria-label="Secciones de batallas">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="battles-main battle-main">
        <AnimatePresence mode="wait">
          {tab === 'available' && (
            <motion.div key="available" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="battles-section-header">
                <h2 className="section-header">Salas públicas</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={loadPublic} disabled={fetching}>
                  {fetching ? '…' : 'Actualizar'}
                </button>
              </div>

              <JoinPrivate onJoined={handleJoined} />

              {fetching && publicList.length === 0 && <p className="empty-state">Cargando…</p>}
              {!fetching && publicList.length === 0 && (
                <p className="empty-state">No hay salas disponibles. Creá la primera en la pestaña Crear.</p>
              )}
              <div className="battles-grid battle-grid">
                <AnimatePresence>
                  {publicList.map((b) => (
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

          {tab === 'mine' && (
            <motion.div key="mine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="battles-section-header">
                <h2 className="section-header">Mis salas</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={loadMine} disabled={fetching}>
                  {fetching ? '…' : 'Actualizar'}
                </button>
              </div>
              {!fetching && myList.length === 0 && (
                <p className="empty-state">No tenés salas. Creá una nueva en la pestaña Crear.</p>
              )}
              <div className="battles-grid battle-grid">
                {myList.map((b) => (
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

          {tab === 'active' && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="section-header">Batalla en curso</h2>
              {active ? (
                <div className="active-battle fx-card battle-active-panel">
                  <MyBattleCard battle={active} onCancel={() => {}} loading={false} />
                </div>
              ) : (
                <p className="empty-state">No tenés una batalla en curso.</p>
              )}
            </motion.div>
          )}

          {tab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="section-header">Historial</h2>
              {!fetching && history.length === 0 && (
                <p className="empty-state">Aún no jugaste batallas competitivas.</p>
              )}
              <div className="battles-grid battle-grid">
                {history.map((b) => (
                  <HistoryCard key={b.id} battle={b} />
                ))}
              </div>
            </motion.div>
          )}

          {tab === 'create' && (
            <motion.div key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CreateForm onCreated={handleCreated} balance={balance} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      </div>
    </div>
  );
}

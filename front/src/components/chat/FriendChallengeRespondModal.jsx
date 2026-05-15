import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X, Swords } from 'lucide-react';
import { challengeApi } from '../../services/api';
import { getSocket } from '../../services/socket';

function parseGc(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function statusHuman(st) {
  const m = {
    open: 'Pendiente',
    accepted: 'Aceptado',
    rejected: 'Rechazado',
    expired: 'Expirado',
    cancelled: 'Cancelado',
    finished: 'Finalizado',
    active: 'En juego',
  };
  return m[st] || st || '—';
}

export default function FriendChallengeRespondModal({ challenge, peer, user, onClose, onUpdated }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (!challenge) return null;

  const gc = parseGc(challenge.game_config);
  const isCreator = Number(user?.id) === Number(challenge.creator_id);
  const st = (challenge.status || '').toLowerCase();
  const isPending = st === 'open';
  const amt = parseFloat(challenge.amount) || 0;
  const isComp = amt > 0;
  const rivalName = challenge.creator_username || peer?.username || 'Jugador';
  const title = isCreator ? `Reto con ${peer?.username || 'rival'}` : `Reto de ${rivalName}`;

  const expiresAt = challenge.expires_at ? new Date(challenge.expires_at) : null;
  const expiresLabel =
    expiresAt && !Number.isNaN(expiresAt.getTime())
      ? expiresAt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
      : null;

  const accept = async () => {
    setLoading(true);
    try {
      const res = await challengeApi.accept(challenge.id);
      const battleId = res.data?.battleId || res.data?.challengeId || challenge.id;
      getSocket()?.emit('battle:startGame', { battleId });
      toast.success('Reto aceptado');
      onUpdated?.();
      onClose();
      navigate('/game');
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo aceptar');
    } finally {
      setLoading(false);
    }
  };

  const reject = async () => {
    setLoading(true);
    try {
      await challengeApi.reject(challenge.id);
      toast.success('Reto rechazado');
      onUpdated?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo rechazar');
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    setLoading(true);
    try {
      await challengeApi.cancel(challenge.id);
      toast.success('Reto cancelado');
      onUpdated?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo cancelar');
    } finally {
      setLoading(false);
    }
  };

  const goGame = () => {
    const battleId = challenge.id;
    getSocket()?.emit('battle:startGame', { battleId });
    onClose();
    navigate('/game');
  };

  let footerNote = null;
  if (st === 'rejected') footerNote = isCreator ? 'El rival rechazó el reto.' : 'Reto rechazado.';
  else if (st === 'expired') footerNote = 'Este reto expiró.';
  else if (st === 'cancelled') footerNote = 'El reto fue cancelado.';
  else if (st === 'accepted') footerNote = 'Reto aceptado. Podés entrar a la partida.';
  else if (st === 'finished') footerNote = 'La partida asociada ya finalizó.';

  return (
    <motion.div
      className="modal-overlay friend-challenge-overlay friend-respond-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <motion.div
        className="friend-challenge-modal friend-respond-modal fx-card"
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fr-title"
      >
        <header className="friend-challenge-header">
          <div className="friend-challenge-header-text">
            <h2 id="fr-title" className="friend-challenge-title">
              {title}
            </h2>
            <p className="friend-challenge-subtitle">Detalle del desafío 1v1</p>
          </div>
          <button type="button" className="friend-challenge-close" onClick={() => !loading && onClose()} aria-label="Cerrar">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="friend-respond-badges">
          <span className={`fx-badge${isComp ? ' fx-badge--gold' : ' fx-badge--muted'}`.trim()}>
            {isComp ? 'Competitivo' : 'Clásico'}
          </span>
          <span className="fx-badge fx-badge--muted">{statusHuman(st)}</span>
        </div>

        <dl className="friend-challenge-summary-dl friend-respond-dl">
          <div className="friend-challenge-summary-row">
            <dt>Puntos</dt>
            <dd>{gc.puntosMaximos ?? 30}</dd>
          </div>
          <div className="friend-challenge-summary-row">
            <dt>Flor</dt>
            <dd>{gc.florHabilitada ? 'Sí' : 'No'}</dd>
          </div>
          {isComp && (
            <div className="friend-challenge-summary-row">
              <dt>Monto</dt>
              <dd>{amt.toLocaleString('es-AR')} créditos</dd>
            </div>
          )}
          {expiresLabel && isPending && (
            <div className="friend-challenge-summary-row">
              <dt>Expira</dt>
              <dd>{expiresLabel}</dd>
            </div>
          )}
        </dl>

        {footerNote && <p className="friend-respond-note">{footerNote}</p>}

        <div className="friend-challenge-actions friend-respond-actions">
          {!isCreator && isPending && (
            <>
              <button type="button" className="btn btn-ghost" onClick={reject} disabled={loading}>
                Rechazar
              </button>
              <button type="button" className="btn btn-primary" onClick={accept} disabled={loading}>
                {loading ? '…' : 'Aceptar'}
              </button>
            </>
          )}
          {isCreator && isPending && (
            <>
              <p className="friend-respond-waiting">Esperando respuesta del rival…</p>
              <button type="button" className="btn btn-ghost btn-block" onClick={cancel} disabled={loading}>
                Cancelar reto
              </button>
            </>
          )}
          {st === 'accepted' && challenge.room_id && (
            <button type="button" className="btn btn-primary btn-block" onClick={goGame}>
              <Swords size={16} aria-hidden /> Ir a partida
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-block" onClick={() => !loading && onClose()}>
            Cerrar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

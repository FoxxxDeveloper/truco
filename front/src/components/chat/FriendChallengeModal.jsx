import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { challengeApi } from '../../services/api';

const MIN_COMP = 2500;

export default function FriendChallengeModal({ friend, onClose }) {
  const [mode, setMode] = useState('classic');
  const [puntos, setPuntos] = useState(30);
  const [flor, setFlor] = useState(false);
  const [amount, setAmount] = useState(String(MIN_COMP));
  const [sending, setSending] = useState(false);

  const gameConfig = { puntosMaximos: puntos, florHabilitada: flor };

  const send = async () => {
    setSending(true);
    try {
      if (mode === 'classic') {
        await challengeApi.createFriendClassic({
          challengedId: friend.id,
          puntosMaximos: puntos,
          florHabilitada: flor,
        });
        toast.success('Reto amistoso enviado');
      } else {
        const n = parseFloat(amount);
        if (!Number.isFinite(n) || n < MIN_COMP) {
          toast.error(`El mínimo es ${MIN_COMP} créditos`);
          setSending(false);
          return;
        }
        await challengeApi.create({
          amount: n,
          isPrivate: true,
          opponentId: friend.id,
          gameConfig,
        });
        toast.success('Reto competitivo enviado');
      }
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'No se pudo enviar el reto');
    } finally {
      setSending(false);
    }
  };

  const amtNum = parseFloat(amount);

  return (
    <motion.div
      className="modal-overlay friend-challenge-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="friend-challenge-modal fx-card"
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fc-title"
        aria-describedby="fc-desc"
      >
        <header className="friend-challenge-header">
          <div className="friend-challenge-header-text">
            <h2 id="fc-title" className="friend-challenge-title">
              Retar a {friend.username}
            </h2>
            <p id="fc-desc" className="friend-challenge-subtitle">
              Elegí el tipo de partida y configurá el desafío.
            </p>
          </div>
          <button type="button" className="friend-challenge-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="friend-challenge-tabs" role="tablist" aria-label="Tipo de partida">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'classic'}
            className={`friend-challenge-tab${mode === 'classic' ? ' friend-challenge-tab--active' : ''}`}
            onClick={() => setMode('classic')}
          >
            <span className="friend-challenge-tab-label">Clásico</span>
            <span className="friend-challenge-tab-hint">Sin apuesta · sin ranking</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'competitive'}
            className={`friend-challenge-tab${mode === 'competitive' ? ' friend-challenge-tab--active' : ''}`}
            onClick={() => setMode('competitive')}
          >
            <span className="friend-challenge-tab-label">Competitivo</span>
            <span className="friend-challenge-tab-hint">Créditos · verificación</span>
          </button>
        </div>

        <div className="friend-challenge-form">
          <div className="friend-challenge-field form-group">
            <label className="form-label" htmlFor="fc-puntos">
              Puntos
            </label>
            <select
              id="fc-puntos"
              className="form-input form-select"
              value={puntos}
              onChange={(e) => setPuntos(Number(e.target.value))}
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
            </select>
          </div>

          <div className="friend-challenge-field friend-challenge-field--toggle">
            <span className="form-label" id="fc-flor-label">
              Flor habilitada
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={flor}
              aria-labelledby="fc-flor-label"
              className={`friend-challenge-toggle${flor ? ' friend-challenge-toggle--on' : ''}`}
              onClick={() => setFlor((f) => !f)}
            >
              <span className="friend-challenge-toggle-track" aria-hidden>
                <span className="friend-challenge-toggle-thumb" />
              </span>
              <span className="friend-challenge-toggle-text">{flor ? 'Sí' : 'No'}</span>
            </button>
          </div>

          {mode === 'competitive' && (
            <div className="friend-challenge-field form-group">
              <label className="form-label" htmlFor="fc-monto">
                Monto en créditos
              </label>
              <input
                id="fc-monto"
                type="number"
                className="form-input"
                min={MIN_COMP}
                step={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
              <p className="friend-challenge-field-hint">
                El rival deberá tener saldo suficiente para aceptar.
              </p>
              <p className="friend-challenge-field-hint">La apuesta queda bloqueada hasta finalizar la partida.</p>
            </div>
          )}
        </div>

        <div className="friend-challenge-summary fx-card">
          <p className="friend-challenge-summary-title">Resumen</p>
          <dl className="friend-challenge-summary-dl">
            <div className="friend-challenge-summary-row">
              <dt>Rival</dt>
              <dd>{friend.username}</dd>
            </div>
            <div className="friend-challenge-summary-row">
              <dt>Tipo</dt>
              <dd>{mode === 'classic' ? 'Clásico' : 'Competitivo'}</dd>
            </div>
            <div className="friend-challenge-summary-row">
              <dt>Puntos</dt>
              <dd>{puntos}</dd>
            </div>
            <div className="friend-challenge-summary-row">
              <dt>Flor</dt>
              <dd>{flor ? 'Sí' : 'No'}</dd>
            </div>
            {mode === 'competitive' && (
              <div className="friend-challenge-summary-row">
                <dt>Monto</dt>
                <dd>{Number.isFinite(amtNum) ? `${amtNum.toLocaleString('es-AR')} cr` : '—'}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="friend-challenge-actions">
          <button type="button" className="btn btn-secondary friend-challenge-btn-cancel" onClick={onClose} disabled={sending}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary friend-challenge-btn-send" onClick={send} disabled={sending}>
            {sending ? 'Enviando…' : mode === 'classic' ? 'Enviar reto' : 'Enviar reto competitivo'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

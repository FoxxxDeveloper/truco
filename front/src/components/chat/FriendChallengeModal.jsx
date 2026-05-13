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
        className="modal-panel friend-challenge-panel fx-card"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fc-title"
      >
        <div className="friend-challenge-head">
          <h2 id="fc-title" className="friend-challenge-title">
            Retar a {friend.username}
          </h2>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="friend-challenge-modes">
          <button
            type="button"
            className={`friend-challenge-mode${mode === 'classic' ? ' friend-challenge-mode--on' : ''}`}
            onClick={() => setMode('classic')}
          >
            Clásico
            <span className="friend-challenge-mode-hint">Sin apuesta · sin ranking</span>
          </button>
          <button
            type="button"
            className={`friend-challenge-mode${mode === 'competitive' ? ' friend-challenge-mode--on' : ''}`}
            onClick={() => setMode('competitive')}
          >
            Competitivo
            <span className="friend-challenge-mode-hint">Créditos · verificación</span>
          </button>
        </div>

        <div className="friend-challenge-fields">
          <label className="option-row">
            <span className="option-label">Puntos</span>
            <select className="form-input" value={puntos} onChange={(e) => setPuntos(Number(e.target.value))}>
              <option value={15}>15</option>
              <option value={30}>30</option>
            </select>
          </label>
          <label className="option-row friend-challenge-flor">
            <span className="option-label">Flor</span>
            <input type="checkbox" checked={flor} onChange={(e) => setFlor(e.target.checked)} />
          </label>
          {mode === 'competitive' && (
            <label className="option-row">
              <span className="option-label">Monto (créditos)</span>
              <input
                type="number"
                className="form-input"
                min={MIN_COMP}
                step={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          )}
        </div>

        <div className="friend-challenge-summary fx-card">
          <p className="friend-challenge-sum-title">Resumen</p>
          <ul className="friend-challenge-sum-list">
            <li>
              <strong>Rival</strong> {friend.username}
            </li>
            <li>
              <strong>Tipo</strong> {mode === 'classic' ? 'Clásico' : 'Competitivo'}
            </li>
            <li>
              <strong>Puntos</strong> {puntos}
            </li>
            <li>
              <strong>Flor</strong> {flor ? 'Sí' : 'No'}
            </li>
            {mode === 'competitive' && (
              <li>
                <strong>Monto</strong> {Number.isFinite(amtNum) ? `${amtNum.toLocaleString('es-AR')} cr` : '—'}
              </li>
            )}
          </ul>
        </div>

        <div className="friend-challenge-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={sending}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? 'Enviando…' : mode === 'classic' ? 'Enviar reto' : 'Enviar reto competitivo'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

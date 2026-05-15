import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { challengeApi, walletApi } from '../../services/api';

const POINTS_OPTIONS = [15, 30];

export default function ChallengesBrowser({ onClose }) {
  const { user } = useAuth();

  const [challenges, setChallenges] = useState([]);
  const [balance, setBalance] = useState(null);
  const [tab, setTab] = useState('open');
  const [form, setForm] = useState({
    amount: '',
    puntosMaximos: 30,
    florHabilitada: false,
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [chalRes, walRes] = await Promise.all([
        challengeApi.list(),
        walletApi.getBalance(),
      ]);

      setChallenges(chalRes.data.challenges || []);
      setBalance(parseFloat(walRes.data.balance || 0));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cargar retos');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createChallenge = async () => {
    const amt = parseFloat(form.amount);

    if (!amt || amt <= 0) {
      toast.error('Monto inválido');
      return;
    }

    if (balance !== null && amt > balance) {
      toast.error('Saldo insuficiente');
      return;
    }

    setLoading(true);

    try {
      await challengeApi.create({
        amount: amt,
        isPrivate: false,
        gameConfig: {
          puntosMaximos: form.puntosMaximos,
          florHabilitada: form.florHabilitada,
          modo: 'apuesta',
        },
      });

      toast.success('Reto creado. Esperando rival…');

      setForm({
        amount: '',
        puntosMaximos: 30,
        florHabilitada: false,
      });

      setTab('open');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Error al crear reto');
    } finally {
      setLoading(false);
    }
  };

  const acceptChallenge = async (challengeId) => {
    setLoading(true);

    try {
      await challengeApi.accept(challengeId);

      toast.success('¡Reto aceptado! Buscando partida…');

      await load();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Error al aceptar reto');
    } finally {
      setLoading(false);
    }
  };

  const cancelChallenge = async (id) => {
    setLoading(true);

    try {
      await challengeApi.cancel(id);

      toast.success('Reto cancelado');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cancelar reto');
    } finally {
      setLoading(false);
    }
  };

  const myChallenges = challenges.filter((c) => c.creator_id === user?.id);
  const otherChallenges = challenges.filter((c) => c.creator_id !== user?.id);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        zIndex: 200,
        padding: 16,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9 }}
        style={{
          background: '#1e2a1a',
          border: '1px solid rgba(200,148,58,.35)',
          borderRadius: 16,
          padding: 28,
          width: 480,
          maxWidth: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, color: '#ffc757' }}>Batallas competitivas</h2>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 22,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {balance !== null && (
          <div
            style={{
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: 8,
              padding: '8px 14px',
              marginBottom: 14,
              color: '#4ade80',
              fontWeight: 700,
            }}
          >
            Saldo disponible: ${balance.toFixed(2)}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 16,
            background: 'rgba(0,0,0,.3)',
            borderRadius: 10,
            padding: 4,
          }}
        >
          {[
            ['open', `Abiertas (${otherChallenges.length})`],
            ['mine', `Mis retos (${myChallenges.length})`],
            ['create', '+ Crear'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                padding: '7px 4px',
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                background: tab === id ? 'var(--accent-blue)' : 'transparent',
                color: tab === id ? '#fff' : 'var(--text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {tab === 'open' && (
            otherChallenges.length === 0 ? (
              <p
                style={{
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '2rem 0',
                }}
              >
                No hay retos abiertos
              </p>
            ) : (
              otherChallenges.map((c) => (
                <ChallengeCard
                  key={c.id}
                  c={c}
                  onAccept={() => acceptChallenge(c.id)}
                  loading={loading}
                />
              ))
            )
          )}

          {tab === 'mine' && (
            myChallenges.length === 0 ? (
              <p
                style={{
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '2rem 0',
                }}
              >
                No tenés retos activos
              </p>
            ) : (
              myChallenges.map((c) => (
                <ChallengeCard
                  key={c.id}
                  c={c}
                  onCancel={() => cancelChallenge(c.id)}
                  loading={loading}
                  mine
                />
              ))
            )
          )}

          {tab === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Monto apostado ($)
                </label>

                <input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="Ej: 100"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  className="form-input"
                />
              </div>

              <div>
                <label
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Puntos para ganar
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                  {POINTS_OPTIONS.map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        setForm((f) => ({ ...f, puntosMaximos: p }))
                      }
                      style={{
                        flex: 1,
                        padding: '9px 0',
                        borderRadius: 8,
                        border: `2px solid ${
                          form.puntosMaximos === p
                            ? 'var(--accent-blue)'
                            : 'var(--border)'
                        }`,
                        background:
                          form.puntosMaximos === p
                            ? 'rgba(31,111,235,0.15)'
                            : 'var(--bg-surface)',
                        color:
                          form.puntosMaximos === p
                            ? 'var(--accent-blue)'
                            : 'var(--text-muted)',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {p} pts
                    </button>
                  ))}
                </div>
              </div>

              <label
                style={{
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.florHabilitada}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      florHabilitada: e.target.checked,
                    }))
                  }
                  style={{ width: 16, height: 16 }}
                />
                Flor habilitada
              </label>

              <button
                onClick={createChallenge}
                disabled={loading}
                className="btn btn-raise"
                style={{
                  width: '100%',
                  padding: '12px 0',
                  fontSize: 15,
                }}
              >
                {loading ? 'Creando…' : 'Publicar reto'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChallengeCard({ c, onAccept, onCancel, loading, mine }) {
  const expiresIn = Math.max(
    0,
    Math.floor((new Date(c.expires_at) - Date.now()) / 60000)
  );

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 10,
        }}
      >
        <div>
          <div
            style={{
              color: 'var(--accent-gold)',
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            ${parseFloat(c.amount).toFixed(2)}
          </div>

          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {mine ? 'Tu reto' : `por ${c.creator_username}`} ·{' '}
            {c.game_config?.puntosMaximos || 30}pts
            {c.game_config?.florHabilitada ? ' · con flor' : ''}
          </div>
        </div>

        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: 11,
            background: 'var(--bg-surface2)',
            padding: '3px 8px',
            borderRadius: 12,
          }}
        >
          {expiresIn > 0 ? `${expiresIn}min` : 'Expira pronto'}
        </div>
      </div>

      {mine ? (
        <button
          onClick={onCancel}
          disabled={loading}
          className="btn btn-danger"
          style={{ width: '100%', fontSize: 13 }}
        >
          Cancelar reto
        </button>
      ) : (
        <button
          onClick={onAccept}
          disabled={loading}
          className="btn btn-raise"
          style={{ width: '100%', fontSize: 14 }}
        >
          Aceptar reto
        </button>
      )}
    </div>
  );
}
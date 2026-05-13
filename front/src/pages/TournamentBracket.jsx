import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import { tournamentApi } from '../services/api';
import { tournamentStatusLabel } from '../utils/tournaments';
import AppHeader from '../components/layout/AppHeader';

function matchStatusLabel(s) {
  const map = {
    pending: 'Pendiente',
    ready: 'Listo',
    waiting_ready: 'Esperando listos',
    active: 'En juego',
    finished: 'Finalizado',
    walkover: 'Walkover',
    cancelled: 'Cancelado',
  };
  return map[s] || s || '—';
}

export default function TournamentBracket() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  const tid = Number(id);

  const load = useCallback(async () => {
    if (!tid || Number.isNaN(tid)) return;
    setLoading(true);
    try {
      const brRes = await tournamentApi.getBracket(tid);
      setData(brRes.data?.bracket || null);
      try {
        const d = await tournamentApi.getById(tid);
        setMeta(d.data?.tournament || null);
      } catch {
        setMeta(null);
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo cargar el cuadro');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tid]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="tournament-bracket page-container tournament-detail--et2">
        <p className="tournaments-loading">Cargando cuadro…</p>
      </div>
    );
  }

  const t = data?.tournament;
  const rounds = data?.rounds || {};
  const roundKeys = Object.keys(rounds).sort((a, b) => Number(a) - Number(b));
  const prizeLine = meta?.prize_text || null;

  return (
    <div className="tournament-bracket page-container tournament-detail--et2 page-shell">
      <AppHeader />
      <header className="bracket-header--et2 bracket-header--et2-inner">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/torneos/${tid}`)}>
          <ArrowLeft size={18} aria-hidden /> Torneo
        </button>
        <h1>Cuadro{t?.name ? ` — ${t.name}` : ''}</h1>
        {t?.status && (
          <span className={`tournament-status status-${t.status}`}>{tournamentStatusLabel(t.status)}</span>
        )}
        <Link to={`/torneos/${tid}?tab=positions`} className="btn btn-secondary btn-sm bracket-pos-link">
          Ver posiciones
        </Link>
      </header>
      {prizeLine && <p className="bracket-prize-line">{prizeLine}</p>}

      {roundKeys.length === 0 ? (
        <p className="tournaments-empty">El cuadro aún no fue generado.</p>
      ) : (
        <div className="bracket-board">
          <div className="bracket-scroll">
            <div className="bracket-columns">
              {roundKeys.map((rk) => (
                <div key={rk} className="bracket-round">
                  <h2 className="bracket-round-title">Ronda {rk}</h2>
                  <div className="bracket-matches">
                    {(rounds[rk] || []).map((m) => {
                      const w1 = m.winner?.id === m.player1?.id;
                      const w2 = m.winner?.id === m.player2?.id;
                      return (
                        <div key={m.id} className="bracket-match-card">
                          <div className="bracket-match-meta">
                            #{m.match_number} · {matchStatusLabel(m.status)}
                          </div>
                          <div className={`match-player ${w1 ? 'match-winner' : ''}`}>
                            {m.player1?.username || '—'}
                          </div>
                          <div className={`match-player ${w2 ? 'match-winner' : ''}`}>
                            {m.player2?.username || '—'}
                          </div>
                          {(m.status === 'ready' || m.status === 'waiting_ready') && (
                            <div className="bracket-readiness--et2">
                              <span>
                                P1:{' '}
                                {m.player1_ready ? <Check size={14} aria-label="listo" /> : <Minus size={14} aria-label="pendiente" />}
                              </span>
                              <span>
                                P2:{' '}
                                {m.player2_ready ? <Check size={14} aria-label="listo" /> : <Minus size={14} aria-label="pendiente" />}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="bracket-footer-link">
        <Link to={`/torneos/${tid}`}>Volver al detalle</Link>
      </p>
    </div>
  );
}

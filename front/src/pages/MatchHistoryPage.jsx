import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import AppHeader from '../components/layout/AppHeader';
import TrucoAvatar from '../components/avatar/TrucoAvatar';
import { profileApi } from '../services/api';

function resultLabel(r) {
  if (r === 'won') return 'Ganaste';
  if (r === 'lost') return 'Perdiste';
  return 'Sin resultado';
}

function creditsDeltaCell(m) {
  if (!m?.has_credit_movement || m.credits_delta == null) return '—';
  const n = Number(m.credits_delta);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-6) return '—';
  if (n > 0) return `+${n.toLocaleString('es-AR')}`;
  return n.toLocaleString('es-AR');
}

/** Texto largo para detalle / cards; null si no hubo movimiento. */
function creditsMovementPhrase(m) {
  if (!m?.has_credit_movement || m.credits_delta == null) return null;
  const n = Number(m.credits_delta);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-6) return null;
  const abs = Math.abs(n);
  if (n > 0) return `Ganaste +${abs.toLocaleString('es-AR')} créditos`;
  return `Perdiste ${abs.toLocaleString('es-AR')} créditos`;
}

export default function MatchHistoryPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('');
  const [result, setResult] = useState('');
  const [rival, setRival] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detail, setDetail] = useState(null);

  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = { page, limit: 20 };
      if (mode) params.mode = mode;
      if (result) params.result = result;
      if (rival.trim()) params.rival = rival.trim();
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await profileApi.getMatchHistory(params);
      const list = res.data?.matches || [];
      setRows(list);
      setPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch {
      setLoadError(true);
      setRows([]);
      setPagination({ page: 1, limit: 20, total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [mode, result, rival, dateFrom, dateTo]);

  useEffect(() => {
    load(1);
  }, [load]);

  const applyFilters = () => load(1);

  return (
    <div className="match-history-page page-container app-page">
      <AppHeader />
      <div className="page-shell">
      <motion.div
        className="match-history-inner fx-card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <header className="match-history-header">
          <h1 className="page-title">Historial de partidas</h1>
          <p className="page-subtitle match-history-sub">
            Revisá tus partidas jugadas, resultados y modos.
          </p>
        </header>

        <div className="match-history-filters">
          <label className="match-history-filter form-field">
            <span className="form-label">Modo</span>
            <select className="form-select form-control" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">Todos</option>
              <option value="classic_friend">Amistosa</option>
              <option value="competitive_friend">Competitiva</option>
              <option value="battle">Batalla</option>
              <option value="tournament">Torneo</option>
            </select>
          </label>
          <label className="match-history-filter form-field">
            <span className="form-label">Resultado</span>
            <select className="form-select form-control" value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">Todos</option>
              <option value="won">Ganaste</option>
              <option value="lost">Perdiste</option>
              <option value="unknown">Sin resultado</option>
            </select>
          </label>
          <label className="match-history-filter form-field">
            <span className="form-label">Desde</span>
            <input className="form-input form-control" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="match-history-filter form-field">
            <span className="form-label">Hasta</span>
            <input className="form-input form-control" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="match-history-filter match-history-filter--grow form-field">
            <span className="form-label">Rival</span>
            <input
              type="search"
              className="form-input form-control"
              placeholder="Usuario"
              value={rival}
              onChange={(e) => setRival(e.target.value)}
              maxLength={64}
            />
          </label>
          <button type="button" className="btn btn-primary match-history-apply" onClick={applyFilters}>
            Aplicar
          </button>
        </div>

        {loading && <p className="match-history-loading">Cargando…</p>}

        {!loading && loadError && (
          <div className="fx-card match-history-error-banner" role="alert">
            <p className="match-history-error-text">No pudimos cargar tu historial.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => load(1)}>
              Reintentar
            </button>
          </div>
        )}

        {!loading && !loadError && rows.length === 0 && (
          <p className="tournaments-empty">Todavía no hay partidas finalizadas que coincidan con los filtros.</p>
        )}

        {!loading && !loadError && rows.length > 0 && (
          <>
            <div className="match-history-desktop">
              <table className="admin-table admin-table--compact match-history-table">
                <thead>
                  <tr>
                    <th>Rival</th>
                    <th>Resultado</th>
                    <th>Score</th>
                    <th>Modo</th>
                    <th>Fecha</th>
                    <th>Créditos</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.partida_id}>
                      <td>
                        <div className="match-history-rival">
                          <TrucoAvatar username={m.opponent?.username} avatar={m.opponent?.avatar} size={32} />
                          <span>{m.opponent?.username}</span>
                        </div>
                      </td>
                      <td>{resultLabel(m.result)}</td>
                      <td className="admin-table-muted">
                        {m.score_me} — {m.score_opponent}
                      </td>
                      <td>
                        <span className="fx-badge fx-badge--muted">{m.mode_label}</span>
                      </td>
                      <td className="admin-table-muted">
                        {m.finished_at
                          ? new Date(m.finished_at).toLocaleString('es-AR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                      <td className="admin-table-muted">{creditsDeltaCell(m)}</td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetail(m)}>
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="match-history-mobile">
              {rows.map((m) => {
                const creditMsg = creditsMovementPhrase(m);
                return (
                <li key={m.partida_id} className="match-history-card fx-card">
                  <div className="match-history-card-top">
                    <TrucoAvatar username={m.opponent?.username} avatar={m.opponent?.avatar} size={40} />
                    <div>
                      <strong>{m.opponent?.username}</strong>
                      <div className="match-history-card-meta">
                        <span className="fx-badge fx-badge--muted">{m.mode_label}</span>
                        <span className="match-history-result">{resultLabel(m.result)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="match-history-card-scores">
                    {m.score_me} <span className="match-history-vs">—</span> {m.score_opponent}
                  </div>
                  {creditMsg && (
                    <div className="match-history-card-credits admin-table-muted">{creditMsg}</div>
                  )}
                  <div className="match-history-card-foot">
                    <span className="admin-table-muted">
                      {m.finished_at
                        ? new Date(m.finished_at).toLocaleString('es-AR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : ''}
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetail(m)}>
                      Detalle
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>

            <div className="match-history-pagination">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => load(pagination.page - 1)}
              >
                Anterior
              </button>
              <span className="admin-table-muted">
                Página {pagination.page} de {pagination.totalPages} ({pagination.total} partidas)
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => load(pagination.page + 1)}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </motion.div>

      <AnimatePresence>
        {detail && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setDetail(null)}
          >
            <motion.div
              className="fx-card match-history-detail-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <header className="match-history-detail-head">
                <h2>Detalle de partida</h2>
                <button type="button" className="friend-challenge-close" onClick={() => setDetail(null)} aria-label="Cerrar">
                  <X size={18} aria-hidden />
                </button>
              </header>
              <dl className="friend-challenge-summary-dl">
                <div className="friend-challenge-summary-row">
                  <dt>Sala</dt>
                  <dd className="match-history-mono">{detail.room_id}</dd>
                </div>
                <div className="friend-challenge-summary-row">
                  <dt>Rival</dt>
                  <dd>{detail.opponent?.username}</dd>
                </div>
                <div className="friend-challenge-summary-row">
                  <dt>Modo</dt>
                  <dd>{detail.mode_label}</dd>
                </div>
                <div className="friend-challenge-summary-row">
                  <dt>Puntos máx.</dt>
                  <dd>{detail.puntos_maximos ?? '—'}</dd>
                </div>
                <div className="friend-challenge-summary-row">
                  <dt>Flor</dt>
                  <dd>{detail.flor_habilitada == null ? '—' : detail.flor_habilitada ? 'Sí' : 'No'}</dd>
                </div>
                <div className="friend-challenge-summary-row">
                  <dt>Resultado</dt>
                  <dd>{resultLabel(detail.result)}</dd>
                </div>
                <div className="friend-challenge-summary-row">
                  <dt>Score</dt>
                  <dd>
                    {detail.score_me} — {detail.score_opponent}
                  </dd>
                </div>
                {(() => {
                  const creditText = creditsMovementPhrase(detail);
                  return creditText ? (
                    <div className="friend-challenge-summary-row">
                      <dt>Créditos</dt>
                      <dd>{creditText}</dd>
                    </div>
                  ) : null;
                })()}
                {detail.tournament && (
                  <div className="friend-challenge-summary-row">
                    <dt>Torneo</dt>
                    <dd>
                      {detail.tournament.name} (ronda {detail.tournament.round ?? '—'})
                    </dd>
                  </div>
                )}
                {detail.challenge && (
                  <div className="friend-challenge-summary-row">
                    <dt>Reto / apuesta</dt>
                    <dd>
                      {detail.challenge.amount != null
                        ? `${Number(detail.challenge.amount).toLocaleString('es-AR')} cr`
                        : '—'}
                    </dd>
                  </div>
                )}
              </dl>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setDetail(null)}>
                Cerrar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy,
  Calendar,
  Users,
  Shield,
  Swords,
  Play,
  CheckCircle,
  XCircle,
  Crown,
  Plus,
  Pencil,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { tournamentApi, adminTournamentApi } from '../../services/api';
import { formatDate } from '../../utils/tournaments';
import TrucoAvatar from '../avatar/TrucoAvatar';

const PRESETS = {
  opening128: {
    label: 'Torneo Apertura TrucoFX 128 (recomendado)',
    name: 'Torneo Apertura TrucoFX',
    description:
      'Torneo gratuito de lanzamiento de TrucoFX. Cupo principal de 128 jugadores. Los inscriptos que superen el cupo quedan como suplentes y podrán ingresar si un titular no realiza el check-in.',
    prize_text: '$100.000 ARS al campeón',
    paid_positions: 1,
    prize_currency: 'ARS',
    prize_1: '$100.000',
    prize_2: '',
    prize_3: '',
    prize_4: '',
    third_place_match: false,
    max_players: 128,
    entry_fee: 0,
    is_paid: false,
    prize_amount: '',
    format: 'single_elimination',
    phase: 'general',
    puntos_maximos: 15,
    flor_habilitada: false,
    turn_seconds: 30,
    reconnect_seconds: 60,
    ready_timeout_minutes: 5,
    auto_checkin_enabled: true,
    auto_start_enabled: true,
    starts_at: '',
    checkin_starts_at: '',
    registration_closes_at: '',
  },
  qualifierA: {
    label: 'Clasificatorio A',
    name: 'Torneo Apertura TrucoFX - Clasificatorio A',
    description: 'Clasificatorio A — 64 titulares, 4 clasifican.',
    prize_text: '$100.000 ARS al campeón final',
    max_players: 64,
    format: 'qualifier',
    phase: 'qualifier_a',
    puntos_maximos: 15,
    flor_habilitada: false,
    turn_seconds: 30,
    reconnect_seconds: 60,
    starts_at: '',
    checkin_starts_at: '',
    registration_closes_at: '',
  },
  qualifierB: {
    label: 'Clasificatorio B',
    name: 'Torneo Apertura TrucoFX - Clasificatorio B',
    description: 'Clasificatorio B — 64 titulares, 4 clasifican.',
    prize_text: '$100.000 ARS al campeón final',
    max_players: 64,
    format: 'qualifier',
    phase: 'qualifier_b',
    puntos_maximos: 15,
    flor_habilitada: false,
    turn_seconds: 30,
    reconnect_seconds: 60,
    starts_at: '',
    checkin_starts_at: '',
    registration_closes_at: '',
  },
  finals: {
    label: 'Finales',
    name: 'Torneo Apertura TrucoFX - Finales',
    description: 'Finales con 8 jugadores.',
    prize_text: '$100.000 ARS al campeón',
    max_players: 8,
    format: 'finals',
    phase: 'finals',
    puntos_maximos: 30,
    flor_habilitada: false,
    turn_seconds: 30,
    reconnect_seconds: 60,
    starts_at: '',
    checkin_starts_at: '',
    registration_closes_at: '',
  },
};

function flattenBracket(bracket) {
  if (!bracket || typeof bracket !== 'object') return [];
  const out = [];
  for (const [round, matches] of Object.entries(bracket)) {
    for (const m of matches || []) {
      out.push({ ...m, round_number: Number(round) });
    }
  }
  return out.sort((a, b) => a.round_number - b.round_number || a.match_number - b.match_number);
}

function hasBracket(t) {
  const b = t?.bracket;
  if (!b || typeof b !== 'object') return false;
  return Object.keys(b).length > 0;
}

function TournamentStatusBadge({ status }) {
  return <span className={`admin-t-badge admin-t-badge--${status || 'unknown'}`}>{status || '—'}</span>;
}

function RegStatusBadge({ status }) {
  return <span className={`admin-t-reg-badge admin-t-reg-badge--${status || 'unknown'}`}>{status || '—'}</span>;
}

function MatchStatusBadge({ status }) {
  return <span className={`admin-t-match-badge admin-t-match-badge--${status || 'unknown'}`}>{status || '—'}</span>;
}

const emptyForm = {
  name: '',
  description: '',
  prize_text: '',
  paid_positions: 1,
  prize_currency: '',
  prize_1: '',
  prize_2: '',
  prize_3: '',
  prize_4: '',
  third_place_match: false,
  max_players: 128,
  format: 'single_elimination',
  phase: 'general',
  puntos_maximos: 15,
  flor_habilitada: false,
  turn_seconds: 30,
  reconnect_seconds: 60,
  entry_fee: 0,
  prize_amount: '',
  is_paid: false,
  auto_checkin_enabled: true,
  auto_start_enabled: true,
  ready_timeout_minutes: 5,
  starts_at: '',
  checkin_starts_at: '',
  registration_closes_at: '',
};

export default function TournamentAdminPanel() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('resumen');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await tournamentApi.getAll();
      setList(r.data?.tournaments || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al cargar torneos');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const r = await tournamentApi.getById(id);
      setDetail(r.data?.tournament || null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al cargar detalle');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selected) loadDetail(selected);
    else setDetail(null);
  }, [selected, loadDetail]);

  const flatMatches = useMemo(() => flattenBracket(detail?.bracket), [detail?.bracket]);

  const openCreate = () => {
    setForm({ ...emptyForm, ...PRESETS.opening128 });
    setCreateOpen(true);
  };

  const openEdit = () => {
    if (!detail) return;
    let pc = {};
    let plc = {};
    try {
      pc = typeof detail.prize_config === 'string' ? JSON.parse(detail.prize_config || '{}') : (detail.prize_config || {});
    } catch {
      pc = {};
    }
    try {
      plc = typeof detail.placement_config === 'string' ? JSON.parse(detail.placement_config || '{}') : (detail.placement_config || {});
    } catch {
      plc = {};
    }
    const paid = Math.min(4, Math.max(1, Number(pc.paid_positions) || Object.keys(pc.positions || {}).length || 1));
    const pos = pc.positions || {};
    setForm({
      name: detail.name || '',
      description: detail.description || '',
      prize_text: detail.prize_text || '',
      paid_positions: paid,
      prize_currency: pc.currency || '',
      prize_1: pos['1']?.label || '',
      prize_2: pos['2']?.label || '',
      prize_3: pos['3']?.label || '',
      prize_4: pos['4']?.label || '',
      third_place_match: !!plc.third_place_match,
      max_players: detail.max_players ?? 64,
      format: detail.format || 'qualifier',
      phase: detail.phase || 'qualifier_a',
      puntos_maximos: detail.puntos_maximos ?? 15,
      flor_habilitada: !!detail.flor_habilitada,
      turn_seconds: detail.turn_seconds ?? 30,
      reconnect_seconds: detail.reconnect_seconds ?? 60,
      starts_at: detail.starts_at ? detail.starts_at.slice(0, 16) : '',
      checkin_starts_at: detail.checkin_starts_at ? detail.checkin_starts_at.slice(0, 16) : '',
      registration_closes_at: detail.registration_closes_at ? detail.registration_closes_at.slice(0, 16) : '',
      entry_fee: detail.entry_fee != null ? Number(detail.entry_fee) : 0,
      prize_amount: detail.prize_amount != null ? String(detail.prize_amount) : '',
      is_paid: !!detail.is_paid,
      auto_checkin_enabled: detail.auto_checkin_enabled !== 0,
      auto_start_enabled: detail.auto_start_enabled !== 0,
      ready_timeout_minutes: detail.ready_timeout_minutes ?? 5,
    });
    setEditOpen(true);
  };

  const buildPrizeConfigPayload = (f) => {
    const paid = Math.min(4, Math.max(1, parseInt(f.paid_positions, 10) || 1));
    const positions = {};
    for (let i = 1; i <= paid; i += 1) {
      const label = (f[`prize_${i}`] || '').trim();
      if (label) positions[String(i)] = { label };
    }
    if (Object.keys(positions).length === 0) return null;
    return {
      currency: (f.prize_currency || '').trim() || null,
      paid_positions: paid,
      positions,
    };
  };

  const toBody = (f) => ({
    name: f.name.trim(),
    description: f.description?.trim() || null,
    prize_text: f.prize_text?.trim() || null,
    prize_config: buildPrizeConfigPayload(f),
    placement_config: { third_place_match: !!f.third_place_match },
    max_players: Number(f.max_players),
    format: f.format,
    phase: f.phase,
    puntos_maximos: Number(f.puntos_maximos),
    flor_habilitada: !!f.flor_habilitada,
    turn_seconds: Number(f.turn_seconds),
    reconnect_seconds: Number(f.reconnect_seconds),
    starts_at: f.starts_at || null,
    checkin_starts_at: f.checkin_starts_at || null,
    registration_closes_at: f.registration_closes_at || null,
    entry_fee: Number(f.entry_fee) || 0,
    prize_amount: f.prize_amount === '' || f.prize_amount == null ? null : Number(f.prize_amount),
    is_paid: f.is_paid ? 1 : 0,
    auto_checkin_enabled: f.auto_checkin_enabled ? 1 : 0,
    auto_start_enabled: f.auto_start_enabled ? 1 : 0,
    ready_timeout_minutes: Number(f.ready_timeout_minutes) || 5,
  });

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setBusy(true);
    try {
      const r = await adminTournamentApi.create(toBody(form));
      toast.success('Torneo creado');
      setCreateOpen(false);
      await loadList();
      if (r.data?.tournamentId) setSelected(r.data.tournamentId);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al crear');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!detail?.id) return;
    setBusy(true);
    try {
      await adminTournamentApi.update(detail.id, toBody(form));
      toast.success('Torneo actualizado');
      setEditOpen(false);
      await loadList();
      await loadDetail(detail.id);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al actualizar');
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (label, fn) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await loadList();
      if (selected) await loadDetail(selected);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = (tournamentId) => {
    const tid = tournamentId ?? selected;
    if (!tid) return;
    if (!window.confirm('¿Cancelar este torneo?')) return;
    runAction('Torneo cancelado', () => adminTournamentApi.cancel(tid, {}));
  };

  const forceWinner = (matchId, winnerId, playerLabel) => {
    if (!window.confirm(`¿Forzar ganador: ${playerLabel}?`)) return;
    runAction('Resultado aplicado', () =>
      adminTournamentApi.forceResult(selected, matchId, {
        winnerId,
        reason: 'admin_decision',
      })
    );
  };

  const resolveAbsence = (matchId) => {
    if (!window.confirm('¿Resolver ausencia con las reglas actuales (listo vs no listo)?')) return;
    runAction('Ausencia resuelta', () => adminTournamentApi.resolveAbsence(selected, matchId));
  };

  const renderListCard = (t) => {
    const tit = Number(t.titular_count ?? 0);
    const sub = Number(t.substitute_count ?? 0);
    return (
      <button
        key={t.id}
        type="button"
        className={`admin-t-list-card ${selected === t.id ? 'is-selected' : ''}`}
        onClick={() => { setSelected(t.id); setDetailTab('resumen'); }}
      >
        <div className="admin-t-list-card-top">
          <Trophy size={18} className="admin-t-icon-gold" />
          <TournamentStatusBadge status={t.status} />
        </div>
        <h3 className="admin-t-list-title">{t.name}</h3>
        {t.prize_text && <p className="admin-t-list-prize">{t.prize_text}</p>}
        <div className="admin-t-list-meta">
          <span><Users size={14} /> {tit} tit.</span>
          <span><Shield size={14} /> {sub} supl.</span>
        </div>
        <div className="admin-t-list-meta subtle">
          <span>{t.phase}</span>
          <span>{t.format}</span>
          <span>max {t.max_players}</span>
        </div>
        <div className="admin-t-list-date">
          <Calendar size={14} /> {formatDate(t.starts_at)}
        </div>
      </button>
    );
  };

  const renderQuickActions = (t) => {
    if (!t) return null;
    const st = t.status;
    const bracketOk = hasBracket(t);

    return (
      <div className="admin-t-actions">
        {(st === 'draft' || st === 'open') && (
          <button type="button" className="btn btn-outline-gold btn-sm" disabled={busy} onClick={openEdit}>
            <Pencil size={14} /> Editar
          </button>
        )}
        {st === 'draft' && (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => runAction('Inscripción abierta', () => adminTournamentApi.open(t.id))}>
              Abrir inscripción
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => confirmCancel(t.id)}>
              <XCircle size={14} /> Cancelar
            </button>
          </>
        )}
        {st === 'open' && (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => runAction('Check-in abierto', () => adminTournamentApi.startCheckin(t.id))}>
              <CheckCircle size={14} /> Abrir check-in
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => confirmCancel(t.id)}>
              <XCircle size={14} /> Cancelar
            </button>
          </>
        )}
        {st === 'checkin' && (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => runAction('Bracket generado', () => adminTournamentApi.generateBracket(t.id))}>
              <Swords size={14} /> Generar bracket
            </button>
            {bracketOk && (
              <button type="button" className="btn btn-accept btn-sm" disabled={busy} onClick={() => runAction('Torneo iniciado', () => adminTournamentApi.start(t.id))}>
                <Play size={14} /> Iniciar torneo
              </button>
            )}
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => confirmCancel(t.id)}>
              <XCircle size={14} /> Cancelar
            </button>
          </>
        )}
        {st === 'started' && (
          <>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => confirmCancel(t.id)}>
              <XCircle size={14} /> Cancelar
            </button>
          </>
        )}
        {(st === 'finished' || st === 'cancelled') && null}
      </div>
    );
  };

  const FormFields = () => (
    <div className="admin-t-form-grid">
      <label>
        Nombre *
        <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </label>
      <label className="span-2">
        Descripción
        <textarea className="form-input" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </label>
      <label>
        Premio (texto general)
        <input className="form-input" value={form.prize_text} onChange={(e) => setForm((f) => ({ ...f, prize_text: e.target.value }))} />
      </label>
      <label className="span-2 section-label-like">Premios por posición</label>
      <label>
        Puestos premiados
        <select
          className="form-input"
          value={form.paid_positions}
          onChange={(e) => setForm((f) => ({ ...f, paid_positions: Number(e.target.value) }))}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </label>
      <label>
        Moneda (opcional, ej. ARS)
        <input className="form-input" value={form.prize_currency} onChange={(e) => setForm((f) => ({ ...f, prize_currency: e.target.value }))} />
      </label>
      {Array.from({ length: form.paid_positions }, (_, i) => i + 1).map((n) => (
        <label key={n}>
          {`Premio ${n}° puesto`}
          <input
            className="form-input"
            value={form[`prize_${n}`]}
            onChange={(e) => setForm((f) => ({ ...f, [`prize_${n}`]: e.target.value }))}
            placeholder="Ej: $50.000 o 10.000 créditos"
          />
        </label>
      ))}
      <label className="checkbox-row span-2">
        <input
          type="checkbox"
          checked={form.third_place_match}
          onChange={(e) => setForm((f) => ({ ...f, third_place_match: e.target.checked }))}
        />
        Disputar partido por 3° puesto (define 3° y 4° con un cruce extra entre perdedores de semifinal)
      </label>
      {Number(form.paid_positions) >= 3 && !form.third_place_match && (
        <p className="admin-t-warn span-2">
          Si premiás 3° o 4° puesto, se recomienda activar el partido por 3° puesto para definir posiciones exactas.
        </p>
      )}
      <label>
        Max jugadores
        <input type="number" className="form-input" min={2} max={128} value={form.max_players} onChange={(e) => setForm((f) => ({ ...f, max_players: e.target.value }))} />
      </label>
      <label>
        Formato
        <select className="form-input" value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}>
          <option value="single_elimination">single_elimination</option>
          <option value="qualifier">qualifier</option>
          <option value="finals">finals</option>
        </select>
      </label>
      <label>
        Fase
        <select className="form-input" value={form.phase} onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}>
          <option value="general">general</option>
          <option value="qualifier_a">qualifier_a</option>
          <option value="qualifier_b">qualifier_b</option>
          <option value="finals">finals</option>
        </select>
      </label>
      <label>
        Puntos máximos
        <select className="form-input" value={form.puntos_maximos} onChange={(e) => setForm((f) => ({ ...f, puntos_maximos: Number(e.target.value) }))}>
          <option value={15}>15</option>
          <option value={30}>30</option>
        </select>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={form.flor_habilitada} onChange={(e) => setForm((f) => ({ ...f, flor_habilitada: e.target.checked }))} />
        Flor habilitada
      </label>
      <label>
        Turno (seg)
        <input type="number" className="form-input" min={10} max={120} value={form.turn_seconds} onChange={(e) => setForm((f) => ({ ...f, turn_seconds: e.target.value }))} />
      </label>
      <label>
        Reconexión (seg)
        <input type="number" className="form-input" min={30} max={300} value={form.reconnect_seconds} onChange={(e) => setForm((f) => ({ ...f, reconnect_seconds: e.target.value }))} />
      </label>
      <label>
        Inicio (datetime-local)
        <input type="datetime-local" className="form-input" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
      </label>
      <label>
        Check-in desde
        <input type="datetime-local" className="form-input" value={form.checkin_starts_at} onChange={(e) => setForm((f) => ({ ...f, checkin_starts_at: e.target.value }))} />
      </label>
      <label>
        Cierre inscripción
        <input type="datetime-local" className="form-input" value={form.registration_closes_at} onChange={(e) => setForm((f) => ({ ...f, registration_closes_at: e.target.value }))} />
      </label>
      <label>
        Costo inscripción (créditos)
        <input type="number" className="form-input" min={0} step="0.01" value={form.entry_fee} onChange={(e) => setForm((f) => ({ ...f, entry_fee: e.target.value }))} />
      </label>
      <label>
        Premio en efectivo (opcional, referencia)
        <input className="form-input" value={form.prize_amount} onChange={(e) => setForm((f) => ({ ...f, prize_amount: e.target.value }))} />
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={form.is_paid} onChange={(e) => setForm((f) => ({ ...f, is_paid: e.target.checked }))} />
        Marcar como torneo pago (informativo si costo = 0)
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={form.auto_checkin_enabled} onChange={(e) => setForm((f) => ({ ...f, auto_checkin_enabled: e.target.checked }))} />
        Check-in automático por horario
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={form.auto_start_enabled} onChange={(e) => setForm((f) => ({ ...f, auto_start_enabled: e.target.checked }))} />
        Inicio automático por horario
      </label>
      <label>
        Minutos para listo (walkover)
        <input type="number" className="form-input" min={1} max={60} value={form.ready_timeout_minutes} onChange={(e) => setForm((f) => ({ ...f, ready_timeout_minutes: e.target.value }))} />
      </label>
    </div>
  );

  return (
    <div className="admin-tournament-panel">
      <div className="admin-tournament-toolbar">
        <div className="admin-tournament-toolbar-title">
          <Trophy size={22} className="admin-t-icon-gold" />
          <h2>Torneos</h2>
        </div>
        <div className="admin-tournament-toolbar-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={() => loadList()}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Actualizar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={16} /> Crear torneo
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-t-loading"><Loader2 className="spin" size={28} /> Cargando…</div>
      ) : (
        <div className="admin-t-layout">
          <div className="admin-t-list">{list.map(renderListCard)}</div>

          <div className="admin-t-detail-wrap">
            {!selected && (
              <p className="admin-t-placeholder">Seleccioná un torneo de la lista.</p>
            )}
            {selected && detailLoading && (
              <div className="admin-t-loading"><Loader2 className="spin" size={28} /></div>
            )}
            {selected && !detailLoading && detail && (
              <>
                <button type="button" className="btn btn-ghost btn-sm admin-t-back-mob" onClick={() => setSelected(null)}>
                  <ChevronLeft size={18} /> Lista
                </button>
                <header className="admin-t-detail-head">
                  <div>
                    <h3>{detail.name}</h3>
                    <TournamentStatusBadge status={detail.status} />
                  </div>
                  {renderQuickActions(detail)}
                </header>

                <nav className="admin-t-detail-tabs">
                  {['resumen', 'titulares', 'suplentes', 'matches', 'bracket'].map((tab) => (
                    <button key={tab} type="button" className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>
                      {tab === 'resumen' && 'Resumen'}
                      {tab === 'titulares' && 'Titulares'}
                      {tab === 'suplentes' && 'Suplentes'}
                      {tab === 'matches' && 'Matches'}
                      {tab === 'bracket' && 'Cuadro'}
                    </button>
                  ))}
                </nav>

                {detailTab === 'resumen' && (
                  <div className="admin-t-panel-card">
                    <dl className="admin-t-dl">
                      <dt>Premio</dt><dd>{detail.prize_text || '—'}</dd>
                      <dt>Fase / formato</dt><dd>{detail.phase} · {detail.format}</dd>
                      <dt>Puntos / flor</dt><dd>{detail.puntos_maximos} · {detail.flor_habilitada ? 'Sí' : 'No'}</dd>
                      <dt>Turno / reconexión</dt><dd>{detail.turn_seconds}s / {detail.reconnect_seconds}s</dd>
                      <dt>Inicio</dt><dd>{formatDate(detail.starts_at)}</dd>
                      <dt>Titulares / suplentes</dt><dd>{Number(detail.titular_count)} / {Number(detail.substitute_count)}</dd>
                      <dt>Inscripción</dt>
                      <dd>{Number(detail.entry_fee ?? 0) <= 0 ? 'Gratis' : `${detail.entry_fee} créditos`} {detail.is_paid ? '(marcado pago)' : ''}</dd>
                      <dt>Auto check-in / inicio</dt>
                      <dd>{detail.auto_checkin_enabled ? 'Sí' : 'No'} / {detail.auto_start_enabled ? 'Sí' : 'No'}</dd>
                      <dt>Check-in cerrado</dt><dd>{formatDate(detail.checkin_closed_at)}</dd>
                      <dt>Bracket generado</dt><dd>{formatDate(detail.bracket_generated_at)}</dd>
                      <dt>Ready timeout (min)</dt><dd>{detail.ready_timeout_minutes ?? '—'}</dd>
                      <dt>Máx. partidas campeón</dt>
                      <dd>
                        {Number(detail.max_players) > 1
                          ? Math.ceil(Math.log2(Number(detail.max_players)))
                          : '—'}
                      </dd>
                      {detail.winner_username && (
                        <>
                          <dt>Campeón</dt>
                          <dd><Crown size={14} className="admin-t-icon-gold" style={{ verticalAlign: 'middle', marginRight: 4 }} />{detail.winner_username}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}

                {detailTab === 'titulares' && (
                  <div className="admin-t-table-wrap">
                    <table className="admin-t-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Jugador</th>
                          <th>Estado</th>
                          <th>Check-in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.titulars || []).map((row) => (
                          <tr key={row.id}>
                            <td>{row.position_number ?? '—'}</td>
                            <td>
                              <span className="admin-t-usercell">
                                <TrucoAvatar avatar={row.avatar} username={row.username} size={28} className="admin-t-av" />
                                {row.username}
                              </span>
                            </td>
                            <td><RegStatusBadge status={row.status} /></td>
                            <td>{row.checked_in_at ? formatDate(row.checked_in_at) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detailTab === 'suplentes' && (
                  <div className="admin-t-table-wrap">
                    <table className="admin-t-table">
                      <thead>
                        <tr>
                          <th>Pos.</th>
                          <th>Jugador</th>
                          <th>Estado</th>
                          <th>Check-in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.substitutes || []).map((row) => (
                          <tr key={row.id}>
                            <td>{row.position_number ?? '—'}</td>
                            <td>
                              <span className="admin-t-usercell">
                                <TrucoAvatar avatar={row.avatar} username={row.username} size={28} className="admin-t-av" />
                                {row.username}
                              </span>
                            </td>
                            <td><RegStatusBadge status={row.status} /></td>
                            <td>{row.checked_in_at ? formatDate(row.checked_in_at) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detailTab === 'matches' && (
                  <div className="admin-t-table-wrap admin-t-matches-scroll">
                    <table className="admin-t-table admin-t-table-matches">
                      <thead>
                        <tr>
                          <th>R</th>
                          <th>#</th>
                          <th>P1</th>
                          <th>P2</th>
                          <th>Estado</th>
                          <th>Listos</th>
                          <th>Ganador</th>
                          {detail.status === 'started' && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {flatMatches.map((m) => (
                          <tr key={m.id}>
                            <td>{m.round_number}</td>
                            <td>{m.match_number}</td>
                            <td>{m.player1?.username || '—'}</td>
                            <td>{m.player2?.username || '—'}</td>
                            <td><MatchStatusBadge status={m.status} /></td>
                            <td>{m.player1_ready ? 'P1✓' : 'P1…'} / {m.player2_ready ? 'P2✓' : 'P2…'}</td>
                            <td>{m.winner?.username || '—'}</td>
                            {detail.status === 'started' && (
                              <td>
                                <div className="admin-t-match-btns">
                                  {!['finished', 'walkover', 'cancelled'].includes(m.status) && m.player1_id && m.player2_id && ['ready', 'waiting_ready', 'active'].includes(m.status) && (
                                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => resolveAbsence(m.id)}>
                                      Ausencia
                                    </button>
                                  )}
                                  {!['finished', 'walkover', 'cancelled'].includes(m.status) && m.player1_id && ['ready', 'waiting_ready', 'active', 'pending'].includes(m.status) && (
                                    <button type="button" className="btn btn-outline-gold btn-sm" disabled={busy} onClick={() => forceWinner(m.id, m.player1_id, m.player1?.username || 'P1')}>
                                      P1
                                    </button>
                                  )}
                                  {!['finished', 'walkover', 'cancelled'].includes(m.status) && m.player2_id && ['ready', 'waiting_ready', 'active', 'pending'].includes(m.status) && (
                                    <button type="button" className="btn btn-outline-gold btn-sm" disabled={busy} onClick={() => forceWinner(m.id, m.player2_id, m.player2?.username || 'P2')}>
                                      P2
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detailTab === 'bracket' && (
                  <div className="admin-t-panel-card">
                    <p>Vista pública del cuadro (jugadores y espectadores).</p>
                    <div className="admin-cajero-search-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <Link to={`/torneos/${detail.id}/bracket`} className="btn btn-outline-gold btn-sm" target="_blank" rel="noreferrer">
                        <ExternalLink size={14} /> Abrir cuadro en nueva pestaña
                      </Link>
                      <Link to={`/torneos/${detail.id}?tab=positions`} className="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">
                        Ver posiciones
                      </Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="admin-t-modal-overlay" role="presentation" onClick={() => !busy && setCreateOpen(false)}>
          <div className="admin-t-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Crear torneo</h3>
            <div className="admin-t-presets">
              {Object.entries(PRESETS).map(([key, p]) => (
                <button key={key} type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...emptyForm, ...p })}>
                  {p.label}
                </button>
              ))}
            </div>
            <FormFields />
            <div className="admin-t-modal-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={handleCreate}>Crear</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setCreateOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {editOpen && detail && (
        <div className="admin-t-modal-overlay" role="presentation" onClick={() => !busy && setEditOpen(false)}>
          <div className="admin-t-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Editar torneo</h3>
            <FormFields />
            <div className="admin-t-modal-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={handleUpdate}>Guardar</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

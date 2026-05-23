import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  formatDate,
  tournamentStatusLabel,
  registrationStatusLabel,
  matchStatusLabel,
  tournamentFormatLabel,
  tournamentPhaseLabel,
  tournamentLifecycleLabel,
} from '../../utils/tournaments';
import TrucoAvatar from '../avatar/TrucoAvatar';

const FORCE_REASONS = [
  { value: 'admin_decision', label: 'Resolución administrativa' },
  { value: 'no_show', label: 'Abandono / no presente' },
  { value: 'disconnect', label: 'Desconexión' },
  { value: 'bug', label: 'Bug / fallo técnico' },
];

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

function TournamentStatusBadge({ status, tournament }) {
  const label = tournament ? tournamentLifecycleLabel(tournament) : tournamentStatusLabel(status);
  return <span className={`admin-t-badge admin-t-badge--${status || 'unknown'}`}>{label}</span>;
}

function RegStatusBadge({ status }) {
  return (
    <span className={`admin-t-reg-badge admin-t-reg-badge--${status || 'unknown'}`}>
      {registrationStatusLabel(status)}
    </span>
  );
}

function MatchStatusBadge({ status }) {
  return (
    <span className={`admin-t-match-badge admin-t-match-badge--${status || 'unknown'}`}>
      {matchStatusLabel(status)}
    </span>
  );
}

function datetimeLocalPlusMinutes(isoLocal, minutes) {
  if (!isoLocal) return '';
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validateTournamentForm(f) {
  if (!f.name?.trim()) return 'El nombre del torneo es obligatorio.';
  if (!f.starts_at) return 'La fecha de inicio del torneo es obligatoria.';
  const maxP = Number(f.max_players);
  if (!Number.isFinite(maxP) || maxP < 2) return 'El cupo mínimo es 2 jugadores.';
  if (f.registration_opens_at && f.registration_closes_at) {
    if (new Date(f.registration_opens_at) >= new Date(f.registration_closes_at)) {
      return 'La apertura de inscripciones debe ser anterior al cierre.';
    }
  }
  if (f.registration_closes_at && f.checkin_starts_at) {
    if (new Date(f.registration_closes_at) > new Date(f.checkin_starts_at)) {
      return 'El cierre de inscripciones debe ser antes o igual al inicio de check-in.';
    }
  }
  if (f.checkin_starts_at && f.starts_at) {
    if (new Date(f.checkin_starts_at) >= new Date(f.starts_at)) {
      return 'El check-in debe comenzar antes del inicio del torneo.';
    }
  }
  const paid = Number(f.paid_positions) || 1;
  if (paid >= 3 && !f.third_place_match) {
    return 'Si premiás 3° o 4° puesto, activá el partido por 3° puesto.';
  }
  return null;
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
  max_players: 64,
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
  registration_opens_at: '',
  starts_at: '',
  checkin_starts_at: '',
  registration_closes_at: '',
};

/**
 * Overlay que solo cierra si pointerdown y pointerup ocurren en el backdrop.
 * Evita cerrar al seleccionar texto (mousedown en input, mouseup en overlay).
 */
function AdminModalBackdrop({ onClose, disabled, dialogClassName = '', children }) {
  const pointerDownOnBackdropRef = useRef(false);

  const handleBackdropPointerDown = (e) => {
    pointerDownOnBackdropRef.current = e.target === e.currentTarget;
  };

  const handleBackdropPointerUp = (e) => {
    const upOnBackdrop = e.target === e.currentTarget;
    if (!disabled && pointerDownOnBackdropRef.current && upOnBackdrop) {
      onClose();
    }
    pointerDownOnBackdropRef.current = false;
  };

  const handleDialogPointerDown = () => {
    pointerDownOnBackdropRef.current = false;
  };

  return (
    <div
      className="admin-t-modal-overlay"
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
      onPointerUp={handleBackdropPointerUp}
    >
      <div
        className={`admin-t-modal ${dialogClassName}`.trim()}
        role="dialog"
        onPointerDown={handleDialogPointerDown}
        onPointerDownCapture={handleDialogPointerDown}
      >
        {children}
      </div>
    </div>
  );
}

/** Definido fuera del panel para no remontar inputs en cada tecla. */
function TournamentFormFields({ form, setForm, onStartsAtChange }) {
  return (
    <div className="admin-t-form-sections">
      <h4 className="admin-t-form-section-title">Información básica</h4>
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
      </div>

      <h4 className="admin-t-form-section-title">Fechas y horarios</h4>
      <p className="admin-t-form-hint">
        Si dejás vacío el cierre de inscripción, se usará el inicio de check-in. El check-in por defecto es 30 min antes del torneo.
      </p>
      <div className="admin-t-form-grid">
      <label>
        Apertura inscripciones (opcional)
        <input type="datetime-local" className="form-input" value={form.registration_opens_at} onChange={(e) => setForm((f) => ({ ...f, registration_opens_at: e.target.value }))} />
        <span className="admin-t-field-hint">Vacío = abrir al crear el torneo</span>
      </label>
      <label>
        Cierre inscripciones
        <input type="datetime-local" className="form-input" value={form.registration_closes_at} onChange={(e) => setForm((f) => ({ ...f, registration_closes_at: e.target.value }))} />
      </label>
      <label>
        Inicio check-in *
        <input type="datetime-local" className="form-input" value={form.checkin_starts_at} onChange={(e) => setForm((f) => ({ ...f, checkin_starts_at: e.target.value }))} />
      </label>
      <label>
        Inicio del torneo *
        <input type="datetime-local" className="form-input" value={form.starts_at} onChange={(e) => onStartsAtChange(e.target.value)} />
      </label>
      </div>

      <h4 className="admin-t-form-section-title">Premios</h4>
      <div className="admin-t-form-grid">
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
        <label key={`prize-${n}`}>
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
          Si premiás 3° o 4° puesto, activá el partido por 3° puesto.
        </p>
      )}
      <label>
        Costo inscripción (créditos)
        <input type="number" className="form-input" min={0} step="0.01" value={form.entry_fee} onChange={(e) => setForm((f) => ({ ...f, entry_fee: e.target.value }))} />
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={form.is_paid} onChange={(e) => setForm((f) => ({ ...f, is_paid: e.target.checked }))} />
        Torneo pago (requiere costo &gt; 0)
      </label>
      </div>

      <h4 className="admin-t-form-section-title">Formato</h4>
      <div className="admin-t-form-grid">
      <label>
        Máximo de jugadores
        <input type="number" className="form-input" min={2} max={128} value={form.max_players} onChange={(e) => setForm((f) => ({ ...f, max_players: e.target.value }))} />
      </label>
      <label>
        Formato
        <select className="form-input" value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}>
          <option value="single_elimination">{tournamentFormatLabel('single_elimination')}</option>
          <option value="qualifier">{tournamentFormatLabel('qualifier')}</option>
          <option value="finals">{tournamentFormatLabel('finals')}</option>
        </select>
      </label>
      <label>
        Fase
        <select className="form-input" value={form.phase} onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}>
          <option value="general">{tournamentPhaseLabel('general')}</option>
          <option value="qualifier_a">{tournamentPhaseLabel('qualifier_a')}</option>
          <option value="qualifier_b">{tournamentPhaseLabel('qualifier_b')}</option>
          <option value="finals">{tournamentPhaseLabel('finals')}</option>
        </select>
      </label>
      <label>
        Puntos por partida
        <select className="form-input" value={form.puntos_maximos} onChange={(e) => setForm((f) => ({ ...f, puntos_maximos: Number(e.target.value) }))}>
          <option value={15}>15</option>
          <option value={30}>30</option>
        </select>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={form.flor_habilitada} onChange={(e) => setForm((f) => ({ ...f, flor_habilitada: e.target.checked }))} />
        Con flor
      </label>
      <label>
        Turno (seg)
        <input type="number" className="form-input" min={10} max={120} value={form.turn_seconds} onChange={(e) => setForm((f) => ({ ...f, turn_seconds: e.target.value }))} />
      </label>
      <label>
        Reconexión (seg)
        <input type="number" className="form-input" min={30} max={300} value={form.reconnect_seconds} onChange={(e) => setForm((f) => ({ ...f, reconnect_seconds: e.target.value }))} />
      </label>
      </div>

      <h4 className="admin-t-form-section-title">Administración</h4>
      <div className="admin-t-form-grid">
      <label className="checkbox-row">
        <input type="checkbox" checked={form.auto_checkin_enabled} onChange={(e) => setForm((f) => ({ ...f, auto_checkin_enabled: e.target.checked }))} />
        Abrir check-in automáticamente
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={form.auto_start_enabled} onChange={(e) => setForm((f) => ({ ...f, auto_start_enabled: e.target.checked }))} />
        Iniciar torneo automáticamente a la hora de inicio
      </label>
      <label>
        Minutos para confirmar listo (walkover)
        <input type="number" className="form-input" min={1} max={60} value={form.ready_timeout_minutes} onChange={(e) => setForm((f) => ({ ...f, ready_timeout_minutes: e.target.value }))} />
      </label>
      </div>
    </div>
  );
}

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
  const [resolveMatch, setResolveMatch] = useState(null);
  const [resolveWinnerId, setResolveWinnerId] = useState(null);
  const [resolveReason, setResolveReason] = useState('admin_decision');

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
    setForm({ ...emptyForm });
    setCreateOpen(true);
  };

  const onStartsAtChange = (value) => {
    setForm((f) => {
      const next = { ...f, starts_at: value };
      if (value) {
        if (!f.checkin_starts_at) next.checkin_starts_at = datetimeLocalPlusMinutes(value, -30);
        if (!f.registration_closes_at) {
          next.registration_closes_at = next.checkin_starts_at || datetimeLocalPlusMinutes(value, -30);
        }
      }
      return next;
    });
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
      registration_opens_at: detail.registration_opens_at ? detail.registration_opens_at.slice(0, 16) : '',
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
    registration_opens_at: f.registration_opens_at || null,
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
    const err = validateTournamentForm(form);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const r = await adminTournamentApi.create(toBody(form));
      const msg =
        r.data?.status === 'open'
          ? 'Torneo creado — inscripciones abiertas'
          : 'Torneo creado — inscripciones se abrirán en la fecha programada';
      toast.success(msg);
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
    const err = validateTournamentForm(form);
    if (err) {
      toast.error(err);
      return;
    }
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

  const openResolveMatch = (m) => {
    setResolveMatch(m);
    setResolveWinnerId(m.player1_id || null);
    setResolveReason('admin_decision');
  };

  const submitResolveMatch = () => {
    if (!resolveMatch || !resolveWinnerId) {
      toast.error('Elegí un ganador');
      return;
    }
    const label =
      Number(resolveWinnerId) === Number(resolveMatch.player1_id)
        ? resolveMatch.player1?.username || 'P1'
        : resolveMatch.player2?.username || 'P2';
    if (
      !window.confirm(
        `¿Resolver partido a favor de ${label}? Esta acción avanzará al ganador en el bracket.`
      )
    ) {
      return;
    }
    runAction('Partido resuelto', async () => {
      await adminTournamentApi.forceResult(selected, resolveMatch.id, {
        winnerId: resolveWinnerId,
        reason: resolveReason,
      });
      setResolveMatch(null);
    });
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
          <TournamentStatusBadge status={t.status} tournament={t} />
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
            {!t.checkin_closed_at && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => runAction('Check-in cerrado', () => adminTournamentApi.closeCheckin(t.id))}>
                Cerrar check-in
              </button>
            )}
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
                    <TournamentStatusBadge status={detail.status} tournament={detail} />
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
                      <dt>Fase / formato</dt><dd>{tournamentPhaseLabel(detail.phase)} · {tournamentFormatLabel(detail.format)}</dd>
                      {detail.lifecycle?.nextMilestoneLabel && (
                        <>
                          <dt>Próximo hito</dt>
                          <dd>{detail.lifecycle.nextMilestoneLabel} — {formatDate(detail.lifecycle.nextMilestoneAt)}</dd>
                        </>
                      )}
                      <dt>Apertura inscripciones</dt><dd>{formatDate(detail.registration_opens_at)}</dd>
                      <dt>Cierre inscripciones</dt><dd>{formatDate(detail.registration_closes_at)}</dd>
                      <dt>Check-in desde</dt><dd>{formatDate(detail.checkin_starts_at)}</dd>
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
                                  {!['finished', 'walkover', 'cancelled'].includes(m.status) && m.player1_id && m.player2_id && (
                                    <>
                                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => resolveAbsence(m.id)}>
                                        Ausencia
                                      </button>
                                      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => openResolveMatch(m)}>
                                        Resolver partido
                                      </button>
                                    </>
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
        <AdminModalBackdrop onClose={() => setCreateOpen(false)} disabled={busy}>
            <h3>Crear torneo</h3>
            <p className="admin-t-form-hint">Al crear, las inscripciones quedan abiertas de inmediato (salvo que programes una apertura futura).</p>
            <TournamentFormFields form={form} setForm={setForm} onStartsAtChange={onStartsAtChange} />
            <div className="admin-t-modal-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={handleCreate}>Crear</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setCreateOpen(false)}>Cerrar</button>
            </div>
        </AdminModalBackdrop>
      )}

      {editOpen && detail && (
        <AdminModalBackdrop onClose={() => setEditOpen(false)} disabled={busy}>
            <h3>Editar torneo</h3>
            <TournamentFormFields form={form} setForm={setForm} onStartsAtChange={onStartsAtChange} />
            <div className="admin-t-modal-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={handleUpdate}>Guardar</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditOpen(false)}>Cerrar</button>
            </div>
        </AdminModalBackdrop>
      )}

      {resolveMatch && (
        <AdminModalBackdrop
          onClose={() => setResolveMatch(null)}
          disabled={busy}
          dialogClassName="admin-t-modal--resolve"
        >
            <h3>Resolver partido</h3>
            <p className="admin-t-warn">
              Esta acción avanzará al ganador en el bracket. No se puede cambiar el ganador sin intervención manual adicional.
            </p>
            <p>
              {resolveMatch.player1?.username || 'P1'} vs {resolveMatch.player2?.username || 'P2'}
            </p>
            <label>
              Ganador
              <select
                className="form-input"
                value={resolveWinnerId || ''}
                onChange={(e) => setResolveWinnerId(Number(e.target.value))}
              >
                {resolveMatch.player1_id && (
                  <option value={resolveMatch.player1_id}>{resolveMatch.player1?.username || 'Jugador 1'}</option>
                )}
                {resolveMatch.player2_id && (
                  <option value={resolveMatch.player2_id}>{resolveMatch.player2?.username || 'Jugador 2'}</option>
                )}
              </select>
            </label>
            <label>
              Motivo
              <select
                className="form-input"
                value={resolveReason}
                onChange={(e) => setResolveReason(e.target.value)}
              >
                {FORCE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <div className="admin-t-modal-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submitResolveMatch}>
                Confirmar
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setResolveMatch(null)}>
                Cancelar
              </button>
            </div>
        </AdminModalBackdrop>
      )}
    </div>
  );
}

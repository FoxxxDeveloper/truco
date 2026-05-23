-- Diagnóstico torneos TrucoFX (solo lectura)
-- Ejecutar en MySQL contra la base del proyecto.

-- 1) Torneos con status incoherente vs horarios
SELECT id, name, status, registration_opens_at, registration_closes_at,
       checkin_starts_at, starts_at, checkin_closed_at, bracket_generated_at
FROM tournaments
WHERE status IN ('draft','open','checkin')
  AND starts_at IS NOT NULL AND starts_at < NOW()
ORDER BY starts_at;

-- 2) Inscripciones en torneo que no permite inscribir (status != open)
SELECT tr.tournament_id, t.name, t.status, tr.user_id, tr.status AS reg_status, tr.created_at
FROM tournament_registrations tr
JOIN tournaments t ON t.id = tr.tournament_id
WHERE t.status NOT IN ('open','checkin')
  AND tr.status IN ('registered','checked_in','substitute')
  AND tr.created_at > COALESCE(t.checkin_closed_at, t.starts_at, '1970-01-01');

-- 3) Check-in sin inscripción activa
SELECT tr.tournament_id, tr.user_id, tr.status, tr.checked_in_at
FROM tournament_registrations tr
WHERE tr.checked_in_at IS NOT NULL
  AND tr.status NOT IN ('registered','checked_in','substitute');

-- 4) Matches finished sin ganador
SELECT tm.id, tm.tournament_id, tm.status, tm.winner_id, tm.finished_at
FROM tournament_matches tm
WHERE tm.status IN ('finished','walkover')
  AND tm.winner_id IS NULL;

-- 5) Eventos duplicados recientes (mismo tipo + match)
SELECT tournament_id, type, JSON_EXTRACT(metadata, '$.matchId') AS match_id, COUNT(*) AS cnt
FROM tournament_events
WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND type IN ('admin_force_result','match_finished')
GROUP BY tournament_id, type, JSON_EXTRACT(metadata, '$.matchId')
HAVING cnt > 3;

-- 6) Slots de bracket con dos jugadores distintos (conflictos manuales)
SELECT tm.id, tm.tournament_id, tm.next_match_id, tm.next_slot,
       tm.winner_id, n.player1_id, n.player2_id
FROM tournament_matches tm
JOIN tournament_matches n ON n.id = tm.next_match_id
WHERE tm.winner_id IS NOT NULL
  AND tm.next_match_id IS NOT NULL
  AND (
    (tm.next_slot = 'player1' AND n.player1_id IS NOT NULL AND n.player1_id <> tm.winner_id)
    OR (tm.next_slot = 'player2' AND n.player2_id IS NOT NULL AND n.player2_id <> tm.winner_id)
  );

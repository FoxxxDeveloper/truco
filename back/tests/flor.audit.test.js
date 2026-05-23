/**

 * Auditoría Flor / Contraflor — SOLO memoria, sin DB/Redis/sockets.

 * No importado por app.js. Ejecutar: node --test tests/flor.audit.test.js

 */

const { describe, it } = require('node:test');

const assert = require('node:assert/strict');

const { Card } = require('../src/game/Deck');

const { TrucoGame, STATES } = require('../src/game/TrucoGame');

const {

  hasFlor,

  calculateFlor,

  getFlorStake,

  getContraFlorAlRestoPointsForWinner,

  getFlorRejectionStake,

} = require('../src/game/rules/flor');



const P1 = 101;

const P2 = 102;



function hand(specs) {

  return specs.map(([value, suit]) => new Card(value, suit));

}



/** Partida con manos fijas y flor detectada (sin reparto aleatorio). */

function gameWithHands(p1Cards, p2Cards, scoreOverrides = {}) {

  const g = new TrucoGame('flor-audit-room', P1, P2, {

    florHabilitada: true,

    puntosMaximos: 30,

  });

  g.state = STATES.PLAYER_TURN;

  g.hands[P1] = p1Cards;

  g.hands[P2] = p2Cards;

  g.florState.p1HasFlor = hasFlor(p1Cards);

  g.florState.p2HasFlor = hasFlor(p2Cards);

  g.manoPlayer = P1;

  g.waitingForPlayer = P1;

  if (scoreOverrides[P1] != null) g.scores[P1] = scoreOverrides[P1];

  if (scoreOverrides[P2] != null) g.scores[P2] = scoreOverrides[P2];

  return g;

}



const florHands = () => ({

  p1: hand([[7, 'oro'], [6, 'oro'], [5, 'oro']]),

  p2: hand([[4, 'copa'], [5, 'copa'], [10, 'copa']]),

});



/** P1 flor → P2 contraflor → P1 contraflor al resto → acceptor acepta. */
function playContraFlorAlRestoAccept(g, acceptorId) {
  g.announceFlor(P1);
  g.announceFlor(P2);
  g.announceFlor(P1);
  assert.equal(g.florState.betStack[g.florState.betStack.length - 1], 'contraflor_al_resto');
  return g.respondFlor(acceptorId, 'accept');
}



describe('flor.js — funciones puras', () => {

  it('hasFlor y calculateFlor en manos de prueba', () => {

    const p1Flor = hand([[1, 'oro'], [5, 'oro'], [7, 'oro']]);

    const p2No = hand([[2, 'copa'], [6, 'espada'], [12, 'basto']]);

    assert.equal(hasFlor(p1Flor), true);

    assert.equal(hasFlor(p2No), false);

    assert.equal(calculateFlor(p1Flor), 20 + 1 + 5 + 7);

  });



  it('getFlorStake contraflor = 6, flor = 3', () => {

    assert.equal(getFlorStake(['flor']), 3);

    assert.equal(getFlorStake(['flor', 'contraflor']), 6);

  });



  it('getFlorRejectionStake contraflor rechazada = 4', () => {

    assert.equal(getFlorRejectionStake(['flor', 'contraflor']), 4);

  });



  it('contraflor al resto: ganador atrás (P1 12, P2 20) → 10', () => {

    const pts = getContraFlorAlRestoPointsForWinner({

      winnerId: P1,

      player1Id: P1,

      player2Id: P2,

      scoreP1: 12,

      scoreP2: 20,

      pointsToWin: 30,

    });

    assert.equal(pts, 10);

  });



  it('contraflor al resto: ganador adelante (P1 25, P2 10) → 20', () => {

    const pts = getContraFlorAlRestoPointsForWinner({

      winnerId: P1,

      player1Id: P1,

      player2Id: P2,

      scoreP1: 25,

      scoreP2: 10,

      pointsToWin: 30,

    });

    assert.equal(pts, 20);

  });



  it('contraflor al resto: gana P2 (P1 25, P2 10) → 5', () => {

    const pts = getContraFlorAlRestoPointsForWinner({

      winnerId: P2,

      player1Id: P1,

      player2Id: P2,

      scoreP1: 25,

      scoreP2: 10,

      pointsToWin: 30,

    });

    assert.equal(pts, 5);

  });

});



describe('TrucoGame — flujos Flor (memoria)', () => {

  it('Caso A: rival sin flor → +3 auto, sin FLOR_PENDING', () => {

    const g = gameWithHands(

      hand([[1, 'oro'], [5, 'oro'], [7, 'oro']]),

      hand([[2, 'copa'], [6, 'espada'], [12, 'basto']])

    );

    const r = g.announceFlor(P1);

    assert.equal(r.ok, true);

    assert.equal(r.event, 'FLOR_RESOLVED');

    assert.equal(r.points, 3);

    assert.equal(r.florResultReason, 'no_rival_flor');

    assert.equal(r.autoResolved, true);

    assert.equal(g.state, STATES.PLAYER_TURN);

    assert.equal(g.florState.resolved, true);

    assert.equal(g.florState.pendingBy, null);

    assert.equal(g.scores[P1], 3);

    assert.equal(g._hasAnyFlorInRound(), true);

    const env = g.announceEnvido(P1, 'envido');

    assert.equal(env.ok, false);

    assert.match(env.error, /flor/i);

  });



  it('Caso B: ambos flor, P1 gana comparación → stake 3 en flor simple aceptada', () => {

    const g = gameWithHands(

      hand([[7, 'oro'], [6, 'oro'], [5, 'oro']]),

      hand([[4, 'copa'], [5, 'copa'], [10, 'copa']])

    );

    const ann = g.announceFlor(P1);

    assert.equal(ann.event, 'FLOR_ANNOUNCED');

    const acc = g.respondFlor(P2, 'accept');

    assert.equal(acc.winner, P1);

    assert.equal(acc.points, 3);

  });



  it('Caso C: ambos flor, P2 gana comparación', () => {

    const g = gameWithHands(

      hand([[4, 'oro'], [5, 'oro'], [10, 'oro']]),

      hand([[7, 'copa'], [6, 'copa'], [5, 'copa']])

    );

    g.announceFlor(P1);

    const acc = g.respondFlor(P2, 'accept');

    assert.equal(acc.winner, P2);

    assert.equal(acc.points, 3);

  });



  it('Caso D: empate flor → gana mano (P1)', () => {

    const g = gameWithHands(

      hand([[7, 'oro'], [5, 'oro'], [10, 'oro']]),

      hand([[7, 'copa'], [5, 'copa'], [11, 'copa']])

    );

    assert.equal(calculateFlor(g.hands[P1]), calculateFlor(g.hands[P2]));

    g.announceFlor(P1);

    const acc = g.respondFlor(P2, 'accept');

    assert.equal(acc.winner, P1);

  });



  it('Caso E: contraflor aceptada → 6 puntos', () => {

    const { p1, p2 } = florHands();
    const g = gameWithHands(p1, p2);

    g.announceFlor(P1);

    g.announceFlor(P2);

    const acc = g.respondFlor(P1, 'accept');

    assert.equal(acc.points, 6);

    assert.equal(acc.winner, P1);

  });



  it('Caso A puntos: contraflor rechazada → P2 suma 4', () => {

    const { p1, p2 } = florHands();
    const g = gameWithHands(p1, p2);

    g.announceFlor(P1);

    g.announceFlor(P2);

    const rej = g.respondFlor(P1, 'reject');

    assert.equal(rej.winner, P2);

    assert.equal(rej.points, 4);

    assert.equal(g.scores[P2], 4);

  });



  it('contraflor al resto integrado: P1 12 P2 20 P1 gana → +10', () => {

    const { p1, p2 } = florHands();
    const g = gameWithHands(p1, p2, { [P1]: 12, [P2]: 20 });

    const acc = playContraFlorAlRestoAccept(g, P2);

    assert.equal(acc.winner, P1);

    assert.equal(acc.points, 10);

    assert.equal(g.scores[P1], 22);

  });



  it('contraflor al resto integrado: P1 25 P2 10 P1 gana → +20', () => {

    const { p1, p2 } = florHands();
    const g = gameWithHands(p1, p2, { [P1]: 25, [P2]: 10 });

    const acc = playContraFlorAlRestoAccept(g, P2);

    assert.equal(acc.winner, P1);

    assert.equal(acc.points, 20);

    assert.equal(g.scores[P1], 45);

  });



  it('contraflor al resto integrado: P2 gana → +5', () => {

    const g = gameWithHands(
      hand([[4, 'oro'], [5, 'oro'], [10, 'oro']]),
      hand([[7, 'copa'], [6, 'copa'], [5, 'copa']]),
      { [P1]: 25, [P2]: 10 }
    );

    const acc = playContraFlorAlRestoAccept(g, P2);

    assert.equal(acc.winner, P2);

    assert.equal(acc.points, 5);

    assert.equal(g.scores[P2], 15);

  });



  it('primer flor con ambos flor no se puede rechazar', () => {

    const { p1, p2 } = florHands();
    const g = gameWithHands(p1, p2);

    g.announceFlor(P1);

    const rej = g.respondFlor(P2, 'reject');

    assert.equal(rej.ok, false);

  });



  it('Caso H: canEnvido false con flor en ronda', () => {

    const g = gameWithHands(

      hand([[1, 'oro'], [5, 'oro'], [7, 'oro']]),

      hand([[2, 'copa'], [6, 'espada'], [12, 'basto']])

    );

    const ui = g._computePlayerUiActions(P1);

    assert.equal(ui.canEnvido, false);

  });

});



import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ArrowLeft } from 'lucide-react';
import BrandNavLockup from '../components/brand/BrandNavLockup';
import AppHeader from '../components/layout/AppHeader';
import { useAuth } from '../context/AuthContext';

const SECTIONS = [
  {
    id: 'intro',
    title: 'Cómo jugar',
    content: (
      <>
        <p>
          <span className="fx-badge rules-inline-badge">Objetivo</span> Ganá la partida llegando primero a{' '}
          <strong>15 u 30 puntos</strong>, según la partida.
        </p>
        <p>
          El <strong>Truco Argentino</strong> es un juego de cartas para 2 jugadores que combina habilidad, estrategia y
          faroleo. Se juega con una <strong>baraja española de 40 cartas</strong> (sin 8 ni 9).
        </p>
        <p>
          Cada jugador recibe <strong>3 cartas</strong> por ronda. El envido se canta en la primera mano antes de jugar
          cartas, salvo las reglas de respuesta al Truco ya implementadas en TrucoFX.
        </p>
      </>
    ),
  },
  {
    id: 'hierarchy',
    title: 'Jerarquía de cartas',
    content: (
      <>
        <p>
          El valor de una carta en el truco <strong>no es su número</strong>, sino su posición en la jerarquía. De mayor
          a menor:
        </p>
        <table className="rules-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Carta</th>
              <th>Apodo</th>
            </tr>
          </thead>
          <tbody>
            {[
              [1, '1 de Espada', 'Ancho de espada (el más fuerte)'],
              [2, '1 de Basto', 'Ancho de basto'],
              [3, '7 de Espada', 'Siete de espada'],
              [4, '7 de Oro', 'Siete de oro'],
              [5, 'Todos los 3', '—'],
              [6, 'Todos los 2', '—'],
              [7, '1 de Oro y 1 de Copa', 'Anchos falsos'],
              [8, 'Todos los 12', 'Sota'],
              [9, 'Todos los 11', 'Caballo'],
              [10, 'Todos los 10', 'Rey'],
              [11, '7 de Basto y 7 de Copa', '—'],
              [12, 'Todos los 6', '—'],
              [13, 'Todos los 5', '—'],
              [14, 'Todos los 4', 'El más débil'],
            ].map(([pos, card, note]) => (
              <tr key={pos}>
                <td className="rules-rank">{pos}</td>
                <td>
                  <strong>{card}</strong>
                </td>
                <td className="rules-note">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rules-tip">Las cartas del mismo nivel <strong>empatan</strong> (parda).</p>
      </>
    ),
  },
  {
    id: 'rounds',
    title: 'Rondas y manos',
    content: (
      <>
        <p>
          Cada <strong>ronda</strong> se juega en hasta <strong>3 manos</strong>. En cada mano, cada jugador juega una
          carta. Gana la ronda quien gane <strong>2 de 3 manos</strong>.
        </p>
        <h4>Reglas de pardas</h4>
        <ul>
          <li>Si la <strong>1ª mano</strong> es parda y alguien gana la 2ª → ese jugador gana la ronda.</li>
          <li>Si la 1ª y 2ª son pardas → gana el jugador <strong>mano</strong>.</li>
          <li>Si hay una mano para cada uno → se juega la 3ª.</li>
          <li>Si la 3ª también empata → gana el jugador <strong>mano</strong>.</li>
        </ul>
        <p className="rules-tip">
          El jugador <strong>&quot;mano&quot;</strong> alterna cada ronda. Sirve para desempatar envido y pardas.
        </p>
      </>
    ),
  },
  {
    id: 'envido',
    title: 'Envido',
    content: (
      <>
        <p>
          El <strong>Envido</strong> es una apuesta aparte basada en el puntaje de tus cartas. Se canta en la{' '}
          <strong>primera mano</strong> antes de jugar cartas, con las excepciones de flujo respecto al Truco que ya
          aplica el juego en línea.
        </p>
        <h4>¿Cómo se calcula?</h4>
        <ul>
          <li>
            Si tenés <strong>2 o 3 cartas del mismo palo</strong>: sumás las dos de mayor valor (las figuras 10, 11 y 12
            valen 0) y le sumás <strong>20</strong>.
          </li>
          <li>Si no tenés dos del mismo palo: tu envido es el valor de tu carta más alta (figuras = 0).</li>
        </ul>
        <div className="rules-examples">
          <div className="example">
            7♦ + 6♦ + 3♣ = <strong>33</strong>
          </div>
          <div className="example">
            7♦ + J♦ = <strong>27</strong>
          </div>
          <div className="example">
            J♠ + J♣ + J♥ = <strong>0</strong>
          </div>
        </div>
        <h4>Escalera de Envido</h4>
        <table className="rules-table">
          <thead>
            <tr>
              <th>Canto</th>
              <th>Si quiero</th>
              <th>Si no quiero</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Envido</td>
              <td>2 pts</td>
              <td>1 pt para quien cantó</td>
            </tr>
            <tr>
              <td>Envido + Envido</td>
              <td>4 pts</td>
              <td>2 pts</td>
            </tr>
            <tr>
              <td>Real Envido</td>
              <td>3 pts</td>
              <td>1 pt</td>
            </tr>
            <tr>
              <td>Envido + Real Envido</td>
              <td>5 pts</td>
              <td>2 pts</td>
            </tr>
            <tr>
              <td>Falta Envido</td>
              <td>Puntos para terminar la partida</td>
              <td>1 pt</td>
            </tr>
          </tbody>
        </table>
        <h4>¿Cuándo se puede cantar?</h4>
        <ul>
          <li>Solo en la <strong>primera mano</strong> de la ronda.</li>
          <li>Solo si <strong>vos mismo todavía no tiraste ninguna carta</strong>.</li>
          <li>
            Si el rival cantó Truco antes de que tires carta, podés cantar Envido <em>antes de responder el Truco</em>.
            Primero se resuelve el Envido, luego respondés el Truco.
          </li>
        </ul>
        <p className="rules-tip">El desempate de envido lo gana el jugador <strong>mano</strong>.</p>
      </>
    ),
  },
  {
    id: 'truco',
    title: 'Truco, Retruco y Vale 4',
    content: (
      <>
        <p>
          El <strong>Truco</strong> es la apuesta principal de la ronda. Por defecto cada ronda vale <strong>1 punto</strong>.
          Al cantarlo, el rival puede subir o bajar la apuesta:
        </p>
        <table className="rules-table">
          <thead>
            <tr>
              <th>Canto</th>
              <th>Si quiero</th>
              <th>Si no quiero</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Truco</td>
              <td>La ronda vale 2</td>
              <td>El que cantó gana 1</td>
            </tr>
            <tr>
              <td>Retruco</td>
              <td>La ronda vale 3</td>
              <td>El que cantó gana 2</td>
            </tr>
            <tr>
              <td>Vale 4</td>
              <td>La ronda vale 4</td>
              <td>El que cantó gana 3</td>
            </tr>
          </tbody>
        </table>
        <h4>Reglas</h4>
        <ul>
          <li>Solo se puede cantar Truco en tu turno, antes de tirar carta.</li>
          <li>
            La escalera válida es: <strong>Truco → Retruco → Vale 4</strong>.
          </li>
          <li>No podés responderte a vos mismo.</li>
          <li>No podés cantar Truco en la última mano si tu única carta es un <strong>4</strong>.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'flor',
    title: 'Flor (opcional)',
    content: (
      <>
        <p>La <strong>Flor</strong> solo está disponible si la partida fue configurada con ella.</p>
        <p>
          Tenés Flor si tus <strong>3 cartas son del mismo palo</strong>. Si tenés Flor, deberías cantarla.
        </p>
        <ul>
          <li>Si el rival no tiene Flor → ganás automáticamente <strong>3 pts</strong>.</li>
          <li>Si ambos tienen Flor → se comparan los valores (como el envido pero con las 3 cartas).</li>
          <li>
            Podés subir con <strong>Contraflor</strong> o <strong>Contraflor al resto</strong>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'tournaments',
    title: 'Torneos y check-in',
    content: (
      <>
        <p>
          <span className="fx-badge rules-inline-badge">Torneos</span> Inscripción con créditos según el torneo, plazos
          y cupos publicados en la sala de torneos.
        </p>
        <ul>
          <li>
            <strong>Check-in obligatorio</strong> en la ventana indicada; si no confirmás, podés quedar fuera del bracket.
          </li>
          <li>
            <strong>Suplentes</strong> cuando el organizador lo permita: seguí las instrucciones en el detalle del torneo.
          </li>
          <li>
            Marcá <strong>Listo</strong> cuando el sistema lo pida para no frenar el inicio de la mesa.
          </li>
          <li>
            Las <strong>ausencias</strong> o abandono pueden contar como derrota y afectar tu reputación en la competencia.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'battles',
    title: 'Batallas competitivas',
    content: (
      <>
        <p>
          <span className="fx-badge rules-inline-badge">Batallas</span> Usan <strong>créditos</strong> de tu billetera.
          Verificá saldo antes de crear o aceptar una batalla.
        </p>
        <ul>
          <li>La <strong>verificación de identidad</strong> puede ser obligatoria para montos o modos competitivos.</li>
          <li>Respetá el saldo mínimo y las reglas de visibilidad (pública / privada) al publicar o unirte.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'fairplay',
    title: 'Juego limpio',
    content: (
      <>
        <ul>
          <li>No compartas tu cuenta con otras personas.</li>
          <li>No intentes manipular partidas, resultados ni el sistema de emparejamiento.</li>
          <li>El incumplimiento puede derivar en sanciones según las políticas de la plataforma.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'mazo',
    title: 'Irse al mazo',
    content: (
      <>
        <p>
          En cualquier momento de tu turno podés <strong>irte al mazo</strong> (rendirte en la ronda).
        </p>
        <ul>
          <li>Sin Truco cantado: el rival gana <strong>1 punto</strong>.</li>
          <li>Con Truco aceptado: el rival gana el valor aceptado (<strong>2, 3 ó 4 pts</strong>).</li>
          <li>Ante un Truco pendiente: se trata como &quot;No quiero&quot; el Truco.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'reconnect',
    title: 'Reconexión',
    content: (
      <>
        <p>Si te desconectás (F5, cierre de pestaña, etc.) <strong>no perdés automáticamente</strong>.</p>
        <ul>
          <li>Tu rival verá que te desconectaste y tendrá un contador.</li>
          <li>Tenés <strong>60 segundos</strong> para volver a conectarte.</li>
          <li>Al recargar la página, el sistema te devuelve automáticamente a tu partida.</li>
          <li>Si no volvés en tiempo, perdés la partida.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'scoring',
    title: 'Puntuación y ELO',
    content: (
      <>
        <p>
          Llegás primero a la cantidad de puntos configurada (<strong>15 ó 30</strong>) → ganás la partida.
        </p>
        <ul>
          <li>Las partidas <strong>Casual</strong> no modifican tu ELO.</li>
          <li>Las partidas <strong>Ranked</strong> actualizan tu ELO según el sistema Elo estándar.</li>
          <li>Las partidas con <strong>apuesta de créditos</strong> liquidan el premio al ganador al finalizar.</li>
        </ul>
      </>
    ),
  },
];

export default function RulesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState('intro');

  return (
    <div className="rules-page rules-page--et6 page-shell">
      {user ? (
        <AppHeader />
      ) : (
        <header className="rules-page-header">
          <button type="button" className="btn btn-ghost btn-sm rules-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} aria-hidden />
            Volver
          </button>
          <div className="rules-header-brand">
            <BrandNavLockup size="sm" showSubtitle={false} className="rules-brand-lockup" />
          </div>
          <div className="rules-header-icon-wrap" aria-hidden>
            <BookOpen className="rules-header-icon" size={22} />
          </div>
        </header>
      )}

      <h1 className="rules-page-title">Reglas y ayuda</h1>
      <p className="rules-page-lead">Truco Argentino en TrucoFX — referencia rápida para jugar en línea.</p>

      <div className="rules-layout rules-layout--et6">
        <nav className="rules-nav fx-card" aria-label="Secciones">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`rules-nav-btn${open === s.id ? ' active' : ''}`.trim()}
              onClick={() => setOpen(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <main className="rules-content">
          <AnimatePresence mode="wait">
            {SECTIONS.filter((s) => s.id === open).map((s) => (
              <motion.article
                key={s.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rules-section fx-card"
              >
                <h2 className="rules-section-title">{s.title}</h2>
                <div className="rules-section-body">{s.content}</div>
              </motion.article>
            ))}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

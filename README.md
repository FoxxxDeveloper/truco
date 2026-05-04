# Truco Argentino 🃏

Juego de Truco argentino (2 jugadores) en tiempo real. Web app full-stack con React + Node.js + Socket.IO + MySQL.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite + Framer Motion |
| Backend | Node.js + Express |
| Realtime | Socket.IO 4 |
| Base de datos | MySQL 8 |
| Caché/Sesiones | Redis (opcional, fallback en memoria) |
| Deploy | PM2 |

---

## Instalación y puesta en marcha

### 1. Requisitos

- Node.js 18+
- MySQL 8
- Redis (opcional)

### 2. Clonar e instalar

```bash
# Backend
cd back
cp .env.example .env       # Completar con tus credenciales
npm install

# Frontend
cd ../front
cp .env.example .env
npm install
```

### 3. Base de datos

```sql
CREATE DATABASE truco_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
cd back
npm run db:migrate
```

### 4. Desarrollo

```bash
# Terminal 1 — Backend
cd back
npm run dev

# Terminal 2 — Frontend
cd front
npm run dev
```

Abrí `http://localhost:5173` en el browser.

### 5. Producción con PM2

```bash
# Backend
cd back
npm install -g pm2
pm2 start ecosystem.config.js

# Frontend
cd front
npm run build
# Servir dist/ con nginx o similar
```

---

## Arquitectura

```
truco/
├── back/                      ← Node.js + Express + Socket.IO
│   ├── src/
│   │   ├── app.js             ← Entry point
│   │   ├── config/
│   │   │   ├── database.js    ← MySQL pool
│   │   │   ├── redis.js       ← Redis / in-memory fallback
│   │   │   ├── logger.js      ← Winston logger
│   │   │   └── migrate.js     ← DB migration script
│   │   ├── game/
│   │   │   ├── TrucoGame.js   ← State machine (autoritative)
│   │   │   ├── Deck.js        ← Baraja española 40 cartas
│   │   │   └── rules/
│   │   │       ├── cardHierarchy.js  ← Jerarquía de cartas
│   │   │       ├── envido.js         ← Reglas de envido
│   │   │       └── truco.js          ← Reglas de truco
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Game.js
│   │   │   └── Ranking.js
│   │   ├── routes/
│   │   │   ├── auth.js        ← /api/auth
│   │   │   └── ranking.js     ← /api/ranking
│   │   ├── services/
│   │   │   ├── gameSession.js ← Store partidas activas
│   │   │   ├── matchmaking.js ← Cola FIFO
│   │   │   └── elo.js         ← Sistema ELO
│   │   ├── socket/
│   │   │   ├── socketManager.js       ← Auth middleware + connection
│   │   │   └── handlers/
│   │   │       ├── gameHandler.js     ← Eventos del juego
│   │   │       ├── matchmakingHandler.js
│   │   │       └── chatHandler.js
│   │   └── middleware/
│   │       └── auth.js        ← JWT middleware REST
│   └── ecosystem.config.js    ← PM2 config
│
└── front/                     ← React + Vite
    └── src/
        ├── App.jsx             ← Router root
        ├── context/
        │   ├── AuthContext.jsx ← JWT + user state
        │   └── GameContext.jsx ← Socket.IO events
        ├── services/
        │   ├── api.js          ← axios REST client
        │   └── socket.js       ← Socket.IO singleton
        ├── pages/
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Lobby.jsx
        │   ├── Game.jsx
        │   └── Ranking.jsx
        └── components/
            ├── ProtectedRoute.jsx
            └── game/
                ├── Card.jsx
                ├── PlayerHand.jsx
                ├── OpponentHand.jsx
                ├── PlayArea.jsx
                ├── ActionButtons.jsx
                ├── ScoreBoard.jsx
                ├── Chat.jsx
                └── GameOverModal.jsx
```

---

## Eventos Socket.IO

### Cliente → Servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `queue:join` | — | Entrar en cola |
| `queue:leave` | — | Salir de cola |
| `game:playCard` | `{ roomId, cardId }` | Jugar carta |
| `game:envido` | `{ roomId, betType }` | Cantar envido/real/falta |
| `game:envidoResponse` | `{ roomId, response }` | Responder envido (accept/reject) |
| `game:truco` | `{ roomId, betType }` | Cantar truco/retruco/vale4 |
| `game:trucoResponse` | `{ roomId, response }` | Responder truco (accept/reject) |
| `game:irseAlMazo` | `{ roomId }` | Irse al mazo |
| `game:nextRound` | `{ roomId }` | Siguiente ronda |
| `game:reconnect` | `{ roomId }` | Reconectar a partida activa |
| `chat:message` | `{ roomId, text }` | Enviar mensaje |
| `chat:reaction` | `{ roomId, reaction }` | Enviar reacción emoji |

### Servidor → Cliente

| Evento | Descripción |
|--------|-------------|
| `game:start` | Partida iniciada, estado inicial |
| `game:state` | Estado actualizado del juego (personalizado por jugador) |
| `game:cardPlayed` | Carta jugada |
| `game:envidoAnnounced` | Envido cantado |
| `game:envidoResult` | Envido resuelto |
| `game:trucoAnnounced` | Truco cantado |
| `game:trucoResult` | Truco aceptado/rechazado |
| `game:irseAlMazo` | Jugador se fue al mazo |
| `game:over` | Partida terminada + delta ELO |
| `game:opponentDisconnected` | Oponente desconectado |
| `game:reconnected` | Reconexión exitosa |
| `chat:message` | Mensaje recibido |
| `chat:reaction` | Reacción recibida |

---

## Base de datos

```sql
usuarios        — id, username, email, password, avatar
ranking         — user_id, elo, wins, losses, draws
partidas        — room_id, player1_id, player2_id, winner_id, state, scores
historial_partidas — partida_id, round_number, winner_id, truco_value, envido_points
```

> **El estado de las partidas activas NO se guarda en MySQL** — se mantiene en memoria + Redis para máxima velocidad.

---

## Reglas implementadas

- Baraja española 40 cartas (sin 8 ni 9)
- Jerarquía completa: 1e > 1b > 7e > 7o > 3 > 2 > 1(o,c) > 12 > 11 > 10 > 7(b,c) > 6 > 5 > 4
- Envido: cálculo correcto con pares de palo + 20
- Truco: quiero / no quiero / subir apuesta
- Irse al mazo
- Hasta 3 manos por ronda, reglas de parda
- Puntuación hasta 30
- Sistema ELO post-partida
- Reconexión automática via Redis
- Chat en vivo + reacciones emoji

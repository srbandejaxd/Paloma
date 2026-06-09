# 🪃 Woodpecker — Entrenamiento táctico por repetición

Herramienta especializada para el **Método Woodpecker**: repetir los mismos ejercicios una y otra vez, midiendo la mejora en velocidad de reconocimiento táctico.

## Filosofía de diseño

Esta **no** es una plataforma general de puzzles. Es una herramienta de medición:
- Los mismos ejercicios, repetidos infinitamente
- El cronómetro es el protagonista, no el tablero
- El historial muestra la curva de mejora en velocidad
- La carrera multijugador añade presión competitiva sobre los mismos puzzles

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript + TailwindCSS |
| Tablero | react-chessboard + chess.js |
| Backend | Node.js + Express |
| Tiempo real | Socket.io |
| BD | SQLite (better-sqlite3) |

---

## Instalación rápida

```bash
# 1. Instalar dependencias
cd woodpecker
npm install
cd client && npm install
cd ../server && npm install
cd ..

# 2. Ejecutar en modo desarrollo (ambos servidores)
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api

---

## Estructura del proyecto

```
woodpecker/
├── client/                     # React app
│   └── src/
│       ├── components/
│       │   └── Board/
│       │       └── PuzzleBoard.tsx   # Motor de puzzles (validación + respuesta automática)
│       ├── hooks/
│       │   └── useTimer.ts           # Cronómetro de alta precisión (requestAnimationFrame)
│       ├── lib/
│       │   ├── api.ts                # HTTP helpers
│       │   ├── socket.ts             # Singleton de Socket.io
│       │   └── time.ts               # Formateo de tiempos
│       ├── pages/
│       │   ├── Home.tsx              # Landing / entrada
│       │   ├── CreateRoom.tsx        # Crear sala multijugador
│       │   ├── Lobby.tsx             # Sala de espera con código
│       │   ├── Race.tsx              # Carrera en tiempo real
│       │   ├── Results.tsx           # Pantalla de resultados
│       │   ├── Solo.tsx              # Práctica individual
│       │   └── History.tsx           # Historial con curva de mejora
│       └── types/index.ts            # Tipos compartidos
│
├── server/
│   └── src/
│       ├── db/
│       │   └── database.js           # Schema SQLite + seed de puzzles
│       ├── routes/
│       │   └── api.js                # REST API
│       ├── socket/
│       │   └── rooms.js              # Lógica de salas y carreras
│       └── index.js                  # Entry point
│
└── woodpecker.db                     # Generado automáticamente al iniciar
```

---

## Modelo de base de datos

```sql
blocks          -- Bloques de ejercicios (Bloque 1: 1-20, etc.)
puzzles         -- Posiciones FEN + solución en SAN
attempts        -- Cada intento de un usuario en un bloque
puzzle_times    -- Tiempo por puzzle dentro de un intento
```

---

## Eventos Socket.io

| Evento | Dirección | Descripción |
|--------|-----------|-------------|
| `create_room` | client→server | Crear sala con blockId y nickname |
| `room_created` | server→client | Código de sala generado |
| `join_room` | client→server | Unirse con código y nickname |
| `room_state` | server→client | Estado completo de la sala |
| `player_joined` | server→room | Nuevo jugador conectado |
| `player_left` | server→room | Jugador desconectado |
| `start_race` | client→server | Anfitrión inicia carrera |
| `race_starting` | server→room | Redirige al frontend de carrera |
| `race_data` | server→room | blockId + totalPuzzles |
| `puzzle_solved` | client→server | Progreso del jugador |
| `progress_update` | server→room | Estado de todos los jugadores |
| `race_complete` | client→server | Jugador terminó todos los puzzles |
| `race_finished` | server→room | Resultados finales ordenados |

---

## Agregar más puzzles

Editar `server/src/db/database.js`, sección `PUZZLES_BLOCK_N`:

```js
const PUZZLES_BLOCK_5 = [
  {
    fen: '...FEN aquí...',
    solution: ['e4', 'e5', 'Nf3', ...], // movimientos en SAN, alternando jugador/rival
  },
  // ...
]
```

Luego agregar el bloque en el array `blocks` del seed y borrar `woodpecker.db` para regenerar.

---

## Cómo funciona el motor de puzzles

1. El jugador mueve una pieza (drag & drop)
2. `PuzzleBoard` valida contra `puzzle.solution[solutionIndex]`
3. Si es correcto: verde, 400ms de pausa
4. El sistema ejecuta automáticamente la respuesta del rival (500ms de animación)
5. Se vuelve al paso 1 hasta completar la secuencia
6. Si es incorrecto: rojo, el movimiento se deshace, se suma un error

---

## El historial: la feature central

La página `/history` muestra la curva de velocidad de cada jugador por bloque:
- Una línea SVG donde cada punto es un intento
- La pendiente negativa = reconocimiento táctico mejorando
- Esto ES el Método Woodpecker visualizado

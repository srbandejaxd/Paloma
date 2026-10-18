# 🪃 Woodpecker (La Paloma)

Plataforma web de entrenamiento táctico de ajedrez basada en el método Woodpecker (GM Axel Smith & Hans Tikkanen), con una variante propia llamada **La Paloma**: repetición espaciada con descansos **crecientes** (curva del olvido de Ebbinghaus), al revés del Woodpecker original.

UI en español. Tema oscuro/claro (guardado en `localStorage` key `wp_theme`).

## Stack

| Capa | Tecnología | Hosting |
|---|---|---|
| Client | React + TypeScript + Vite, Tailwind, react-router-dom, react-chessboard, chess.js | Vercel |
| Server | Node 20.18.0 (`>=20 <22`), Express 4, bcrypt, jsonwebtoken, cors | Render |
| DB | Turso (libSQL) vía `@libsql/client` | Turso |

## Estructura

```
client/src/
  pages/        Home (login/landing), Dashboard (/home), Cycles, Solo, Puzzles,
                Vision, History, Leaderboard, BlindChess, Openings
  components/Board/PuzzleBoard.tsx   Tablero custom (click-to-move + drag propio)
  lib/          api.ts (fetch al backend), auth (contexto), time
  hooks/        useTimer
  types/        Block, Puzzle, AttemptRecord...
  public/       /sounds (move, capture, correct, error .mp3), /pieces (wK.svg ...)
server/src/
  index.js              Express, CORS, arranca initDb()
  middleware/auth.js    JWT Bearer
  routes/api.js         Todas las rutas bajo /api
  db/database.js        Schema, migraciones, seed de puzzles (archivo enorme)
```

## Variables de entorno

**Server (Render):**
- `TURSO_URL`, `TURSO_TOKEN` — base de datos
- `JWT_SECRET` — si falta usa un default inseguro (`woodpecker-secret-change-in-prod`), **definirlo en prod**
- `CLIENT_ORIGIN` — URL del frontend en Vercel (CORS). Local ya permitido: `localhost:5173`
- `PORT` — default 3002

**Client (Vercel):** URL del backend (nombre de la variable: ver `client/src/lib/api.ts`, no documentado aquí).

## Scripts

Server: `npm run dev` (nodemon) · `npm start`
Client: scripts Vite estándar (`dev`, `build`).

## Módulos / páginas

- **Ciclos (`/cycles`)** — Núcleo. Jerarquía: Macrociclo → Ciclo → Repaso → Sesión diaria → Puzzles. Sesión cronometrada (`hours_per_day`), sin saltar puzzles, pista disponible. Solo categorías `palomita` y `woodpecker_method2`. Un macrociclo activo por categoría.
- **Solo (`/solo`)** — Practica un bloque completo cronometrado; guarda `attempts`. Categorías `checkmate_patterns` y `patterns_must_know`. Falla = salta al siguiente (`autoSkipAfterErrors=1`).
- **Puzzles (`/puzzles`)** — Explorador sin tiempo, revisión jugada a jugada, abrir en Lichess.
- **Visión (`/vision`)** — Click en la coordenada pedida, 30 s. Guarda en `vision_sessions`.
- **Ciego (`/blind`)** — Memorizas lista de piezas (60 s), escribes jugadas en notación (acepta D/T/A/C/R español). Progreso lineal por usuario.
- **Historial / Ranking** — Intentos por bloque, racha, calendario; ranking por `score = 1000×resueltos − segundos`.
- **Aperturas (`/openings`)** — Repertorio blancas/negras, import PGN (variantes, comentarios, NAGs, multi-capítulo, carpetas con `Carpeta / Nombre`), árbol interactivo, práctica con anotaciones/flechas, entrenamiento de memoria.

## Categorías de puzzles (`blocks.category`)

`checkmate_patterns` (30 bloques) · `palomita` (Woodpecker, subcats Easy/Intermediate 1/2/Advanced) · `woodpecker_method2` (subcats en español) · `patterns_must_know` (100 patrones, 12 subcats).

## Base de datos (Turso)

Tablas: `users`, `blocks`, `puzzles` (fen + solution JSON de SAN), `attempts`, `puzzle_times`, `vision_sessions`, `blind_puzzles`, `blind_progress`, `macrocycles`, `cycles`, `reviews`, `review_sessions`, `session_puzzles`, `review_config`, `repertoires`, `openings`, `opening_nodes`.

**Seed:** en cada arranque `initDb()` corre `initSchema → migrateDb → seedNewBlocks → seedBlindPuzzles`. `seedNewBlocks` inserta bloques/puzzles nuevos **y actualiza (UPDATE) fen/solution de los existentes** por `(block, order_in_block)`. Las posiciones de los ciclos dependen del orden: **no reordenar ni borrar puzzles** en los arrays de seed (`ORDER BY b.id, order_in_block`).
Los puzzles están hardcodeados en `server/src/db/database.js`.

## API (`/api`, JWT Bearer salvo indicado)

- Auth: `POST /auth/register`, `POST /auth/login` (token 30 d) · `GET /health`
- Públicas: `GET /blocks`, `/puzzles`, `/blocks/:id/puzzles`, `/leaderboard/:blockId`, `/vision/leaderboard/:mode`
- Intentos: `GET/POST /attempts`
- Visión: `POST /vision`, `GET /vision/history`
- Ciego: `GET /blind/puzzle`, `POST /blind/advance`
- Ciclos: `GET/POST /cycles/macrocycles`, `GET /cycles/macrocycles/:id`, `PUT .../config`, `GET /cycles/cycles/:id`, `GET /cycles/reviews/:id`, `POST /cycles/reviews/:id/{start-session|restart|force-close-session}`, `GET /cycles/sessions/:id/puzzle`, `POST /cycles/sessions/:id/{submit|end}`
- Aperturas: `GET /openings/repertoires/:color`, `POST /openings`, `GET|POST /openings/:id/nodes`, `PATCH /openings/:id`, `DELETE /openings/:id`, `PATCH /openings/nodes/:id/{annotation|shapes}`

## Lógica de ciclos (resumen)

- Review config por defecto en la UI: trabajo/descanso `10/1, 7/3, 4/5, 1/7` días (descansos crecientes).
- Una sesión nueva se permite 16 h después del inicio de la última completada.
- Sesión activa abandonada (> hoursPerDay + 1 h) se cierra sola.
- Al completar días de un repaso → se crea el siguiente; al terminar el último → ciclo completo → nuevo ciclo desde el puntero global; sin más puzzles → macrociclo completo.

## ⚠️ Problemas / deuda conocida

1. `opening_nodes` usa columnas `annotation_text`, `annotation_symbol`, `shapes` en la API pero **no están en el schema ni en `migrateDb`** (probablemente añadidas a mano en Turso). Una DB nueva fallaría: agregar `ALTER TABLE` en `migrateDb`.
2. `DEFAULT_REVIEW_CONFIG` del server (`7/3, 5/2, 3/1, 1/0`) difiere del de la UI (`10/1, 7/3, 4/5, 1/7`). La UI siempre envía el suyo, pero conviene unificar.
3. Comentario en `start-session` dice 24 h pero el código usa 16 h.
4. `Leaderboard.tsx` e `History.tsx` solo listan `checkmate_patterns` y `patterns_must_know` (faltan `palomita` / `woodpecker_method2`).
5. Blind: el servidor asume `total: 1000` pero `BLIND_PUZZLES` tiene ~985 cargados; `blind_puzzles` solo se siembra si la tabla está vacía.
6. `idx_puzzle_times_attempt` está duplicado en el schema (inocuo).
7. Racha y calendario de History hacen una request por bloque (lento con muchos bloques); se cachea en `localStorage` (`wp_streak_cache`).
8. Render (plan gratis) puede dormir el servidor → primera request lenta.

## Pendiente de documentar

`client/package.json`, config Vite/Tailwind, `vercel.json`, `client/src/lib/api.ts`, `lib/auth`, `types/`.

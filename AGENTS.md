# AGENTS.md

Chess tactics trainer (Woodpecker / "La Paloma"). Spanish UI. See `README.md` for full feature,
API, DB and cycle-logic documentation — this file only covers what is easy to get wrong.

## Layout & module system

- npm workspaces monorepo: `client` (React 18 + TS + Vite + Tailwind) and `server` (Express 4, CommonJS).
- `server` is CommonJS (`require`), `client` is ESM (`type: module`). Do not mix.
- `server/src/db/database.js` is ~8900 lines with all puzzles hardcoded. Untracked `server/src/socket/`
  is empty; `socket.io-client` + the Vite `/socket.io` proxy exist but nothing uses them — no realtime.
- Deploy: client → Vercel (SPA rewrite in `client/vercel.json`), server → Render, DB → Turso.

## Node version is inconsistent — trust `.node-version`

`.node-version` = 24.0.0 and `server/package.json` engines = `>=24`. But root `package.json` engines
= `>=20 <22` and README says 20.18.0. Use Node 24; the root engines field is stale.

## Commands

- Install all: `npm install` (root, workspaces).
- Client dev: `npm run dev --workspace client` → Vite on 5173, proxies `/api` + `/socket.io` to `localhost:3002`.
- Server dev: `npm run dev --workspace server` → nodemon on 3002 (override with `PORT`).
- Client build: `npm run build --workspace client` (`tsc && vite build`). Root `npm run build` also runs a
  redundant `npm install` inside `client`.
- Server start: root `npm start` or `npm start --workspace server`.
- **There are no tests, no lint, and no standalone typecheck.** The only static check is `tsc`, which runs
  as part of the client build. Use that to verify frontend changes.

## Environment (no dotenv, no .env files)

Env vars are read directly from the process; there is no local `.env` loading. Set them in the shell.

- Server: `TURSO_URL`, `TURSO_TOKEN` (required — `getDb()` has **no local fallback**), `JWT_SECRET`
  (falls back to insecure `woodpecker-secret-change-in-prod`), `CLIENT_ORIGIN` (extra CORS origin;
  `localhost:5173`/`127.0.0.1:5173` always allowed), `PORT` (default 3002).
- Client: `VITE_SERVER_URL` is the API base (`client/src/lib/api.ts:3`). If unset, the dev-server proxy
  does not make API calls relative — requests still use that base, so set it for local dev.
- `server/woodpecker.db*` are committed but unused by the current code (no `file:` fallback).

## Startup side effects (dangerous)

`initDb()` runs on every server boot: `initSchema → migrateDb → seedNewBlocks → seedBlindPuzzles`.
`seedNewBlocks` **UPDATEs `fen`/`solution` of existing puzzles** matched by `(block, order_in_block)`.
Cycle puzzle positions depend on `ORDER BY b.id, order_in_block`, so **never reorder or delete entries
in the seed arrays** in `database.js`.

## Known schema/DB gotchas

- `opening_nodes` API uses `annotation_text`, `annotation_symbol`, `shapes`, but these are **absent from
  the schema and `migrateDb`**. A fresh DB breaks openings; add `ALTER TABLE` in `migrateDb` if needed.
- Server's `DEFAULT_REVIEW_CONFIG` (`7/3, 5/2, 3/1, 1/0`) differs from the UI default
  (`10/1, 7/3, 4/5, 1/7`, increasing rests). UI always sends its own.
- `start-session` comment says 24 h but code enforces 16 h.
- `History.tsx` / `Leaderboard.tsx` only list `checkmate_patterns` + `patterns_must_know`, omitting
  `palomita` / `woodpecker_method2`.

See README's "Problemas / deuda conocida" for the rest.

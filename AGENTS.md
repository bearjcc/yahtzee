# AGENTS.md

## Cursor Cloud specific instructions

DiceLab (`package.json` name `yahtzee`) is a single, zero-backend Vite + TypeScript SPA that trains neural nets to play Yahtzee / Farkle / 6 Cubes / Goblin Gamble entirely in the browser (Web Workers + IndexedDB). Game engines live under `src/games/`; a shared padded NN I/O lets one genome play multiple selected games. There is no server, database, API, or secrets to configure.

Standard commands live in `package.json` and `README.md`:
- `npm run dev` - Vite dev server (dependency refresh via update script `npm install`).
- `npm test` - Vitest unit tests (Vitest runs in a Node environment, so no browser/dev server needed).
- `npm run build` - `tsc` typecheck + Vite production build. There is no separate lint script; `tsc` is the type/lint gate.
- `npm run preview` - serves the production `dist/`.

Non-obvious caveats:
- The dev server serves under the base path `/yahtzee/` (set in `vite.config.ts`). Open `http://localhost:5173/yahtzee/`, not `http://localhost:5173/` (root returns 404).
- The same `/yahtzee/` base applies to `npm run preview`.
- Core E2E flow to smoke test the UI: open the app, click `RUN`, watch the fitness chart / terminal / TOP 50 table update live, then `SAVE` (persists a checkpoint to IndexedDB; terminal prints "Saved checkpoint to IndexedDB").

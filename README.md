# DiceLab

Browser trainer for dice-game neural nets (Yahtzee, Farkle, 6 Cubes). Select one or more games via checkboxes to cross-train a shared policy. Runs locally (or on GitHub Pages); no server required.

## Run

```bash
npm install
npm test
npm run dev
```

## Build / Pages

```bash
npm run build
```

Output: `dist/`. Base path `/yahtzee/` for `https://<user>.github.io/yahtzee/`.

CI: `.github/workflows/pages.yml` tests, builds, deploys Pages.

## Checkpoint

Save / Load uses IndexedDB. Export JSON for a portable dump.

---

Not affiliated with Hasbro, General Mills, or any brand. Public-domain game mechanics; original UI.

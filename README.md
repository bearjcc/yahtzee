# DiceLab NeuroEvo

Browser-local neuroevolution for solitaire dice scoring (classic 13-box rules). Append-only lottery population: fitness is the mean of two full games; parents are drawn with tickets = score^k.

**Not affiliated** with Hasbro, General Mills, or any brand. Original UI; public-domain game mechanics only.

## Run locally

```bash
npm install
npm test
npm run dev
```

## Build / GitHub Pages

```bash
npm run build
```

Static output is in `dist/`. Base path is `/yahtzee/` for `https://<user>.github.io/yahtzee/`.

CI: `.github/workflows/pages.yml` runs tests, builds, and deploys Pages.

## Controls

- Setup: lottery `k`, seed count, mutation, max bots (storage estimate), end conditions
- Overview: fitness line chart, 25-pt histogram, bot table, activity console
- Save/Load: IndexedDB checkpoint; Export JSON for backup

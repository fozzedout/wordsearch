# Project notes for Claude

## Workflow

- Work directly on `main` and push there. We do not use pull requests or
  feature branches in this repo.

## Commands

- `npm run build` — type-check (`tsc -b`) and build with Vite.
- `npx vite` — dev server.

## Layout

- `src/main.ts` — game UI: rendering, pointer selection, persistence.
- `src/wordsearch.ts` — puzzle generation (grid size, word placement).
- `src/confetti.ts` — win celebration canvas animation.
- `src/style.css` — all styling; light/dark via `prefers-color-scheme`.
- `worker/`, `wrangler.jsonc` — Cloudflare Workers deployment.

# Word Search

A small word search puzzle game built with **Vite** + **TypeScript** and deployed
on **Cloudflare Workers** (static assets served via a minimal Worker).

Each new game picks **10 random words** and hides them in a **6×9 letter grid**.
Words can run **horizontally, vertically or diagonally**, forwards or backwards,
and may cross where their letters match. Find a word by dragging across its
letters; found words are crossed off the list. Clear the board to trigger a
confetti celebration. The UI automatically follows your system **light/dark**
theme.

It is an installable **PWA**: a web app manifest plus a service worker
pre-cache the app shell and word list so it runs offline and can be added to
the home screen. iOS specifics follow
[this guidance](https://gist.github.com/fozzedout/5e77925381991a9570151550992baf14) —
`viewport-fit=cover`, `apple-mobile-web-app` meta tags, safe-area insets around
the notch / Dynamic Island / home indicator, and `vh`-based sizing (avoiding
`100%`/`dvh`). The service worker is only registered in production builds.

## Word list

Words come from [`fozzedout/jaxah`](https://github.com/fozzedout/jaxah)
(`en-words.txt`), filtered to 3–6 letter entries and bundled as
[`public/words.txt`](public/words.txt). The longest word fits the grid's shorter
dimension so it can be placed in any orientation.

## Develop

```bash
npm install
npm run dev        # Vite dev server with the Cloudflare plugin
```

## Build & deploy

```bash
npm run build      # type-check + Vite build (outputs to dist/)
npm run preview    # preview the production build locally
npm run deploy     # build and deploy to Cloudflare Workers (wrangler)
```

Deployment requires a Cloudflare account; authenticate with `npx wrangler login`
before running `npm run deploy`. Configuration lives in
[`wrangler.jsonc`](wrangler.jsonc).

## Project layout

| Path                  | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `index.html`          | App shell                                        |
| `src/main.ts`         | Game controller, rendering and drag selection    |
| `src/wordsearch.ts`   | Puzzle generation (placement in 8 directions)    |
| `src/confetti.ts`     | Canvas confetti burst on completion              |
| `src/style.css`       | Styling with automatic light/dark theming        |
| `public/words.txt`    | Bundled word list                                |
| `worker/index.ts`     | Minimal Worker serving the static assets         |

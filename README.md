# Poké Scanner

Upload a photo, let a vision model read the subject, match it against 1025
Chinese Pokédex entries, and export a downloadable Pokédex card.

Built with Vue 3 + TypeScript + Tailwind CSS v4 + shadcn-style components.

## Quick start

```bash
npm install
npm run sync:data      # one-off: builds src/data/pokemon.json + public/pokemon/*.png
npm run dev
```

Then open the app, click **设置**, and fill in:

| Field | Example |
|---|---|
| Base URL | `https://your-proxy.example.com/v1` |
| API Key | `sk-…` (may be empty if your proxy injects it) |
| Model | `gpt-4o-mini` / `gemini-2.0-flash` |

Settings are stored in `localStorage`. You can also ship defaults via `.env`
(see `.env.example`).

```bash
npm run build          # type-check + production build
npm run preview
```

## How matching works

Asking a vision model to "pick the closest of 1025 names" hallucinates. The app
splits the job into three stages instead:

1. **Describe** (`src/lib/ai.ts`) — the vision model returns structured attributes
   only: subject, animal family, colours, body features, elemental cues, inferred
   types, posture. It is explicitly *not* asked to choose a Pokémon.
2. **Match** (`src/lib/matcher.ts`) — a deterministic local scorer projects both
   the description and every species' Chinese profile prose onto a shared
   bilingual concept vocabulary (`src/lib/lexicon.ts`), then scores the overlap.
   Concepts are weighted by **inverse document frequency across the dataset**, so
   "毛" (fur, in hundreds of entries) barely counts while "猫科" (feline, rare) is
   strongly informative.
3. **Re-rank** (`src/lib/ai.ts`) — the LLM re-orders the local top-18 and writes a
   short reason per candidate. Failures here are non-fatal; the local ranking is
   still shown.

Because stage 2 resolves to real dataset ids, results can never reference a
Pokémon that does not exist, scores are reproducible, and every candidate carries
explainable reasons ("黄毛长耳", "电属性契合").

Non-Pokémon input (e.g. a real cat photo) is handled deliberately: the aggregate
confidence drops and a banner states the subject probably is not a Pokémon, rather
than presenting a guess as fact.

## Card export

`src/lib/exportCard.ts` draws the 1080×1350 card with **Canvas 2D**, not DOM
capture. That choice avoids the two things that usually break PNG export:

- no webfont embedding needed, so CJK glyphs never render blank
- artwork is same-origin (`public/pokemon/`), so the canvas is never tainted

## Data

[`42arch/pokemon-dataset-zh`](https://github.com/42arch/pokemon-dataset-zh),
sourced from 52poke. `npm run sync:data` flattens 1025 species into
`src/data/pokemon.json` and mirrors official artwork into `public/pokemon/`
(~17 MB). Re-run it to refresh.

## Verification

```bash
node scripts/verify-matcher.mjs   # matcher ranking assertions
node scripts/e2e-check.mjs        # browser E2E with a mocked AI endpoint
```

`e2e-check.mjs` drives the real UI against the real dataset, mocks the model
calls, and asserts: upload → describe → match → rerank → card render → PNG
download → error handling. Screenshots land in `artifacts/`.

## Layout

```
src/lib/ai.ts            stage A / stage C, OpenAI + Gemini request shapes
src/lib/matcher.ts       stage B, IDF-weighted concept scoring
src/lib/lexicon.ts       bilingual concept vocabulary
src/lib/exportCard.ts    Canvas 2D card renderer
src/lib/image.ts         client-side downscale before upload
src/composables/         useScanner (pipeline), useSettings, useToast
scripts/sync-dataset.mjs dataset build
```

## Disclaimer

Unofficial fan project. Pokémon names and artwork belong to Nintendo /
Creatures Inc. / GAME FREAK / The Pokémon Company.

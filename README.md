# OrbitAI

**The operating system for the space economy.**

A real-time 3D visualization of every active satellite in orbit, with an AI copilot that
plans hypothetical launches, runs the ascent as a cinematic sequence, analyzes orbital
congestion around the new satellite, and recommends safer orbits.

## What it does

- **Live Earth** — day/night terminator, city lights, atmosphere, stars, bloom.
- **Live population** — ~15,600 active satellites from CelesTrak, propagated analytically
  on the GPU (Keplerian elements + J2 precession per satellite as vertex attributes), so
  motion stays smooth from 1x up to 1 day per second.
- **Time controls** — pause / 1x / 10x / 100x / 1000x / 1 day-per-second.
- **Search & inspect** — fuzzy search by name or NORAD ID, camera fly-to, hover tooltips,
  click for live altitude / velocity / inclination / period and the orbit trail.
- **AI launch prompt** — type e.g. *"Launch a 250kg imaging satellite from Sriharikota
  into 550km SSO"*; the mission is parsed to structured parameters via the Vercel AI Gateway.
- **Cinematic launch** — camera flies to the pad, chase-cam ascent, separation flash,
  animated orbit insertion into the live simulation (~15 s).
- **Traffic analysis** — satellites within ±20 km altitude and ±2° inclination, estimated
  conjunctions, density score; nearby traffic renders red.
- **AI mission report** — collision risk, density, nearby constellations, expected
  lifetime, ground revisit, and a recommended altitude you can accept with one click.

## Stack

- **Next.js (App Router) + TypeScript**, deployed on Vercel
- **Three.js via React Three Fiber** (+ drei, postprocessing)
- **Neon Postgres + Drizzle** — cached CelesTrak GP catalog, refreshed daily by Vercel Cron
- **Vercel AI SDK + AI Gateway** — mission parsing and report generation
  (default model `google/gemini-2.5-flash`, override with `AI_MODEL`)

## Development

```bash
pnpm install
pnpm dev
```

Environment (`.env.local`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `CRON_SECRET` | Bearer token protecting `/api/cron/refresh-catalog` |
| `AI_MODEL` | Gateway model id (optional, defaults to `google/gemini-2.5-flash`) |
| `VERCEL_OIDC_TOKEN` | Local AI Gateway auth — refresh with `vercel env pull` |

Seed/refresh the catalog:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh-catalog
```

## Accuracy disclaimer

This is a vision demo, not aerospace software. Rendering uses a two-body Keplerian model
with secular J2 precession (not full SGP4), conjunction counts are heuristic, and lifetime /
revisit numbers are toy formulas. Do not plan real missions with it.

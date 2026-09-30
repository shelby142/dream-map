# Dream Map

Explore dreamers and dreams on a world map. Browse any region, follow progress, vote for a dream, or offer help.

This repository contains the current Dream Map v0.1 prototype source. The hosted prototype remains private: publishing source code does not change access to the website or its production database.

## Current experience

- Pan and zoom a world map; explore dreams within the visible area or a selected country.
- Filter dreams by status and open dream details.
- Create a dream with a required title and Dreamer Location, optional description, hashtag, and Dream Destination.
- Track `dreamed`, `in-progress`, and `achieved` status; only the dreamer can change status.
- Toggle one vote per user per dream and save an offer to help.
- Start with 12 clearly marked example dreams.

## Data model

`dreamers` stores users, `dreams` stores their dreams and both location types, `votes` stores unique dream/user votes, and `help_offers` stores messages from helpers. Dreamer Location is required for each dream; Dream Destination is optional.

The schema is in `db/schema.ts`; the initial SQL migration is `drizzle/0000_steady_darkhawk.sql`. Production records and credentials are not included in this repository.

## Stack

React, TypeScript, Vinext/Vite, Tailwind CSS, D3 Geo, TopoJSON, Cloudflare Workers/D1, and Drizzle. Dependencies are pinned by `pnpm-lock.yaml` and the package manager version in `package.json`.

## Local development on macOS

Prerequisites: Git, Node.js >=22.13.0, and pnpm 11.25.0.

```sh
git clone https://github.com/shelby142/dream-map.git "$HOME/Desktop/Dream Map"
cd "$HOME/Desktop/Dream Map"
pnpm install --frozen-lockfile
pnpm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_steady_darkhawk.sql
pnpm run dev
```

Run the migration once for a fresh local database. Reuse the existing database on later starts. The dev server prints its local URL (normally `http://localhost:5173`).

A clean clone defaults to the portable execution profile. Use pnpm directly on macOS; `install:ci` is a managed Linux installation helper. Local development uses a preview identity for dream actions. Hosted authentication is supplied by Sites; an arbitrary public server must not trust client-supplied `oai-authenticated-user-*` headers.

`pnpm run build` generates the Worker build; `pnpm start` previews it locally. This does not deploy to production. The production database is separate from the local database.

## Source layout

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Map, region exploration, dream details, and creation form |
| `app/api/dreams/route.ts` | Dream creation, votes, help offers, and status updates |
| `lib/dream-data.ts` | Data queries, example dreams, and viewer identity |
| `db/`, `drizzle/` | Database schema and migrations |
| `components/`, `hooks/` | Shared UI components |
| `build/`, `scripts/` | Worker build and local runtime helpers |
| `.openai/hosting.json` | Existing Sites project and logical database binding |

The app source is preserved from the current hosted prototype. This export adds project documentation and excludes generated TypeScript build cache. Deployment and UI verification have not been rerun for this source export. See `docs/starter-notes.md` for the starter's original runtime notes.

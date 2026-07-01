# SEA ROV Inspector — Web

React (Vite) + Netlify rebuild of the ROV Inspector desktop app.

## Stack

- Frontend: React + Vite SPA, TypeScript, shadcn/ui, TanStack Query, react-hook-form
- Auth: Netlify Identity (invite-only)
- Database: Netlify Database (Postgres) via Drizzle ORM
- File storage: Netlify Blobs (photos + generated PDFs)
- Backend: Netlify Functions
- PDF generation: `@react-pdf/renderer`
- Offline: PWA (`vite-plugin-pwa`) + IndexedDB outbox for offline report creation

## First-time setup (do this once, on a real Netlify account)

1. `npm install`
2. Log in and link a Netlify site: `npx netlify login`, then `npx netlify init` (or `npx netlify link` if the site already exists).
3. Provision the database: `npx netlify database init --yes` (installs `@netlify/database`, applies the starter migration locally). Then apply this project's actual migrations: `npm run db:migrate`.
4. Enable Identity: in the Netlify dashboard, **Project configuration → Identity → Enable Identity**, then switch **Registration** to **Invite only**. Invite each team member by email from that same screen.
5. Deploy: `npx netlify deploy --prod` (or connect a Git repo for CI deploys).

## Local development

Netlify Identity does not work under `netlify dev` (it's a hosted service). A local-only auth bypass is provided:

1. `cp .env.example .env` (already gitignored) — this sets `DEV_AUTH_BYPASS` / `VITE_DEV_AUTH_BYPASS`, which only take effect locally and must never be set in a real Netlify deploy's environment variables.
2. `npm run netlify:dev` — runs the Vite dev server + Functions together on `http://localhost:8888`.
3. To test real Identity flows (login, invite acceptance), deploy to a preview instead: `npx netlify deploy`.

## Database schema changes

```
# 1. Edit db/schema.ts
# 2. Generate a migration
npm run db:generate
# 3. Apply it to your local dev DB to test
npm run db:migrate
# 4. Commit the schema + migration file together, push.
#    The deploy applies it to the preview branch, then production on publish.
```

Never run `drizzle-kit push` or apply migrations directly against a hosted (preview/production) database — the deploy does that automatically.

## What's implemented

- Full report CRUD (create/edit/list/search/delete) with an atomic report-number counter
- All report fields per the field-by-field plan (creatable comboboxes, selects, numeric+unit fields, M/R merd-number toggle)
- Inspection results section with smart per-category default comment templates
- "Legg til maskebrudd" structured dialog
- Per-category image upload (drag-and-drop, 6 categories), server-side resize before storage
- PDF generation matching the legacy report layout, with a cached/stale-aware download flow
- Settings page for managing all `field_options` dropdown values (fully user-editable, seed values included)
- Offline support: report creation works fully offline (IndexedDB outbox), auto-syncs when connectivity returns, idempotent server-side so retries never duplicate

## Known gaps / next iterations

- **PWA icons are placeholders** (reuses the Vite scaffold favicon) — swap in real SEA ROV branded icons in `vite.config.ts`'s `manifest.icons` and `public/`.
- **Bundle size**: the initial JS bundle is ~210KB gzipped; consider route-based `React.lazy()` code-splitting if load time on a slow boat connection becomes a problem.
- **Offline viewing of past reports** is not implemented (only offline *creation* of new reports, per the agreed v1 scope) — viewing/searching history requires connectivity.
- **Offline editing** of an already-synced report is not supported (view-only when offline) — also agreed v1 scope.
- First admin/invite setup is manual via the Netlify dashboard (Identity's own limitation, not scriptable).
- `sharp`/native image libs were deliberately avoided in favor of pure-JS `Jimp` for server-side image resizing, trading some speed for predictable serverless bundling — revisit if upload volume grows and resize latency becomes noticeable.

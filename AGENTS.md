# Codex Project Instructions

## Local preview and deployment

- Unless the user explicitly requests deployment, phrases such as "reflect changes", "preview", "make it available for review", and "show the fix" mean run the local development server and provide its localhost URL.
- The standard local preview is `npm run dev` at `http://localhost:3000`. Confirm the server actually started on port 3000 before reporting that URL. If the port is occupied, report the conflict; do not silently substitute another URL.
- `npm run preview:local` on port 3001 is reserved for checking from another device on the same Wi-Fi network and existing image measurement scripts. It is not the default preview.
- Create a Vercel Preview Deployment only when the user explicitly asks for "Vercel Preview". The word "preview" alone does not authorize it.
- Deploy to Vercel Production or update the production URL only when the user explicitly requests deployment or production release.
- Push to GitHub, update a production branch, or publish to any other external environment only when the user explicitly requests that action. Local preview does not require any of these actions.

## Bug fixing

When fixing bugs, do not make speculative changes.

Follow this process:

1. Reproduce the bug before modifying code whenever possible.
2. Investigate all related code before deciding on the cause.
3. Identify the root cause.
4. Apply the smallest appropriate fix.
5. Run the application and verify the actual user-visible behavior.
6. Run relevant tests and checks.
7. Do not claim that a bug is fixed only because the build succeeds.

For UI bugs, inspect when relevant:

- event propagation
- pointer / click / touch handlers
- React state
- duplicate handlers
- parent and child interactions
- CSS conflicts
- computed styles
- z-index
- overflow
- transform
- responsive/mobile implementations
- duplicate components

If the bug cannot be reproduced, do not guess at a fix.
Report that it could not be reproduced and explain what was investigated.

When a previous fix has already failed, inspect git diff/history and previous changes related to the bug before adding another workaround.

Prefer root-cause fixes over CSS offsets, delays, arbitrary conditionals, or other symptom-hiding patches.

When scroll and drag interactions coexist, use the shared gesture classification by default. Do not introduce zone-specific angle thresholds, movement thresholds, or mid-gesture switching unless explicitly requested. Once classified as scroll or drag, keep that classification for the remainder of the gesture. Extend the shared gesture system for zone-specific behavior instead of duplicating or overriding it.

## Production DB Safety

This repository is developed by multiple Codex sessions and worktrees. Parallel feature development is allowed; production Supabase mutation is a single dedicated integration/release-session operation.

- Feature sessions must not modify production Supabase. They may create a migration, validate it locally, and keep it with the feature; production application remains pending.
- Do not run `supabase db push --linked`, `supabase migration repair`, `supabase db reset --linked`, production SQL/DDL/DML, or direct `supabase_migrations.schema_migrations` changes from a normal feature session.
- A migration must be committed to Git before production application. Never apply it first and commit its source later.
- Before creating a migration, check `price-dm/main`, the current worktree, and relevant visible worktrees for the same version or purpose. Reuse an existing migration or stop and report; choose an unused timestamp on a collision.
- Use `price-dm` explicitly for this repository. `origin` and `origin/main` are not the Price_DM source of truth. Never apply another repository's migrations to Price_DM production.
- Only the designated release session may write production DB, and only one session may do so at a time. Stop if remote migration history changes unexpectedly.
- Production migration repair requires the exact version and status plus explicit user approval; do not provide it as a convenience command.

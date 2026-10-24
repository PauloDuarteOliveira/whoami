# WhoAmI
![CI and deploy](https://github.com/PauloDuarteOliveira/whoami/actions/workflows/deploy.yml/badge.svg)

A multiplayer "Who Am I?" party game. Everyone gets a secret character they can't see,
and players take turns asking yes-or-no questions until they guess who they are.

**Live app:** https://pauloduarteoliveira.github.io/whoami/

## Features

- Home page with a live check of the game server connection

## Tech

- Angular (standalone components, signals, Reactive Forms, Router, HttpClient)
- Supabase (PostgreSQL + REST API) as the data source
- Hosted on GitHub Pages

## Data source

The app reads and writes data through the **Supabase REST API**, called with Angular's `HttpClient`.
The database tables are documented in [`supabase/schema.sql`](supabase/schema.sql),
and the starter decks in [`supabase/seed.sql`](supabase/seed.sql).

## Run locally

Requirements: Node.js and the Angular CLI.

```bash
npm install
Before running, copy `src/environments/environment.example.ts` to `src/environments/environment.ts`
and fill in your Supabase project URL and publishable key.
ng serve
```

Then open http://localhost:4200.

## Deploy

## Deploy

Every pull request is checked by GitHub Actions (install → lint → build).
Every merge into `main` is built and published to GitHub Pages automatically.
The Supabase URL and key come from the repository secrets `SUPABASE_URL` and `SUPABASE_KEY`.
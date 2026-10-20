# WhoAmI

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
ng serve
```

Then open http://localhost:4200.

## Deploy

```bash
npm run deploy
```

Builds the app and publishes it to the `gh-pages` branch.
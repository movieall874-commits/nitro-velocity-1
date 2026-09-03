# Nitro Velocity 3D — with real backend, database & login

A browser-based 3D racing game (Three.js) with a real Node.js/Express API,
PostgreSQL database, bcrypt password hashing and JWT-based login — so a
player's profile, car, paint, wheels, best score and cash follow them to
any device, not just the browser they played in.

Controls: W/Arrow Up accelerate, S/Arrow Down brake/reverse, A/D or
Left/Right steer, Space nitro, P pause. Mobile touch controls included.

## What runs where
- **`web`** — nginx serving the static game (`index.html`, `assets/`) and
  reverse-proxying `/api/*` to the backend.
- **`api`** — Node/Express server (`backend/server.js`) with
  `/api/auth/register`, `/api/auth/login`, `GET /api/save`,
  `PUT /api/save`.
- **`db`** — PostgreSQL 16. Schema (`backend/schema.sql`) is applied
  automatically on first boot.

## Run everything locally
```
docker compose up --build
```
Then open **http://localhost:8080**.

- Postgres data persists in a named Docker volume (`db_data`) between
  restarts.
- The API listens on port 4000, the web/nginx container on 8080 (mapped
  to its internal port 10000).

## How login works in the game
On the start screen, enter a **Player ID** and a **password**:
- If that Player ID doesn't exist yet, a new account is created
  automatically (same "create / enter profile" flow as before).
- If it exists, the password is checked against the stored bcrypt hash.
- On success you get a JWT (valid 30 days) stored in the browser, and
  your car/paint/wheels/best score/cash are pulled from the database.
- **Leaving the password blank** still works — that's guest/offline
  mode, same as the original build (progress only saved to
  `localStorage` on that device).

## Deploying for free

### The easy way — Render Blueprint
This repo includes a `render.yaml`. On Render: **New → Blueprint**,
point it at this GitHub repo, and it creates all three pieces
(`nitro-velocity-api`, `nitro-velocity-web`, and a free Postgres
database) with the correct settings already wired up. After the first
deploy, open the `nitro-velocity-api` service, copy its public
`https://....onrender.com` URL, paste it into the `web` service's
`API_URL` environment variable, and redeploy `web`.

### Fixing "COPY package.json ./ ... not found"
If you saw this error, it's because a Docker service on Render was
built with the **build context set to the repo root** while using
`backend/Dockerfile`. `backend/Dockerfile` only works when the
**context is the `backend/` folder** — that's the only place
`package.json` lives. If you're setting up services by hand (not the
Blueprint above), set, for the API service:
- **Dockerfile Path**: `backend/Dockerfile`
- **Docker Build Context Directory**: `backend`

(or equivalently set the service's **Root Directory** to `backend`).
The frontend service keeps the repo root as both its Dockerfile path
and build context.

### Manual setup
- **Database**: a free Postgres instance from Render, Railway, Neon or
  Supabase. Set `DATABASE_URL` on the `api` service to that connection
  string.
- **API**: deploy `backend/` as a Docker/Node web service (Render,
  Railway, Fly.io free tiers all work), with the build context set to
  `backend/` as above. Set `JWT_SECRET` to a long random value — **do
  not use the default in production**.
- **Frontend**: deploy the root (`Dockerfile` + `nginx.conf.template`)
  with the repo root as context, and set the `API_URL` environment
  variable to your deployed API's public URL (e.g.
  `https://nitro-velocity-api.onrender.com`). The container fills
  this into the nginx config automatically at startup — no manual
  editing of `nginx.conf.template` needed.

## Security notes
- Passwords are hashed with bcrypt (10 rounds) — never stored in plain
  text.
- Change `JWT_SECRET` and the Postgres password in `docker-compose.yml`
  before deploying anywhere public.
- This is still a hobby-scale setup (no rate limiting, no email
  verification/password reset). Fine for a personal project or small
  audience; a larger production launch would want those added.

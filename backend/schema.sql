-- Nitro Velocity 3D — database schema
-- Runs automatically on first container start (mounted into
-- /docker-entrypoint-initdb.d/ by docker-compose.yml)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  player_id     VARCHAR(32) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saves (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  car         VARCHAR(16) NOT NULL DEFAULT 'audi',
  track       VARCHAR(16) NOT NULL DEFAULT 'city',
  paint       VARCHAR(16) NOT NULL DEFAULT '#ff6a00',
  wheel       VARCHAR(16) NOT NULL DEFAULT 'sport',
  best        INTEGER NOT NULL DEFAULT 0,
  cash        INTEGER NOT NULL DEFAULT 125000,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

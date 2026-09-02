const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '30d';

function validPlayerId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_]{3,24}$/.test(id);
}
function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 4 && pw.length <= 64;
}

async function ensureSaveRow(userId) {
  await pool.query(
    'INSERT INTO saves (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
}

function signToken(user) {
  return jwt.sign({ sub: user.id, playerId: user.player_id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, playerId: payload.playerId };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Register a new driver profile
app.post('/api/auth/register', async (req, res) => {
  const { playerId, password } = req.body || {};
  if (!validPlayerId(playerId)) {
    return res.status(400).json({ error: 'Player ID must be 3-24 letters, numbers or underscores.' });
  }
  if (!validPassword(password)) {
    return res.status(400).json({ error: 'Password must be 4-64 characters.' });
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE player_id = $1', [playerId]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'That Player ID is already taken.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const inserted = await pool.query(
      'INSERT INTO users (player_id, password_hash) VALUES ($1, $2) RETURNING id, player_id',
      [playerId, hash]
    );
    const user = inserted.rows[0];
    await ensureSaveRow(user.id);
    const token = signToken(user);
    res.status(201).json({ token, playerId: user.player_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// Log in to an existing profile
app.post('/api/auth/login', async (req, res) => {
  const { playerId, password } = req.body || {};
  if (!validPlayerId(playerId) || !validPassword(password)) {
    return res.status(400).json({ error: 'Invalid Player ID or password.' });
  }
  try {
    const result = await pool.query('SELECT id, player_id, password_hash FROM users WHERE player_id = $1', [playerId]);
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid Player ID or password.' });
    }
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid Player ID or password.' });
    }
    await ensureSaveRow(user.id);
    const token = signToken(user);
    res.json({ token, playerId: user.player_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Fetch this player's cloud save
app.get('/api/save', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT car, track, paint, wheel, best, cash FROM saves WHERE user_id = $1', [req.user.id]);
    if (!result.rows.length) {
      await ensureSaveRow(req.user.id);
      return res.json({ car: 'audi', track: 'city', paint: '#ff6a00', wheel: 'sport', best: 0, cash: 125000 });
    }
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load save.' });
  }
});

// Update this player's cloud save
app.put('/api/save', auth, async (req, res) => {
  const { car, track, paint, wheel, best, cash } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO saves (user_id, car, track, paint, wheel, best, cash, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (user_id) DO UPDATE SET
         car = EXCLUDED.car, track = EXCLUDED.track, paint = EXCLUDED.paint,
         wheel = EXCLUDED.wheel, best = EXCLUDED.best, cash = EXCLUDED.cash,
         updated_at = now()`,
      [req.user.id, car || 'audi', track || 'city', paint || '#ff6a00', wheel || 'sport', best || 0, cash || 125000]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save progress.' });
  }
});

app.listen(PORT, () => console.log(`Nitro Velocity API listening on :${PORT}`));

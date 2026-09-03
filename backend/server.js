const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json({limit:'32kb'}));
app.get('/', (req,res)=>res.json({ok:true,service:'Nitro Velocity API'}));
app.get('/api/health', (req,res)=>res.json({ok:true}));

const PORT=process.env.PORT||4000;
const JWT_SECRET=process.env.JWT_SECRET||'dev-secret-change-me';
const TOKEN_TTL='30d';
function validPlayerId(id){return typeof id==='string'&&/^[A-Za-z0-9_]{3,24}$/.test(id)}
function validPassword(pw){return typeof pw==='string'&&pw.length>=4&&pw.length<=64}
function cleanSave(body={}){return {car:['audi','range','thar'].includes(body.car)?body.car:'audi',track:['city','desert','mountain'].includes(body.track)?body.track:'city',paint:/^#[0-9a-fA-F]{6}$/.test(body.paint||'')?body.paint:'#ff6a00',wheel:['sport','luxury','offroad'].includes(body.wheel)?body.wheel:'sport',best:Math.max(0,Math.min(100,Number(body.best)||0)),cash:Math.max(0,Math.min(999999999,Number(body.cash)||125000)),engine:Math.max(0,Math.min(5,Number(body.engine)||0)),nitroLevel:Math.max(0,Math.min(5,Number(body.nitroLevel)||0)),wins:Math.max(0,Math.min(999999,Number(body.wins)||0))}}
async function ensureSaveRow(userId){await pool.query('INSERT INTO saves (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',[userId])}
function signToken(user){return jwt.sign({sub:user.id,playerId:user.player_id},JWT_SECRET,{expiresIn:TOKEN_TTL})}
function auth(req,res,next){const h=req.headers.authorization||'',token=h.startsWith('Bearer ')?h.slice(7):null;if(!token)return res.status(401).json({error:'Missing token'});try{const p=jwt.verify(token,JWT_SECRET);req.user={id:p.sub,playerId:p.playerId};next()}catch(_){return res.status(401).json({error:'Invalid or expired token'})}}

app.post('/api/auth/register',async(req,res)=>{const {playerId,password}=req.body||{};if(!validPlayerId(playerId))return res.status(400).json({error:'Player ID must be 3-24 letters, numbers or underscores.'});if(!validPassword(password))return res.status(400).json({error:'Password must be 4-64 characters.'});try{const existing=await pool.query('SELECT id FROM users WHERE player_id=$1',[playerId]);if(existing.rows.length)return res.status(409).json({error:'That Player ID is already taken.'});const hash=await bcrypt.hash(password,10);const inserted=await pool.query('INSERT INTO users (player_id,password_hash) VALUES ($1,$2) RETURNING id,player_id',[playerId,hash]);const user=inserted.rows[0];await ensureSaveRow(user.id);res.status(201).json({token:signToken(user),playerId:user.player_id})}catch(e){console.error(e);res.status(500).json({error:'Registration failed.'})}});

app.post('/api/auth/login',async(req,res)=>{const {playerId,password}=req.body||{};if(!validPlayerId(playerId)||!validPassword(password))return res.status(400).json({error:'Invalid Player ID or password.'});try{const r=await pool.query('SELECT id,player_id,password_hash FROM users WHERE player_id=$1',[playerId]);if(!r.rows.length)return res.status(401).json({error:'Invalid Player ID or password.'});const user=r.rows[0];if(!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Invalid Player ID or password.'});await ensureSaveRow(user.id);res.json({token:signToken(user),playerId:user.player_id})}catch(e){console.error(e);res.status(500).json({error:'Login failed.'})}});

app.get('/api/save',auth,async(req,res)=>{try{await ensureSaveRow(req.user.id);const r=await pool.query('SELECT car,track,paint,wheel,best,cash,engine,nitro_level AS "nitroLevel",wins FROM saves WHERE user_id=$1',[req.user.id]);res.json(r.rows[0]||cleanSave())}catch(e){console.error(e);res.status(500).json({error:'Could not load save.'})}});
app.put('/api/save',auth,async(req,res)=>{const s=cleanSave(req.body);try{await pool.query(`INSERT INTO saves (user_id,car,track,paint,wheel,best,cash,engine,nitro_level,wins,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) ON CONFLICT (user_id) DO UPDATE SET car=EXCLUDED.car,track=EXCLUDED.track,paint=EXCLUDED.paint,wheel=EXCLUDED.wheel,best=EXCLUDED.best,cash=EXCLUDED.cash,engine=EXCLUDED.engine,nitro_level=EXCLUDED.nitro_level,wins=EXCLUDED.wins,updated_at=now()`,[req.user.id,s.car,s.track,s.paint,s.wheel,s.best,s.cash,s.engine,s.nitroLevel,s.wins]);res.json({ok:true})}catch(e){console.error(e);res.status(500).json({error:'Could not save progress.'})}});


// Automatically create/prepare database tables on startup.
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        player_id VARCHAR(32) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS saves (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        car VARCHAR(16) NOT NULL DEFAULT 'audi',
        track VARCHAR(16) NOT NULL DEFAULT 'city',
        paint VARCHAR(16) NOT NULL DEFAULT '#ff6a00',
        wheel VARCHAR(16) NOT NULL DEFAULT 'sport',
        best INTEGER NOT NULL DEFAULT 0,
        cash INTEGER NOT NULL DEFAULT 125000,
        engine INTEGER NOT NULL DEFAULT 0,
        nitro_level INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE saves ADD COLUMN IF NOT EXISTS engine INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE saves ADD COLUMN IF NOT EXISTS nitro_level INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE saves ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0;
    `);
    console.log("Tables ready ho gaye!");
  } catch (err) {
    console.error("Database table error:", err);
  }
};

async function boot(){
  await initDb();
  app.listen(PORT,()=>console.log(`Nitro Velocity API listening on :${PORT}`));
}
boot();

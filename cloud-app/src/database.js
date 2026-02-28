const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ─── Schema Init ──────────────────────────────────────────────────────────────

async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'checkin',
      dashboard TEXT,
      evening_review TEXT,
      summary TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id SERIAL PRIMARY KEY,
      received_at TIMESTAMP DEFAULT NOW(),
      notes TEXT,
      active_note TEXT,
      reminders TEXT
    );

    CREATE TABLE IF NOT EXISTS tracked_items (
      id SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      session_id INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS google_tokens (
      id SERIAL PRIMARY KEY,
      account_email TEXT NOT NULL UNIQUE,
      account_label TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expiry_date BIGINT,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS life_wheel_scores (
      id SERIAL PRIMARY KEY,
      session_id INTEGER,
      date TEXT NOT NULL,
      phase TEXT NOT NULL DEFAULT 'morning',
      scores TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS aims (
      id SERIAL PRIMARY KEY,
      heart_wish TEXT,
      aim_statement TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      accountability_person TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS aim_reflections (
      id SERIAL PRIMARY KEY,
      aim_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      reflection TEXT,
      practice_happened BOOLEAN,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (aim_id) REFERENCES aims(id)
    );

    CREATE TABLE IF NOT EXISTS orientation (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS oura_tokens (
      id SERIAL PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expiry_date BIGINT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function toISOString(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return val;
}

function rowToSession(row) {
  if (!row) return null;
  return {
    ...row,
    created_at: toISOString(row.created_at),
    completed_at: toISOString(row.completed_at),
  };
}

function rowToSnapshot(row) {
  if (!row) return null;
  return {
    ...row,
    received_at: toISOString(row.received_at),
  };
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function getTodaySession(dateStr) {
  const result = await pool.query('SELECT * FROM sessions WHERE date = $1', [dateStr]);
  return rowToSession(result.rows[0] || null);
}

async function getSessionById(id) {
  const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
  return rowToSession(result.rows[0] || null);
}

async function createSession(dateStr) {
  await pool.query(
    'INSERT INTO sessions (date, status) VALUES ($1, $2) ON CONFLICT (date) DO NOTHING',
    [dateStr, 'checkin']
  );
  const result = await pool.query('SELECT * FROM sessions WHERE date = $1', [dateStr]);
  return rowToSession(result.rows[0]);
}

async function updateSessionStatus(sessionId, status) {
  await pool.query('UPDATE sessions SET status = $1 WHERE id = $2', [status, sessionId]);
}

async function saveDashboard(sessionId, dashboardText) {
  await pool.query(
    "UPDATE sessions SET dashboard = $1, status = $2 WHERE id = $3",
    [dashboardText, 'dashboard', sessionId]
  );
}

async function saveEveningReview(sessionId, reviewText) {
  await pool.query(
    "UPDATE sessions SET evening_review = $1, status = $2, completed_at = NOW() WHERE id = $3",
    [reviewText, 'complete', sessionId]
  );
}

async function saveSessionSummary(sessionId, summary) {
  await pool.query('UPDATE sessions SET summary = $1 WHERE id = $2', [summary, sessionId]);
}

async function getRecentSessions(limit = 7) {
  const result = await pool.query(
    'SELECT * FROM sessions ORDER BY date DESC LIMIT $1',
    [limit]
  );
  return result.rows.map(rowToSession);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

async function addMessage(sessionId, role, content) {
  const result = await pool.query(
    'INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3) RETURNING id',
    [sessionId, role, content]
  );
  return result.rows[0];
}

async function getSessionMessages(sessionId) {
  const result = await pool.query(
    'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
    [sessionId]
  );
  return result.rows;
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

async function saveSnapshot(notes, activeNote, reminders) {
  const result = await pool.query(
    'INSERT INTO snapshots (notes, active_note, reminders) VALUES ($1, $2, $3) RETURNING id',
    [JSON.stringify(notes), activeNote || null, JSON.stringify(reminders)]
  );
  return result.rows[0];
}

async function getLatestSnapshot() {
  const result = await pool.query(
    'SELECT * FROM snapshots ORDER BY received_at DESC LIMIT 1'
  );
  return rowToSnapshot(result.rows[0] || null);
}

// ─── Tracked Items ────────────────────────────────────────────────────────────

async function upsertTrackedItem(description, date, sessionId) {
  const existing = await pool.query(
    'SELECT * FROM tracked_items WHERE description = $1 AND resolved = 0',
    [description]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    await pool.query(
      'UPDATE tracked_items SET last_seen = $1, session_id = $2 WHERE id = $3',
      [date, sessionId, row.id]
    );
    return row;
  } else {
    const result = await pool.query(
      'INSERT INTO tracked_items (description, first_seen, last_seen, session_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [description, date, date, sessionId]
    );
    return result.rows[0];
  }
}

async function resolveTrackedItem(itemId) {
  await pool.query('UPDATE tracked_items SET resolved = 1 WHERE id = $1', [itemId]);
}

async function getUnresolvedTrackedItems() {
  const result = await pool.query(
    'SELECT * FROM tracked_items WHERE resolved = 0 ORDER BY first_seen ASC'
  );
  return result.rows;
}

// ─── Google Tokens ────────────────────────────────────────────────────────────

async function saveGoogleToken(email, label, accessToken, refreshToken, expiryDate) {
  await pool.query(`
    INSERT INTO google_tokens (account_email, account_label, access_token, refresh_token, expiry_date, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT(account_email) DO UPDATE SET
      account_label = EXCLUDED.account_label,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expiry_date = EXCLUDED.expiry_date,
      updated_at = NOW()
  `, [email, label || null, accessToken, refreshToken, expiryDate || null]);
}

async function getGoogleTokens() {
  const result = await pool.query('SELECT * FROM google_tokens');
  return result.rows;
}

async function updateGoogleAccessToken(email, accessToken, expiryDate) {
  await pool.query(
    'UPDATE google_tokens SET access_token = $1, expiry_date = $2, updated_at = NOW() WHERE account_email = $3',
    [accessToken, expiryDate, email]
  );
}

async function deleteGoogleToken(email) {
  await pool.query('DELETE FROM google_tokens WHERE account_email = $1', [email]);
}

// ─── Life Wheel Scores ────────────────────────────────────────────────────────

const LIFE_WHEEL_CATEGORIES = [
  'Health and Well-being',
  'Career or Work',
  'Finances',
  'Relationships',
  'Personal Growth',
  'Fun and Recreation',
  'Physical Environment',
  'Spirituality or Faith',
  'Contribution and Service',
  'Love and Intimacy',
];

async function saveLifeWheelScores(sessionId, date, phase, scores) {
  const result = await pool.query(
    'INSERT INTO life_wheel_scores (session_id, date, phase, scores) VALUES ($1, $2, $3, $4) RETURNING *',
    [sessionId, date, phase, JSON.stringify(scores)]
  );
  return result.rows[0];
}

async function getLifeWheelScores(daysBack = 30) {
  const result = await pool.query(
    `SELECT * FROM life_wheel_scores
     WHERE date >= NOW() - INTERVAL '${daysBack} days'
     ORDER BY date DESC, phase ASC`
  );
  return result.rows.map((r) => ({ ...r, scores: JSON.parse(r.scores) }));
}

async function getLatestLifeWheelScores(limit = 14) {
  const result = await pool.query(
    'SELECT * FROM life_wheel_scores ORDER BY date DESC, created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows.map((r) => ({ ...r, scores: JSON.parse(r.scores) }));
}

// ─── Aims ─────────────────────────────────────────────────────────────────────

async function getCurrentAim() {
  const result = await pool.query(
    "SELECT * FROM aims WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
  );
  return result.rows[0] || null;
}

async function createAim(heartWish, aimStatement, startDate, endDate, accountabilityPerson) {
  // Deactivate any existing active aim first
  await pool.query("UPDATE aims SET status = 'superseded' WHERE status = 'active'");
  const result = await pool.query(
    `INSERT INTO aims (heart_wish, aim_statement, start_date, end_date, accountability_person)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [heartWish || null, aimStatement, startDate, endDate || null, accountabilityPerson || null]
  );
  return result.rows[0];
}

async function updateAim(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${i++}`);
    values.push(val);
  }
  values.push(id);
  await pool.query(
    `UPDATE aims SET ${sets.join(', ')} WHERE id = $${i}`,
    values
  );
}

async function addAimReflection(aimId, date, reflection, practiceHappened) {
  const result = await pool.query(
    `INSERT INTO aim_reflections (aim_id, date, reflection, practice_happened)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [aimId, date, reflection || null, practiceHappened]
  );
  return result.rows[0];
}

async function getAimReflections(aimId, limit = 30) {
  const result = await pool.query(
    'SELECT * FROM aim_reflections WHERE aim_id = $1 ORDER BY date DESC LIMIT $2',
    [aimId, limit]
  );
  return result.rows;
}

async function getAimHistory(limit = 10) {
  const result = await pool.query(
    'SELECT * FROM aims ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

// ─── Oura Tokens ──────────────────────────────────────────────────────────────

async function saveOuraToken(accessToken, refreshToken, expiryDate) {
  await pool.query('DELETE FROM oura_tokens');
  await pool.query(
    'INSERT INTO oura_tokens (access_token, refresh_token, expiry_date) VALUES ($1, $2, $3)',
    [accessToken, refreshToken, expiryDate || null]
  );
}

async function getOuraToken() {
  const result = await pool.query('SELECT * FROM oura_tokens ORDER BY updated_at DESC LIMIT 1');
  return result.rows[0] || null;
}

async function deleteOuraToken() {
  await pool.query('DELETE FROM oura_tokens');
}

// ─── Orientation ──────────────────────────────────────────────────────────────

async function getOrientation() {
  const result = await pool.query(
    'SELECT * FROM orientation ORDER BY updated_at DESC LIMIT 1'
  );
  return result.rows[0] || null;
}

async function setOrientation(content) {
  await pool.query('DELETE FROM orientation');
  const result = await pool.query(
    'INSERT INTO orientation (content, updated_at) VALUES ($1, NOW()) RETURNING *',
    [content]
  );
  return result.rows[0];
}

module.exports = {
  pool,
  initializeSchema,
  // Sessions
  getTodaySession,
  getSessionById,
  createSession,
  updateSessionStatus,
  saveDashboard,
  saveEveningReview,
  saveSessionSummary,
  getRecentSessions,
  // Messages
  addMessage,
  getSessionMessages,
  // Snapshots
  saveSnapshot,
  getLatestSnapshot,
  // Tracked items
  upsertTrackedItem,
  resolveTrackedItem,
  getUnresolvedTrackedItems,
  // Google tokens
  saveGoogleToken,
  getGoogleTokens,
  updateGoogleAccessToken,
  deleteGoogleToken,
  // Life wheel
  LIFE_WHEEL_CATEGORIES,
  saveLifeWheelScores,
  getLifeWheelScores,
  getLatestLifeWheelScores,
  // Aims
  getCurrentAim,
  createAim,
  updateAim,
  addAimReflection,
  getAimReflections,
  getAimHistory,
  // Oura tokens
  saveOuraToken,
  getOuraToken,
  deleteOuraToken,
  // Orientation
  getOrientation,
  setOrientation,
};

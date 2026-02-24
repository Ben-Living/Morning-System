const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'morning.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'checkin',
    dashboard TEXT,
    evening_review TEXT,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    active_note TEXT,
    reminders TEXT
  );

  CREATE TABLE IF NOT EXISTS tracked_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    resolved INTEGER DEFAULT 0,
    session_id INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS google_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_email TEXT NOT NULL UNIQUE,
    account_label TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expiry_date INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Sessions
function getTodaySession(dateStr) {
  return db.prepare('SELECT * FROM sessions WHERE date = ?').get(dateStr);
}

function createSession(dateStr) {
  const result = db.prepare(
    'INSERT OR IGNORE INTO sessions (date, status) VALUES (?, ?)'
  ).run(dateStr, 'checkin');
  return db.prepare('SELECT * FROM sessions WHERE date = ?').get(dateStr);
}

function updateSessionStatus(sessionId, status) {
  db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, sessionId);
}

function saveDashboard(sessionId, dashboardText) {
  db.prepare('UPDATE sessions SET dashboard = ?, status = ? WHERE id = ?')
    .run(dashboardText, 'dashboard', sessionId);
}

function saveEveningReview(sessionId, reviewText) {
  db.prepare('UPDATE sessions SET evening_review = ?, status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(reviewText, 'complete', sessionId);
}

function saveSessionSummary(sessionId, summary) {
  db.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run(summary, sessionId);
}

function getRecentSessions(limit = 7) {
  return db.prepare(
    'SELECT * FROM sessions ORDER BY date DESC LIMIT ?'
  ).all(limit);
}

// Messages
function addMessage(sessionId, role, content) {
  return db.prepare(
    'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)'
  ).run(sessionId, role, content);
}

function getSessionMessages(sessionId) {
  return db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId);
}

// Snapshots
function saveSnapshot(notes, activeNote, reminders) {
  return db.prepare(
    'INSERT INTO snapshots (notes, active_note, reminders) VALUES (?, ?, ?)'
  ).run(
    JSON.stringify(notes),
    activeNote || null,
    JSON.stringify(reminders)
  );
}

function getLatestSnapshot() {
  return db.prepare(
    'SELECT * FROM snapshots ORDER BY received_at DESC LIMIT 1'
  ).get();
}

// Tracked items
function upsertTrackedItem(description, date, sessionId) {
  const existing = db.prepare(
    'SELECT * FROM tracked_items WHERE description = ? AND resolved = 0'
  ).get(description);

  if (existing) {
    db.prepare(
      'UPDATE tracked_items SET last_seen = ?, session_id = ? WHERE id = ?'
    ).run(date, sessionId, existing.id);
    return existing;
  } else {
    const result = db.prepare(
      'INSERT INTO tracked_items (description, first_seen, last_seen, session_id) VALUES (?, ?, ?, ?)'
    ).run(description, date, date, sessionId);
    return db.prepare('SELECT * FROM tracked_items WHERE id = ?').get(result.lastInsertRowid);
  }
}

function resolveTrackedItem(itemId) {
  db.prepare('UPDATE tracked_items SET resolved = 1 WHERE id = ?').run(itemId);
}

function getUnresolvedTrackedItems() {
  return db.prepare(
    'SELECT * FROM tracked_items WHERE resolved = 0 ORDER BY first_seen ASC'
  ).all();
}

// Google tokens
function saveGoogleToken(email, label, accessToken, refreshToken, expiryDate) {
  db.prepare(`
    INSERT INTO google_tokens (account_email, account_label, access_token, refresh_token, expiry_date, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(account_email) DO UPDATE SET
      account_label = excluded.account_label,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expiry_date = excluded.expiry_date,
      updated_at = CURRENT_TIMESTAMP
  `).run(email, label || null, accessToken, refreshToken, expiryDate || null);
}

function getGoogleTokens() {
  return db.prepare('SELECT * FROM google_tokens').all();
}

function updateGoogleAccessToken(email, accessToken, expiryDate) {
  db.prepare(
    'UPDATE google_tokens SET access_token = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP WHERE account_email = ?'
  ).run(accessToken, expiryDate, email);
}

function deleteGoogleToken(email) {
  db.prepare('DELETE FROM google_tokens WHERE account_email = ?').run(email);
}

module.exports = {
  db,
  getTodaySession,
  createSession,
  updateSessionStatus,
  saveDashboard,
  saveEveningReview,
  saveSessionSummary,
  getRecentSessions,
  addMessage,
  getSessionMessages,
  saveSnapshot,
  getLatestSnapshot,
  upsertTrackedItem,
  resolveTrackedItem,
  getUnresolvedTrackedItems,
  saveGoogleToken,
  getGoogleTokens,
  updateGoogleAccessToken,
  deleteGoogleToken,
};

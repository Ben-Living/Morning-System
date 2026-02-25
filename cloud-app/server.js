require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { DateTime } = require('luxon');
const { google } = require('googleapis');

const db = require('./src/database');
const gmail = require('./src/gmail');
const calendar = require('./src/calendar');
const claude = require('./src/claude');

const app = express();
const NZ_TZ = 'Pacific/Auckland';

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true, credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'morning-system-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
);

// Mac agent auth middleware
function requireAgentAuth(req, res, next) {
  const token = req.headers['x-agent-secret'];
  if (!token || token !== process.env.AGENT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getNZDateStr() {
  return DateTime.now().setZone(NZ_TZ).toISODate();
}

async function buildContext(dateStr) {
  const [calEvents, emailData, snapshot, trackedItems] = await Promise.all([
    calendar.fetchAllAccountsEvents(dateStr),
    gmail.fetchAllAccountsEmails(),
    Promise.resolve(db.getLatestSnapshot()),
    Promise.resolve(db.getUnresolvedTrackedItems()),
  ]);

  // Get previous session summary
  const recent = db.getRecentSessions(7);
  const previousSession = recent.find((s) => s.date < dateStr && s.summary);
  const previousSummary = previousSession ? previousSession.summary : null;

  const contextBlock = claude.buildContextBlock({
    dateStr,
    events: calEvents,
    emails: emailData.emails,
    snapshot,
    trackedItems,
    previousSummary,
  });

  return { contextBlock, calEvents, emails: emailData.emails, snapshot, trackedItems };
}

// ─── Routes: Static & Auth ────────────────────────────────────────────────────

// Serve app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initiate Google OAuth
app.get('/auth/google', (req, res) => {
  const label = req.query.label || '';
  const url = gmail.getAuthUrl(label);
  res.redirect(url);
});

// OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const { tokens, email } = await gmail.exchangeCodeForTokens(code);
    db.saveGoogleToken(
      email,
      state || null,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date
    );
    res.redirect(`/?connected=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?error=oauth_failed');
  }
});

// List connected accounts
app.get('/api/accounts', (req, res) => {
  const tokens = db.getGoogleTokens();
  res.json({
    accounts: tokens.map((t) => ({
      email: t.account_email,
      label: t.account_label,
      connected_at: t.updated_at,
    })),
  });
});

// Disconnect an account
app.delete('/api/accounts/:email', (req, res) => {
  db.deleteGoogleToken(req.params.email);
  res.json({ ok: true });
});

// ─── Routes: Session ──────────────────────────────────────────────────────────

// Get or create today's session
app.get('/api/session/today', (req, res) => {
  const dateStr = getNZDateStr();
  let session = db.getTodaySession(dateStr);
  if (!session) {
    session = db.createSession(dateStr);
  }
  const messages = db.getSessionMessages(session.id);
  res.json({ session, messages });
});

// Get session by date
app.get('/api/session/:date', (req, res) => {
  const session = db.getTodaySession(req.params.date);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const messages = db.getSessionMessages(session.id);
  res.json({ session, messages });
});

// ─── Routes: Context ──────────────────────────────────────────────────────────

app.get('/api/context', async (req, res) => {
  const dateStr = getNZDateStr();
  try {
    const ctx = await buildContext(dateStr);
    res.json({
      dateStr,
      calEvents: ctx.calEvents,
      emails: ctx.emails,
      snapshot: ctx.snapshot ? {
        received_at: ctx.snapshot.received_at,
        active_note: ctx.snapshot.active_note,
        reminder_count: JSON.parse(ctx.snapshot.reminders || '[]').length,
        note_count: JSON.parse(ctx.snapshot.notes || '[]').length,
      } : null,
      trackedItems: ctx.trackedItems,
    });
  } catch (err) {
    console.error('Context error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Routes: Chat (SSE streaming) ─────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId required' });
  }

  const sessionRow = db.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  // Save user message
  db.addMessage(sessionId, 'user', message);

  // Build context
  const { contextBlock } = await buildContext(sessionRow.date);

  // Get conversation history (exclude the message just saved)
  const allMessages = db.getSessionMessages(sessionId);
  const historyMessages = allMessages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  historyMessages.push({ role: 'user', content: message });

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fullResponse = '';

  try {
    for await (const chunk of claude.streamChat({
      messages: historyMessages,
      contextBlock,
    })) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    // Save assistant response
    db.addMessage(sessionId, 'assistant', fullResponse);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('Chat stream error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── Routes: Opening (first assistant message) ────────────────────────────────

app.post('/api/session/open', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const sessionRow = db.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  // Only open if no messages yet
  const existing = db.getSessionMessages(sessionId);
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Session already has messages' });
  }

  const { contextBlock } = await buildContext(sessionRow.date);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fullResponse = '';

  try {
    for await (const chunk of claude.streamChat({ messages: [], contextBlock })) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    db.addMessage(sessionId, 'assistant', fullResponse);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('Open session error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── Routes: Dashboard ────────────────────────────────────────────────────────

app.post('/api/dashboard/generate', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const sessionRow = db.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  // Return cached if already generated
  if (sessionRow.dashboard) {
    return res.json({ dashboard: sessionRow.dashboard, cached: true });
  }

  const { contextBlock } = await buildContext(sessionRow.date);
  const messages = db.getSessionMessages(sessionId).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const dashboard = await claude.generateDashboard({
      conversationMessages: messages,
      contextBlock,
    });
    db.saveDashboard(sessionId, dashboard);
    res.json({ dashboard, cached: false });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Routes: Evening Review ───────────────────────────────────────────────────

app.post('/api/evening/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const sessionRow = db.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  // Mark session as evening_review if it isn't already
  if (sessionRow.status === 'dashboard' || sessionRow.status === 'checkin') {
    db.updateSessionStatus(sessionId, 'evening_review');
  }

  if (message) {
    db.addMessage(sessionId, 'user', message);
  }

  const { contextBlock } = await buildContext(sessionRow.date);
  const allMessages = db.getSessionMessages(sessionId);

  // Split morning vs evening messages (morning = before status change to evening_review)
  // Simple approach: use all messages
  const conversationMessages = allMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fullResponse = '';

  try {
    for await (const chunk of claude.streamEveningReview({
      conversationMessages: message ? conversationMessages : [],
      contextBlock,
      morningMessages: message ? [] : conversationMessages,
    })) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }

    db.addMessage(sessionId, 'assistant', fullResponse);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('Evening chat error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// Generate end-of-day summary and mark session complete
app.post('/api/evening/complete', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const sessionRow = db.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  const { contextBlock } = await buildContext(sessionRow.date);
  const allMessages = db.getSessionMessages(sessionId).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const summary = await claude.generateDaySummary({
      allMessages,
      contextBlock,
      dateStr: sessionRow.date,
    });
    db.saveSessionSummary(sessionId, summary);
    db.saveEveningReview(sessionId, summary);
    res.json({ summary });
  } catch (err) {
    console.error('Evening complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Routes: Mac Agent Snapshot ───────────────────────────────────────────────

app.post('/api/snapshot', requireAgentAuth, (req, res) => {
  const { notes, active_note, reminders } = req.body;

  if (!Array.isArray(notes) || !Array.isArray(reminders)) {
    return res.status(400).json({ error: 'notes and reminders must be arrays' });
  }

  db.saveSnapshot(notes, active_note || null, reminders);
  console.log(`Snapshot received: ${notes.length} notes, ${reminders.length} reminders`);
  res.json({ ok: true, received_at: new Date().toISOString() });
});

// Get latest snapshot info
app.get('/api/snapshot/status', (req, res) => {
  const snapshot = db.getLatestSnapshot();
  if (!snapshot) return res.json({ available: false });

  const ageMs = Date.now() - new Date(snapshot.received_at.replace(' ', 'T') + 'Z').getTime();
  res.json({
    available: true,
    received_at: snapshot.received_at,
    age_minutes: Math.round(ageMs / 60000),
    note_count: JSON.parse(snapshot.notes || '[]').length,
    reminder_count: JSON.parse(snapshot.reminders || '[]').length,
  });
});

// ─── Routes: Tracked Items ────────────────────────────────────────────────────

app.get('/api/tracked-items', (req, res) => {
  res.json({ items: db.getUnresolvedTrackedItems() });
});

app.post('/api/tracked-items', (req, res) => {
  const { description, sessionId } = req.body;
  if (!description) return res.status(400).json({ error: 'description required' });
  const dateStr = getNZDateStr();
  const item = db.upsertTrackedItem(description, dateStr, sessionId);
  res.json({ item });
});

app.patch('/api/tracked-items/:id/resolve', (req, res) => {
  db.resolveTrackedItem(req.params.id);
  res.json({ ok: true });
});

// ─── Routes: Health ───────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    time: DateTime.now().setZone(NZ_TZ).toISO(),
    date_nz: getNZDateStr(),
    accounts_connected: db.getGoogleTokens().length,
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Morning System running on port ${PORT}`);
  console.log(`NZ date: ${getNZDateStr()}`);
  console.log(`Google accounts connected: ${db.getGoogleTokens().length}`);
});

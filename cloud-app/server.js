require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { DateTime } = require('luxon');

const db = require('./src/database');
const gmail = require('./src/gmail');
const calendar = require('./src/calendar');
const claude = require('./src/claude');
const oura = require('./src/oura');

const app = express();
const NZ_TZ = 'Pacific/Auckland';

const INITIAL_ORIENTATION = `I want to build a stable foundation for health, fitness and wellness in my life in a way that is relational and supportive of our family life.

I want to challenge the notion that I or the world around me is wrong, and learn to love and accept the world and myself as they are.

I want to engage in my day and my life with curiosity and energy, following my passion and vitality in ways that are creative and fulfilling, and mutually generative for my relationships.`;

// ─── Middleware ────────────────────────────────────────────────────────────────

// Trust reverse proxy (fixes req.protocol under HTTPS load balancer/ngrok/Railway etc.)
app.set('trust proxy', 1);

app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true, credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'daily-orientation-dev-secret',
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
  const [calEvents, emailData, snapshot, trackedItems, lifeWheelScores, currentAim, orientationRow, ouraData] = await Promise.all([
    calendar.fetchAllAccountsEvents(dateStr),
    gmail.fetchAllAccountsEmails(),
    db.getLatestSnapshot(),
    db.getUnresolvedTrackedItems(),
    db.getLatestLifeWheelScores(14),
    db.getCurrentAim(),
    db.getOrientation(),
    oura.fetchOuraData(dateStr),
  ]);

  const recent = await db.getRecentSessions(7);
  const previousSession = recent.find((s) => s.date < dateStr && s.summary);
  const previousSummary = previousSession ? previousSession.summary : null;

  let needsAimFormation = false;
  if (!currentAim) {
    needsAimFormation = true;
  } else if (currentAim.end_date && currentAim.end_date < dateStr) {
    needsAimFormation = true;
  } else if (currentAim.start_date) {
    const aimAge = DateTime.fromISO(dateStr).diff(DateTime.fromISO(currentAim.start_date), 'days').days;
    if (aimAge > 14) needsAimFormation = true;
  }

  const contextBlock = claude.buildContextBlock({
    dateStr,
    events: calEvents,
    emails: emailData.emails,
    starredEmails: emailData.starredEmails,
    snapshot,
    trackedItems,
    previousSummary,
    lifeWheelScores,
    currentAim,
    needsAimFormation,
    orientation: orientationRow ? orientationRow.content : null,
    ouraData,
  });

  return { contextBlock, calEvents, emails: emailData.emails, starredEmails: emailData.starredEmails, snapshot, trackedItems, ouraData };
}

// ─── Routes: Static & Auth ────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/auth/google', (req, res) => {
  const label = req.query.label || '';
  const url = gmail.getAuthUrl(label);
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const { tokens, email } = await gmail.exchangeCodeForTokens(code);
    await db.saveGoogleToken(
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

app.get('/api/accounts', async (req, res) => {
  const tokens = await db.getGoogleTokens();
  res.json({
    accounts: tokens.map((t) => ({
      email: t.account_email,
      label: t.account_label,
      connected_at: t.updated_at,
    })),
  });
});

app.delete('/api/accounts/:email', async (req, res) => {
  await db.deleteGoogleToken(req.params.email);
  res.json({ ok: true });
});

// ─── Routes: Oura OAuth ───────────────────────────────────────────────────────

app.get('/auth/oura', (req, res) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/oura/callback`;
  console.log('[Oura] Starting OAuth, redirect_uri:', redirectUri);
  res.redirect(oura.getAuthUrl(redirectUri));
});

app.get('/auth/oura/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    console.error('[Oura] OAuth denied by user or provider:', error);
    return res.redirect('/?error=oura_denied');
  }
  if (!code) return res.redirect('/?error=no_code');

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/oura/callback`;
    console.log('[Oura] Exchanging code, redirect_uri:', redirectUri);
    const tokens = await oura.exchangeCodeForTokens(code, redirectUri);
    const expiryDate = Date.now() + (tokens.expires_in || 86400) * 1000;
    await db.saveOuraToken(tokens.access_token, tokens.refresh_token || null, expiryDate);
    console.log('[Oura] Token saved, expires_in:', tokens.expires_in);
    res.redirect('/?oura_connected=true');
  } catch (err) {
    console.error('[Oura] OAuth callback error:', err.message);
    res.redirect(`/?error=oura_failed&detail=${encodeURIComponent(err.message.slice(0, 120))}`);
  }
});

app.get('/api/oura/status', async (req, res) => {
  try {
    const connected = await oura.isConnected();
    res.json({ connected });
  } catch {
    res.json({ connected: false });
  }
});

// Diagnostic: shows token metadata + attempts a live data fetch (do not expose publicly)
app.get('/api/oura/debug', async (req, res) => {
  try {
    const tokenRow = await db.getOuraToken();
    if (!tokenRow) return res.json({ connected: false, message: 'No token stored' });

    const now = Date.now();
    const expiresIn = tokenRow.expiry_date ? Math.round((Number(tokenRow.expiry_date) - now) / 1000) : null;
    const dateStr = getNZDateStr();

    let fetchResult = null;
    try {
      fetchResult = await oura.fetchOuraData(dateStr);
    } catch (e) {
      fetchResult = { error: e.message };
    }

    res.json({
      connected: true,
      tokenStored: true,
      expiresInSeconds: expiresIn,
      expired: expiresIn !== null && expiresIn < 0,
      dateQueried: dateStr,
      data: fetchResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/oura', async (req, res) => {
  await db.deleteOuraToken();
  res.json({ ok: true });
});

// ─── Routes: Session ──────────────────────────────────────────────────────────

app.get('/api/session/today', async (req, res) => {
  const dateStr = getNZDateStr();
  const nzNow = DateTime.now().setZone(NZ_TZ);
  let session = await db.getTodaySession(dateStr);
  if (!session) {
    session = await db.createSession(dateStr);
  }
  const messages = await db.getSessionMessages(session.id);
  res.json({ session, messages, nzHour: nzNow.hour, nzMinute: nzNow.minute });
});

app.get('/api/session/:date', async (req, res) => {
  const session = await db.getTodaySession(req.params.date);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const messages = await db.getSessionMessages(session.id);
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
      starredEmails: ctx.starredEmails,
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

// ─── Routes: Chat (Morning Check-In, SSE streaming) ───────────────────────────

app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ error: 'message and sessionId required' });
  }

  const sessionRow = await db.getSessionById(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  await db.addMessage(sessionId, 'user', message);

  const { contextBlock } = await buildContext(sessionRow.date);

  const allMessages = await db.getSessionMessages(sessionId);
  const historyMessages = allMessages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  historyMessages.push({ role: 'user', content: message });

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

    await db.addMessage(sessionId, 'assistant', fullResponse);
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

  const sessionRow = await db.getSessionById(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  const existing = await db.getSessionMessages(sessionId);
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

    await db.addMessage(sessionId, 'assistant', fullResponse);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('Open session error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── Routes: Midday Chat (SSE streaming, ephemeral) ───────────────────────────

app.post('/api/midday/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const dateStr = getNZDateStr();
  const { contextBlock } = await buildContext(dateStr);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const chunk of claude.streamMiddayChat({
      message,
      history: Array.isArray(history) ? history : [],
      contextBlock,
    })) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('Midday chat error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── Routes: Reflect Chat (SSE streaming, ephemeral) ─────────────────────────

app.post('/api/reflect/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const dateStr = getNZDateStr();
  const { contextBlock } = await buildContext(dateStr);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const chunk of claude.streamReflectChat({
      message,
      history: Array.isArray(history) ? history : [],
      contextBlock,
    })) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('Reflect chat error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── Routes: Dashboard ────────────────────────────────────────────────────────

app.post('/api/dashboard/generate', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const sessionRow = await db.getSessionById(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  if (sessionRow.dashboard) {
    return res.json({ dashboard: sessionRow.dashboard, cached: true });
  }

  const { contextBlock } = await buildContext(sessionRow.date);
  const messages = (await db.getSessionMessages(sessionId)).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const dashboard = await claude.generateDashboard({
      conversationMessages: messages,
      contextBlock,
    });
    await db.saveDashboard(sessionId, dashboard);
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

  const sessionRow = await db.getSessionById(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  if (sessionRow.status === 'dashboard' || sessionRow.status === 'checkin') {
    await db.updateSessionStatus(sessionId, 'evening_review');
  }

  if (message) {
    await db.addMessage(sessionId, 'user', message);
  }

  const { contextBlock } = await buildContext(sessionRow.date);
  const allMessages = await db.getSessionMessages(sessionId);

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

    await db.addMessage(sessionId, 'assistant', fullResponse);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error('Evening chat error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

app.post('/api/evening/complete', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const sessionRow = await db.getSessionById(sessionId);
  if (!sessionRow) return res.status(404).json({ error: 'Session not found' });

  const { contextBlock } = await buildContext(sessionRow.date);
  const allMessages = (await db.getSessionMessages(sessionId)).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const summary = await claude.generateDaySummary({
      allMessages,
      contextBlock,
      dateStr: sessionRow.date,
    });
    await db.saveSessionSummary(sessionId, summary);
    await db.saveEveningReview(sessionId, summary);
    res.json({ summary });
  } catch (err) {
    console.error('Evening complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Routes: Orientation ──────────────────────────────────────────────────────

app.get('/api/orientation', async (req, res) => {
  try {
    const row = await db.getOrientation();
    res.json({ content: row ? row.content : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orientation', async (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content required' });
  }
  try {
    const row = await db.setOrientation(content);
    res.json({ ok: true, updated_at: row.updated_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Routes: Mac Agent Snapshot ───────────────────────────────────────────────

app.post('/api/snapshot', requireAgentAuth, async (req, res) => {
  const { notes, active_note, reminders } = req.body;

  if (!Array.isArray(notes) || !Array.isArray(reminders)) {
    return res.status(400).json({ error: 'notes and reminders must be arrays' });
  }

  await db.saveSnapshot(notes, active_note || null, reminders);
  console.log(`Snapshot received: ${notes.length} notes, ${reminders.length} reminders`);
  res.json({ ok: true, received_at: new Date().toISOString() });
});

app.get('/api/snapshot/status', async (req, res) => {
  const snapshot = await db.getLatestSnapshot();
  if (!snapshot) return res.json({ available: false });

  const ageMs = Date.now() - new Date(snapshot.received_at).getTime();
  res.json({
    available: true,
    received_at: snapshot.received_at,
    age_minutes: Math.round(ageMs / 60000),
    note_count: JSON.parse(snapshot.notes || '[]').length,
    reminder_count: JSON.parse(snapshot.reminders || '[]').length,
  });
});

// ─── Routes: Export ───────────────────────────────────────────────────────────

app.get('/api/export/today', async (req, res) => {
  const dateStr = getNZDateStr();

  try {
    const session = await db.getTodaySession(dateStr);
    if (!session || session.status !== 'complete' || !session.summary) {
      return res.status(404).json({ error: 'No completed session for today' });
    }

    const [scores, aim] = await Promise.all([
      db.getLifeWheelScores(1),
      db.getCurrentAim(),
    ]);

    // Find today's scores (prefer morning)
    const todayScores = scores.filter((s) => s.date === dateStr);
    const scoreEntry = todayScores.find((s) => s.phase === 'morning') || todayScores[0];

    const SCORE_SHORT = {
      'Health and Well-being': 'Health',
      'Career or Work': 'Work',
      'Finances': 'Finances',
      'Relationships': 'Relationships',
      'Personal Growth': 'Personal Growth',
      'Fun and Recreation': 'Fun',
      'Physical Environment': 'Environment',
      'Spirituality or Faith': 'Spirituality',
      'Contribution and Service': 'Contribution',
      'Love and Intimacy': 'Love',
    };

    let scoresLine = 'SCORES: (not recorded)';
    if (scoreEntry) {
      const parts = Object.entries(SCORE_SHORT).map(
        ([full, short]) => `${short} ${scoreEntry.scores[full] ?? '?'}`
      );
      scoresLine = `SCORES: ${parts.join(', ')}`;
    }

    const aimLine = aim ? `AIM: ${aim.aim_statement}` : 'AIM: (none)';
    const summaryLine = `SUMMARY: ${session.summary}`;

    const output = `=== ${dateStr} ===\n${scoresLine}\n${aimLine}\n${summaryLine}\n---\n`;

    res.set('Content-Type', 'text/plain');
    res.send(output);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Routes: Tracked Items ────────────────────────────────────────────────────

app.get('/api/tracked-items', async (req, res) => {
  res.json({ items: await db.getUnresolvedTrackedItems() });
});

app.post('/api/tracked-items', async (req, res) => {
  const { description, sessionId } = req.body;
  if (!description) return res.status(400).json({ error: 'description required' });
  const dateStr = getNZDateStr();
  const item = await db.upsertTrackedItem(description, dateStr, sessionId);
  res.json({ item });
});

app.patch('/api/tracked-items/:id/resolve', async (req, res) => {
  await db.resolveTrackedItem(req.params.id);
  res.json({ ok: true });
});

// ─── Routes: Life Wheel Scores ────────────────────────────────────────────────

app.post('/api/scores', async (req, res) => {
  const { sessionId, phase, scores } = req.body;
  if (!phase || !scores || typeof scores !== 'object') {
    return res.status(400).json({ error: 'phase and scores required' });
  }

  const dateStr = getNZDateStr();

  try {
    const entry = await db.saveLifeWheelScores(sessionId || null, dateStr, phase, scores);
    res.json({ ok: true, entry });
  } catch (err) {
    console.error('Scores save error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scores', async (req, res) => {
  const daysBack = parseInt(req.query.days || '30', 10);
  try {
    const scores = await db.getLifeWheelScores(daysBack);
    res.json({ scores, categories: db.LIFE_WHEEL_CATEGORIES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Routes: Aims ─────────────────────────────────────────────────────────────

app.get('/api/aims/current', async (req, res) => {
  try {
    const aim = await db.getCurrentAim();
    res.json({ aim });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/aims', async (req, res) => {
  try {
    const aims = await db.getAimHistory(10);
    res.json({ aims });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/aims', async (req, res) => {
  const { heart_wish, aim_statement, start_date, end_date, accountability_person } = req.body;
  if (!aim_statement) {
    return res.status(400).json({ error: 'aim_statement required' });
  }
  const dateStr = getNZDateStr();

  try {
    const aim = await db.createAim(
      heart_wish || null,
      aim_statement,
      start_date || dateStr,
      end_date || null,
      accountability_person || null
    );
    res.json({ ok: true, aim });
  } catch (err) {
    console.error('Aim create error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/aims/:id', async (req, res) => {
  const { heart_wish, aim_statement, end_date, accountability_person, status } = req.body;
  const fields = {};
  if (heart_wish !== undefined) fields.heart_wish = heart_wish;
  if (aim_statement !== undefined) fields.aim_statement = aim_statement;
  if (end_date !== undefined) fields.end_date = end_date;
  if (accountability_person !== undefined) fields.accountability_person = accountability_person;
  if (status !== undefined) fields.status = status;

  try {
    await db.updateAim(req.params.id, fields);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/aims/:id/reflect', async (req, res) => {
  const { reflection, practice_happened } = req.body;
  const dateStr = getNZDateStr();

  try {
    const entry = await db.addAimReflection(
      req.params.id,
      dateStr,
      reflection || null,
      practice_happened === true || practice_happened === 'true'
    );
    res.json({ ok: true, entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/aims/:id/reflections', async (req, res) => {
  try {
    const reflections = await db.getAimReflections(req.params.id, 30);
    res.json({ reflections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Routes: Health ───────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  const tokens = await db.getGoogleTokens();
  res.json({
    ok: true,
    time: DateTime.now().setZone(NZ_TZ).toISO(),
    date_nz: getNZDateStr(),
    accounts_connected: tokens.length,
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

db.initializeSchema()
  .then(async () => {
    console.log('Database schema ready');
    // Seed orientation if empty
    const existing = await db.getOrientation();
    if (!existing) {
      await db.setOrientation(INITIAL_ORIENTATION);
      console.log('Orientation document seeded');
    }
    app.listen(PORT, () => {
      console.log(`Daily Orientation running on port ${PORT}`);
      console.log(`NZ date: ${getNZDateStr()}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise database schema:', err);
    process.exit(1);
  });

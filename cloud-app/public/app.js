/* ── Daily Orientation — Browser App ─────────────────────────────────────── */

// Simple markdown renderer (no external dependency)
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, (match) => `<ul>${match}</ul>`);

  const blockTags = /^(<h[1-6]|<ul|<ol|<li|<hr|<blockquote|<\/ul|<\/ol)/;
  html = html
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return '';
      if (blockTags.test(line.trim())) return line;
      return `<p>${line}</p>`;
    })
    .join('\n');

  return html;
}

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  sessionId: null,
  sessionDate: null,
  sessionStatus: null,
  primaryView: 'checkin',     // 'checkin' | 'dashboard'
  secondaryOpen: false,
  currentSecondary: 'evening', // 'evening' | 'midday' | 'reflect'
  nzHour: 0,
  nzMinute: 0,
  isStreaming: false,
  dashboardGenerated: false,
  eveningStarted: false,
  checkinStartTime: null,
  timerNudgeShown: false,
  middayHistory: [],
  reflectHistory: [],
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const els = {
  headerDate: $('header-date'),
  checkinStatus: $('checkin-status'),
  // Primary views
  primaryCheckin: $('primary-checkin'),
  primaryDashboard: $('primary-dashboard'),
  // Check-in
  messages: $('messages'),
  chatInput: $('chat-input'),
  sendBtn: $('send-btn'),
  genDashBtn: $('gen-dashboard-btn'),
  quickModeBtn: $('quick-mode-btn'),
  checkinInputArea: $('checkin-input-area'),
  // Dashboard
  dashContent: $('dashboard-content'),
  eveningPrompt: $('evening-prompt'),
  eveningPromptBtn: $('evening-prompt-btn'),
  // More bar
  moreBtn: $('more-btn'),
  // Secondary panel
  secondaryPanel: $('secondary-panel'),
  secondaryOverlay: $('secondary-overlay'),
  closeSecondaryBtn: $('close-secondary-btn'),
  // Evening
  eveningMessages: $('evening-messages'),
  eveningInput: $('evening-input'),
  eveningSendBtn: $('evening-send-btn'),
  completeDayBtn: $('complete-day-btn'),
  // Midday
  middayMessages: $('midday-messages'),
  middayInput: $('midday-input'),
  middaySendBtn: $('midday-send-btn'),
  // Reflect
  reflectMessages: $('reflect-messages'),
  reflectInput: $('reflect-input'),
  reflectSendBtn: $('reflect-send-btn'),
  orientationDisplay: $('orientation-display'),
  orientationEditor: $('orientation-editor'),
  orientationTextarea: $('orientation-textarea'),
  orientationEditBtn: $('orientation-edit-btn'),
  orientationSaveBtn: $('orientation-save-btn'),
  orientationCancelBtn: $('orientation-cancel-btn'),
  // Settings
  menuBtn: $('menu-btn'),
  settingsPanel: $('settings-panel'),
  settingsOverlay: $('settings-overlay'),
  closeSettings: $('close-settings'),
  accountsList: $('accounts-list'),
  connectGoogleBtn: $('connect-google-btn'),
  accountLabel: $('account-label'),
  agentStatus: $('agent-status'),
  ouraStatus: $('oura-status'),
  ouraConnectRow: $('oura-connect-row'),
  trackedItemsList: $('tracked-items-list'),
  newTrackedItem: $('new-tracked-item'),
  addTrackedBtn: $('add-tracked-btn'),
  loading: $('loading'),
};

// ── Life wheel categories ──────────────────────────────────────────────────

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

// ── API helpers ────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function get(path) { return api('GET', path); }
function post(path, body) { return api('POST', path, body); }
function put(path, body) { return api('PUT', path, body); }
function del(path) { return api('DELETE', path); }
function patch(path, body) { return api('PATCH', path, body); }

// ── Session ────────────────────────────────────────────────────────────────

async function loadSession() {
  showLoading(true);
  try {
    const { session, messages, nzHour, nzMinute } = await get('/api/session/today');
    state.sessionId = session.id;
    state.sessionDate = session.date;
    state.sessionStatus = session.status;
    state.nzHour = nzHour || 0;
    state.nzMinute = nzMinute || 0;

    // Format and display the date
    const [year, month, day] = session.date.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    els.headerDate.textContent = d.toLocaleDateString('en-NZ', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

    if (messages.length > 0) {
      messages.forEach((m) => appendMessage(m.role, m.content, false));
      scrollToBottom(els.messages);
    }

    if (session.dashboard) {
      state.dashboardGenerated = true;
      renderDashboard(session.dashboard);
    }

    // Context-aware view
    applyContextView(session, messages);

    const params = new URLSearchParams(window.location.search);
    if (params.has('connected')) {
      showStatus(`Connected ${decodeURIComponent(params.get('connected'))}`, false);
      window.history.replaceState({}, '', '/');
    }
    if (params.has('oura_connected')) {
      showStatus('Oura Ring connected.', false);
      window.history.replaceState({}, '', '/');
    }
    if (params.has('error')) {
      showStatus('Connection failed — please try again', true);
      window.history.replaceState({}, '', '/');
    }

    await checkSnapshotStatus();
  } catch (err) {
    console.error('Session load error:', err);
    showStatus('Could not load session. Check server connection.', true);
  } finally {
    showLoading(false);
  }
}

// ── Context-aware display ──────────────────────────────────────────────────

function applyContextView(session, messages) {
  const checkinDone = ['dashboard', 'evening_review', 'complete'].includes(session.status);
  const isComplete = session.status === 'complete';
  const after11AM = state.nzHour >= 11;
  const after330PM = state.nzHour > 15 || (state.nzHour === 15 && state.nzMinute >= 30);

  if (!checkinDone) {
    showPrimaryView('checkin');
    if (messages.length === 0) {
      if (after11AM) {
        showMissedCheckinPrompt();
      } else {
        showCheckinGate();
      }
    }
    // If has messages but no dashboard — check-in is in progress, input area already visible
  } else {
    showPrimaryView('dashboard');
    renderCheckinDoneState();
    if (!isComplete && after330PM) {
      showEveningPromptBanner();
    }
  }
}

function showPrimaryView(which) {
  state.primaryView = which;
  els.primaryCheckin.classList.toggle('hidden', which !== 'checkin');
  els.primaryDashboard.classList.toggle('hidden', which !== 'dashboard');
}

function showEveningPromptBanner() {
  els.eveningPrompt.classList.remove('hidden');
}

// ── Check-in gate ──────────────────────────────────────────────────────────

function showMissedCheckinPrompt() {
  const promptEl = document.createElement('div');
  promptEl.className = 'missed-checkin-prompt';
  promptEl.textContent = "I notice we missed the morning check-in. Want to do a quick one?";
  els.messages.appendChild(promptEl);
  showCheckinGate();
}

function showCheckinGate() {
  const gateEl = document.createElement('div');
  gateEl.id = 'checkin-gate';
  gateEl.className = 'checkin-gate';
  gateEl.innerHTML = `
    <p class="gate-question">Ready to begin?</p>
    <div class="gate-actions">
      <button class="btn-primary" id="gate-yes-btn">Yes</button>
      <button class="btn-secondary" id="gate-not-yet-btn">Not yet</button>
    </div>
  `;
  els.messages.appendChild(gateEl);

  $('gate-yes-btn').addEventListener('click', () => {
    gateEl.remove();
    showPulseCheck();
  });
}

// ── Morning pulse check ────────────────────────────────────────────────────

function showPulseCheck() {
  const pulseEl = document.createElement('div');
  pulseEl.id = 'pulse-check';
  pulseEl.className = 'pulse-check';

  const slidersHtml = LIFE_WHEEL_CATEGORIES.map((cat) => `
    <div class="pulse-row">
      <label class="pulse-label">${escapeHtml(cat)}</label>
      <div class="pulse-input-group">
        <input type="range" min="1" max="10" value="5" class="score-range" data-category="${escapeHtml(cat)}" />
        <span class="score-value">5</span>
      </div>
    </div>
  `).join('');

  pulseEl.innerHTML = `
    <p class="pulse-intro">How are these areas feeling right now?</p>
    <div class="pulse-sliders">${slidersHtml}</div>
    <div class="pulse-actions">
      <button class="btn-primary" id="pulse-save-btn">Save &amp; begin</button>
      <button class="btn-secondary" id="pulse-skip-btn">Skip</button>
    </div>
  `;

  els.messages.appendChild(pulseEl);
  scrollToBottom(els.messages);

  pulseEl.querySelectorAll('.score-range').forEach((input) => {
    const valEl = input.parentElement.querySelector('.score-value');
    input.addEventListener('input', () => {
      valEl.textContent = input.value;
    });
  });

  $('pulse-save-btn').addEventListener('click', async () => {
    const scores = {};
    pulseEl.querySelectorAll('.score-range').forEach((input) => {
      scores[input.dataset.category] = parseInt(input.value, 10);
    });
    try {
      await post('/api/scores', {
        sessionId: state.sessionId,
        phase: 'morning',
        scores,
      });
    } catch (err) {
      console.error('Pulse save error:', err);
    }
    pulseEl.remove();
    await openCheckin();
  });

  $('pulse-skip-btn').addEventListener('click', async () => {
    pulseEl.remove();
    await openCheckin();
  });
}

async function openCheckin() {
  state.checkinStartTime = Date.now();
  state.timerNudgeShown = false;
  appendTypingIndicator('checkin-typing', els.messages);
  try {
    await streamResponse('/api/session/open', { sessionId: state.sessionId }, 'checkin-typing', els.messages);
  } catch (err) {
    removeTypingIndicator('checkin-typing');
    console.error('Open check-in error:', err);
  }
}

// ── Done state ─────────────────────────────────────────────────────────────

function renderCheckinDoneState() {
  if (els.checkinInputArea) {
    els.checkinInputArea.style.display = 'none';
  }
}

// ── Snapshot status ────────────────────────────────────────────────────────

async function checkSnapshotStatus() {
  try {
    const data = await get('/api/snapshot/status');
    if (!data.available) {
      showStatus('No Notes/Reminders data — Mac agent not running', true);
    } else if (data.age_minutes > 120) {
      showStatus(`Notes/Reminders snapshot ${data.age_minutes}m old — Mac agent may be paused`, true);
    }
  } catch {}
}

// ── Messaging ──────────────────────────────────────────────────────────────

function appendMessage(role, content, animate = true) {
  // Always routes to check-in messages (used by loadSession for check-in history)
  return appendMessageToContainer(role, content, els.messages);
}

function appendMessageToContainer(role, content, container) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'assistant') {
    bubble.innerHTML = renderMarkdown(content);
  } else {
    bubble.textContent = content;
  }

  div.appendChild(bubble);
  container.appendChild(div);
  scrollToBottom(container);
  return div;
}

function appendTypingIndicator(id, container) {
  const existing = document.getElementById(id);
  if (existing) return;

  const div = document.createElement('div');
  div.className = 'message assistant typing-indicator';
  div.id = id;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

  div.appendChild(bubble);
  container.appendChild(div);
  scrollToBottom(container);
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom(container) {
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

// ── SSE Streaming ──────────────────────────────────────────────────────────

async function streamResponse(url, body, typingId, container) {
  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`${res.status}`);

      removeTypingIndicator(typingId);

      const msgDiv = document.createElement('div');
      msgDiv.className = 'message assistant';
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      msgDiv.appendChild(bubble);
      container.appendChild(msgDiv);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw);
            if (parsed.text) {
              fullText += parsed.text;
              bubble.innerHTML = renderMarkdown(fullText);
              scrollToBottom(container);
            }
            if (parsed.done || parsed.error) {
              resolve(fullText);
              return;
            }
          } catch {}
        }
      }

      resolve(fullText);
    }).catch(reject);
  });
}

// ── Morning Check-In ──────────────────────────────────────────────────────

async function sendCheckinMessage() {
  const text = els.chatInput.value.trim();
  if (!text || state.isStreaming) return;

  state.isStreaming = true;
  els.sendBtn.disabled = true;
  els.chatInput.value = '';
  autoResizeTextarea(els.chatInput);

  appendMessageToContainer('user', text, els.messages);
  appendTypingIndicator('checkin-typing', els.messages);

  try {
    await streamResponse(
      '/api/chat',
      { message: text, sessionId: state.sessionId },
      'checkin-typing',
      els.messages
    );

    // Timer nudge — after 5 minutes of check-in
    if (state.checkinStartTime && !state.timerNudgeShown) {
      const elapsed = Date.now() - state.checkinStartTime;
      if (elapsed > 5 * 60 * 1000) {
        state.timerNudgeShown = true;
        appendMessageToContainer('assistant', "You've covered good ground. Ready to generate your dashboard?", els.messages);
      }
    }
  } catch (err) {
    removeTypingIndicator('checkin-typing');
    appendMessageToContainer('assistant', 'Sorry, something went wrong. Please try again.', els.messages);
    console.error('Chat error:', err);
  } finally {
    state.isStreaming = false;
    els.sendBtn.disabled = false;
    els.chatInput.focus();
  }
}

// ── Midday Chat ────────────────────────────────────────────────────────────

async function sendMiddayMessage() {
  const text = els.middayInput.value.trim();
  if (!text || state.isStreaming) return;

  state.isStreaming = true;
  els.middaySendBtn.disabled = true;
  els.middayInput.value = '';
  autoResizeTextarea(els.middayInput);

  appendMessageToContainer('user', text, els.middayMessages);
  appendTypingIndicator('midday-typing', els.middayMessages);

  try {
    const fullResponse = await streamResponse(
      '/api/midday/chat',
      { message: text, history: state.middayHistory },
      'midday-typing',
      els.middayMessages
    );
    state.middayHistory.push({ role: 'user', content: text });
    state.middayHistory.push({ role: 'assistant', content: fullResponse });
  } catch (err) {
    removeTypingIndicator('midday-typing');
    appendMessageToContainer('assistant', 'Something went wrong. Please try again.', els.middayMessages);
  } finally {
    state.isStreaming = false;
    els.middaySendBtn.disabled = false;
    els.middayInput.focus();
  }
}

// ── Reflect Chat ───────────────────────────────────────────────────────────

async function sendReflectMessage() {
  const text = els.reflectInput.value.trim();
  if (!text || state.isStreaming) return;

  state.isStreaming = true;
  els.reflectSendBtn.disabled = true;
  els.reflectInput.value = '';
  autoResizeTextarea(els.reflectInput);

  appendMessageToContainer('user', text, els.reflectMessages);
  appendTypingIndicator('reflect-typing', els.reflectMessages);

  try {
    const fullResponse = await streamResponse(
      '/api/reflect/chat',
      { message: text, history: state.reflectHistory },
      'reflect-typing',
      els.reflectMessages
    );
    state.reflectHistory.push({ role: 'user', content: text });
    state.reflectHistory.push({ role: 'assistant', content: fullResponse });
  } catch (err) {
    removeTypingIndicator('reflect-typing');
    appendMessageToContainer('assistant', 'Something went wrong. Please try again.', els.reflectMessages);
  } finally {
    state.isStreaming = false;
    els.reflectSendBtn.disabled = false;
    els.reflectInput.focus();
  }
}

// ── Dashboard ──────────────────────────────────────────────────────────────

async function generateDashboard() {
  if (state.dashboardGenerated) {
    showPrimaryView('dashboard');
    return;
  }

  els.dashContent.innerHTML = '<div class="dashboard-loading"><div class="spinner"></div><p>Generating your dashboard…</p></div>';
  showPrimaryView('dashboard');

  try {
    const { dashboard } = await post('/api/dashboard/generate', { sessionId: state.sessionId });
    renderDashboard(dashboard);
    state.dashboardGenerated = true;
    state.sessionStatus = 'dashboard';

    appendMessageToContainer('assistant', 'Go well.', els.messages);
    renderCheckinDoneState();

    // Show evening prompt if it's after 3:30PM
    const after330PM = state.nzHour > 15 || (state.nzHour === 15 && state.nzMinute >= 30);
    if (after330PM && state.sessionStatus !== 'complete') {
      showEveningPromptBanner();
    }
  } catch (err) {
    els.dashContent.innerHTML = `<div class="empty-state"><p>Failed to generate dashboard.</p><p class="muted">${err.message}</p></div>`;
    console.error('Dashboard error:', err);
  }
}

function renderDashboard(markdown) {
  // Parse sections by ## headings, storing both full (with h2) and body (without h2)
  const sectionMap = {};
  const rawSections = ('\n' + markdown).split(/\n(?=## )/);

  rawSections.forEach((raw) => {
    const lines = raw.split('\n');
    const nameMatch = lines[0].match(/^## (.+)$/);
    if (!nameMatch) return;
    const name = nameMatch[1].trim();
    const bodyRaw = lines.slice(1).join('\n').trim();
    sectionMap[name] = {
      full: renderMarkdown(raw.trim()),
      body: renderMarkdown(bodyRaw),
    };
  });

  // 4 primary sections — shown without h2 headers
  const PRIMARY = ["One Degree", "Today's Three", "Today's Awareness", "Aim & Practice"];
  // Everything else behind "More"
  const MORE = [
    'Broader Triage', 'Body & Biometrics', 'Comms & Calendar',
    'Neurobiological Insight', 'Growth Edge', 'Patterns Worth Noticing',
    'Relationships', 'Evening Intention',
  ];

  const primaryHtml = PRIMARY
    .map((name) => {
      const sec = sectionMap[name];
      if (!sec) return '';
      return `<div class="dash-primary-section">${sec.body}</div>`;
    })
    .join('');

  const moreHtml = MORE
    .map((name) => {
      const sec = sectionMap[name];
      if (!sec) return '';
      return `<div class="dash-more-section">${sec.full}</div>`;
    })
    .join('');

  els.dashContent.innerHTML =
    primaryHtml +
    `<div class="dash-toggle-row"><button class="dash-toggle-btn" id="more-sections-btn" onclick="toggleMoreSections()">More</button></div>` +
    `<div id="more-sections-content" class="hidden">${moreHtml}</div>`;
}

window.toggleMoreSections = function () {
  const content = $('more-sections-content');
  const btn = $('more-sections-btn');
  if (!content || !btn) return;
  const isHidden = content.classList.contains('hidden');
  content.classList.toggle('hidden', !isHidden);
  btn.textContent = isHidden ? 'Less' : 'More';
};

// ── Evening Review ─────────────────────────────────────────────────────────

async function startEveningReview() {
  if (state.eveningStarted) return;
  state.eveningStarted = true;

  appendTypingIndicator('evening-typing', els.eveningMessages);

  try {
    await streamResponse(
      '/api/evening/chat',
      { sessionId: state.sessionId },
      'evening-typing',
      els.eveningMessages
    );
  } catch (err) {
    removeTypingIndicator('evening-typing');
    console.error('Evening start error:', err);
  }
}

async function sendEveningMessage() {
  const text = els.eveningInput.value.trim();
  if (!text || state.isStreaming) return;

  state.isStreaming = true;
  els.eveningSendBtn.disabled = true;
  els.eveningInput.value = '';
  autoResizeTextarea(els.eveningInput);

  appendMessageToContainer('user', text, els.eveningMessages);
  appendTypingIndicator('evening-typing', els.eveningMessages);

  try {
    await streamResponse(
      '/api/evening/chat',
      { message: text, sessionId: state.sessionId },
      'evening-typing',
      els.eveningMessages
    );
  } catch (err) {
    removeTypingIndicator('evening-typing');
    appendMessageToContainer('assistant', 'Something went wrong. Please try again.', els.eveningMessages);
  } finally {
    state.isStreaming = false;
    els.eveningSendBtn.disabled = false;
  }
}

async function completeDay() {
  if (!confirm('Mark today as complete and save the day summary?')) return;

  showLoading(true);
  try {
    const { summary } = await post('/api/evening/complete', { sessionId: state.sessionId });
    appendMessageToContainer('assistant',
      `Day complete. Summary saved for tomorrow:\n\n${summary}`,
      els.eveningMessages
    );
    els.completeDayBtn.disabled = true;
    els.completeDayBtn.textContent = 'Day completed ✓';
    state.sessionStatus = 'complete';
    // Hide evening prompt banner
    els.eveningPrompt.classList.add('hidden');
  } catch (err) {
    alert('Error completing day: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ── Orientation ────────────────────────────────────────────────────────────

async function loadOrientation() {
  try {
    const { content } = await get('/api/orientation');
    els.orientationDisplay.textContent = content || '(no orientation document set)';
    els.orientationTextarea.value = content || '';
  } catch {
    els.orientationDisplay.textContent = 'Could not load.';
  }
}

function showOrientationEditor() {
  els.orientationEditor.classList.remove('hidden');
  els.orientationDisplay.classList.add('hidden');
  els.orientationEditBtn.textContent = 'Cancel';
  els.orientationTextarea.focus();
}

function hideOrientationEditor() {
  els.orientationEditor.classList.add('hidden');
  els.orientationDisplay.classList.remove('hidden');
  els.orientationEditBtn.textContent = 'Edit';
}

async function saveOrientation() {
  const content = els.orientationTextarea.value.trim();
  try {
    await put('/api/orientation', { content });
    els.orientationDisplay.textContent = content || '(empty)';
    hideOrientationEditor();
  } catch (err) {
    alert('Error saving orientation: ' + err.message);
  }
}

// ── Secondary Panel ────────────────────────────────────────────────────────

function openSecondary(sec) {
  sec = sec || state.currentSecondary;
  state.currentSecondary = sec;
  state.secondaryOpen = true;

  els.secondaryPanel.classList.remove('hidden');
  els.secondaryOverlay.classList.remove('hidden');

  // Switch to the correct tab content
  switchSecondaryTab(sec);

  // Evening warmth for evening and reflect
  document.body.classList.toggle('evening-mode', sec === 'evening' || sec === 'reflect');

  if (sec === 'evening' && !state.eveningStarted) {
    startEveningReview();
  }
  if (sec === 'reflect') {
    loadOrientation();
  }
}

function closeSecondary() {
  state.secondaryOpen = false;
  els.secondaryPanel.classList.add('hidden');
  els.secondaryOverlay.classList.add('hidden');
  document.body.classList.remove('evening-mode');
}

function switchSecondaryTab(sec) {
  state.currentSecondary = sec;

  // Update tab buttons
  document.querySelectorAll('.secondary-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.sec === sec);
  });

  // Show/hide content
  ['sec-evening', 'sec-midday', 'sec-reflect'].forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle('hidden', id !== `sec-${sec}`);
  });

  // Evening warmth
  document.body.classList.toggle('evening-mode', sec === 'evening' || sec === 'reflect');

  if (sec === 'evening' && !state.eveningStarted) {
    startEveningReview();
  }
  if (sec === 'reflect') {
    loadOrientation();
  }
}

// ── Settings Panel ─────────────────────────────────────────────────────────

async function openSettings() {
  els.settingsPanel.classList.remove('hidden');
  els.settingsOverlay.classList.remove('hidden');
  await Promise.all([loadAccounts(), loadOuraStatus(), loadAgentStatus(), loadTrackedItems()]);
}

function closeSettings() {
  els.settingsPanel.classList.add('hidden');
  els.settingsOverlay.classList.add('hidden');
}

async function loadAccounts() {
  try {
    const { accounts } = await get('/api/accounts');
    if (accounts.length === 0) {
      els.accountsList.innerHTML = '<p class="muted" style="font-size:14px">No Google accounts connected.</p>';
      return;
    }
    els.accountsList.innerHTML = accounts.map((a) => `
      <div class="account-row">
        <div class="account-info">
          <div>${a.email}</div>
          ${a.label ? `<div class="account-label">${a.label}</div>` : ''}
        </div>
        <button class="btn-danger" onclick="disconnectAccount('${a.email}')">Remove</button>
      </div>
    `).join('');
  } catch {
    els.accountsList.innerHTML = '<p class="muted">Could not load accounts.</p>';
  }
}

window.disconnectAccount = async function (email) {
  if (!confirm(`Remove ${email}?`)) return;
  await del(`/api/accounts/${encodeURIComponent(email)}`);
  await loadAccounts();
};

async function loadOuraStatus() {
  try {
    const { configured, connected } = await get('/api/oura/status');
    if (!configured) {
      els.ouraStatus.className = 'agent-status missing';
      els.ouraStatus.textContent = 'OURA_CLIENT_ID / OURA_CLIENT_SECRET not set in environment';
      els.ouraConnectRow.innerHTML = '';
    } else if (connected) {
      els.ouraStatus.className = 'agent-status ok';
      els.ouraStatus.textContent = 'Connected — biometrics available';
      els.ouraConnectRow.innerHTML = `<button class="btn-danger" onclick="disconnectOura()">Disconnect Oura</button>`;
    } else {
      els.ouraStatus.className = 'agent-status missing';
      els.ouraStatus.textContent = 'Not connected';
      els.ouraConnectRow.innerHTML = `<button class="btn-secondary" onclick="connectOura()">Connect Oura Ring</button>`;
    }
  } catch {
    els.ouraStatus.textContent = 'Could not check Oura status';
  }
}

window.connectOura = function () {
  window.location.href = '/auth/oura';
};

window.disconnectOura = async function () {
  if (!confirm('Disconnect Oura Ring?')) return;
  await del('/api/oura');
  await loadOuraStatus();
};

async function loadAgentStatus() {
  try {
    const data = await get('/api/snapshot/status');
    if (!data.available) {
      els.agentStatus.className = 'agent-status missing';
      els.agentStatus.textContent = 'No snapshot received — Mac agent not running';
    } else if (data.age_minutes > 120) {
      els.agentStatus.className = 'agent-status stale';
      els.agentStatus.textContent = `Last snapshot ${data.age_minutes}m ago — agent may be paused`;
    } else {
      els.agentStatus.className = 'agent-status ok';
      els.agentStatus.textContent = `Active — ${data.note_count} notes, ${data.reminder_count} reminders (${data.age_minutes}m ago)`;
    }
  } catch {
    els.agentStatus.textContent = 'Could not check agent status';
  }
}

async function loadTrackedItems() {
  try {
    const { items } = await get('/api/tracked-items');
    if (items.length === 0) {
      els.trackedItemsList.innerHTML = '<p class="muted" style="font-size:14px">No open tracked items.</p>';
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    els.trackedItemsList.innerHTML = items.map((item) => {
      const days = Math.round((new Date(today) - new Date(item.first_seen)) / 86400000);
      return `
        <div class="tracked-item-row" id="tracked-${item.id}">
          <span class="item-desc">${escapeHtml(item.description)}</span>
          <span class="item-age">${days}d</span>
          <button class="resolve-btn" onclick="resolveItem(${item.id})">Resolve</button>
        </div>
      `;
    }).join('');
  } catch {
    els.trackedItemsList.innerHTML = '<p class="muted">Could not load items.</p>';
  }
}

window.resolveItem = async function (id) {
  await patch(`/api/tracked-items/${id}/resolve`);
  const el = document.getElementById(`tracked-${id}`);
  if (el) el.remove();
};

// ── Utility ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showStatus(msg, isWarning = false) {
  els.checkinStatus.textContent = msg;
  els.checkinStatus.className = `status-bar${isWarning ? ' warning' : ''}`;
  els.checkinStatus.classList.remove('hidden');
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

function showLoading(show) {
  els.loading.classList.toggle('hidden', !show);
}

// ── Event Listeners ────────────────────────────────────────────────────────

// Check-in
els.sendBtn.addEventListener('click', sendCheckinMessage);
els.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCheckinMessage();
  }
});
els.chatInput.addEventListener('input', () => autoResizeTextarea(els.chatInput));

// Generate dashboard
els.genDashBtn.addEventListener('click', generateDashboard);
els.quickModeBtn.addEventListener('click', generateDashboard);

// Evening prompt banner → open secondary at Evening tab
els.eveningPromptBtn.addEventListener('click', () => openSecondary('evening'));

// More bar
els.moreBtn.addEventListener('click', () => openSecondary(state.currentSecondary));

// Secondary panel tabs
document.querySelectorAll('.secondary-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchSecondaryTab(tab.dataset.sec));
});

// Close secondary
els.closeSecondaryBtn.addEventListener('click', closeSecondary);
els.secondaryOverlay.addEventListener('click', closeSecondary);

// Evening
els.eveningSendBtn.addEventListener('click', sendEveningMessage);
els.eveningInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendEveningMessage();
  }
});
els.eveningInput.addEventListener('input', () => autoResizeTextarea(els.eveningInput));
els.completeDayBtn.addEventListener('click', completeDay);

// Midday
els.middaySendBtn.addEventListener('click', sendMiddayMessage);
els.middayInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMiddayMessage();
  }
});
els.middayInput.addEventListener('input', () => autoResizeTextarea(els.middayInput));

// Reflect
els.reflectSendBtn.addEventListener('click', sendReflectMessage);
els.reflectInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendReflectMessage();
  }
});
els.reflectInput.addEventListener('input', () => autoResizeTextarea(els.reflectInput));

// Orientation
els.orientationEditBtn.addEventListener('click', () => {
  if (els.orientationEditor.classList.contains('hidden')) {
    showOrientationEditor();
  } else {
    hideOrientationEditor();
  }
});
els.orientationSaveBtn.addEventListener('click', saveOrientation);
els.orientationCancelBtn.addEventListener('click', hideOrientationEditor);
els.orientationDisplay.addEventListener('click', () => {
  els.orientationDisplay.classList.toggle('expanded');
});

// Settings
els.menuBtn.addEventListener('click', openSettings);
els.closeSettings.addEventListener('click', closeSettings);
els.settingsOverlay.addEventListener('click', closeSettings);

els.connectGoogleBtn.addEventListener('click', () => {
  const label = els.accountLabel.value.trim();
  window.location.href = `/auth/google${label ? `?label=${encodeURIComponent(label)}` : ''}`;
});

els.addTrackedBtn.addEventListener('click', async () => {
  const desc = els.newTrackedItem.value.trim();
  if (!desc) return;
  await post('/api/tracked-items', { description: desc, sessionId: state.sessionId });
  els.newTrackedItem.value = '';
  await loadTrackedItems();
});

els.newTrackedItem.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.addTrackedBtn.click();
});

// ── Init ───────────────────────────────────────────────────────────────────

loadSession();

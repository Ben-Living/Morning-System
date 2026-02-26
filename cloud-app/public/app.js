/* ── Morning System — Browser App ────────────────────────────────────────── */

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
  currentView: 'checkin',
  isStreaming: false,
  dashboardGenerated: false,
  eveningStarted: false,
  currentScorePhase: 'morning',
  // Midday & Reflect use ephemeral in-memory history
  middayHistory: [],
  reflectHistory: [],
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const els = {
  headerDate: $('header-date'),
  // Check-in
  messages: $('messages'),
  chatInput: $('chat-input'),
  sendBtn: $('send-btn'),
  genDashBtn: $('gen-dashboard-btn'),
  genDashBtn2: $('gen-dashboard-btn-2'),
  checkinStatus: $('checkin-status'),
  scoreMorningBtn: $('score-morning-btn'),
  // Dashboard
  dashContent: $('dashboard-content'),
  // Midday
  middayMessages: $('midday-messages'),
  middayInput: $('midday-input'),
  middaySendBtn: $('midday-send-btn'),
  // Evening
  eveningMessages: $('evening-messages'),
  eveningInput: $('evening-input'),
  eveningSendBtn: $('evening-send-btn'),
  completeDayBtn: $('complete-day-btn'),
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
  trackedItemsList: $('tracked-items-list'),
  newTrackedItem: $('new-tracked-item'),
  addTrackedBtn: $('add-tracked-btn'),
  loading: $('loading'),
  // Scoring
  scoreModal: $('score-modal'),
  scoreModalOverlay: $('score-modal-overlay'),
  scoreModalClose: $('score-modal-close'),
  scoreSliders: $('score-sliders'),
  scoreSubmitBtn: $('score-submit-btn'),
  // Aims
  aimDisplay: $('aim-display'),
  aimForm: $('aim-form'),
  aimHeartWish: $('aim-heart-wish'),
  aimStatement: $('aim-statement'),
  aimStartDate: $('aim-start-date'),
  aimEndDate: $('aim-end-date'),
  aimAccountability: $('aim-accountability'),
  aimSaveBtn: $('aim-save-btn'),
  aimCancelBtn: $('aim-cancel-btn'),
  aimNewBtn: $('aim-new-btn'),
};

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
    const { session, messages } = await get('/api/session/today');
    state.sessionId = session.id;
    state.sessionDate = session.date;
    state.sessionStatus = session.status;

    const d = new Date(session.date);
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

    if (messages.length === 0) {
      await openCheckin();
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has('connected')) {
      showStatus(`Connected ${decodeURIComponent(params.get('connected'))}`, false);
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

async function openCheckin() {
  appendTypingIndicator('checkin-typing', els.messages);
  try {
    await streamResponse('/api/session/open', { sessionId: state.sessionId }, 'checkin-typing', els.messages);
  } catch (err) {
    removeTypingIndicator('checkin-typing');
    console.error('Open check-in error:', err);
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

  // Route to appropriate container
  let container;
  if (state.currentView === 'evening') container = els.eveningMessages;
  else if (state.currentView === 'midday') container = els.middayMessages;
  else if (state.currentView === 'reflect') container = els.reflectMessages;
  else container = els.messages;

  container.appendChild(div);
  scrollToBottom(container);
  return div;
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
    // Update ephemeral history
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
    switchView('dashboard');
    return;
  }

  els.dashContent.innerHTML = '<div class="dashboard-loading"><div class="spinner"></div><p>Generating your dashboard…</p></div>';
  switchView('dashboard');

  try {
    const { dashboard } = await post('/api/dashboard/generate', { sessionId: state.sessionId });
    renderDashboard(dashboard);
    state.dashboardGenerated = true;
    state.sessionStatus = 'dashboard';
  } catch (err) {
    els.dashContent.innerHTML = `<div class="empty-state"><p>Failed to generate dashboard.</p><p class="muted">${err.message}</p></div>`;
    console.error('Dashboard error:', err);
  }
}

function renderDashboard(markdown) {
  const fullHtml = renderMarkdown(markdown);

  // Split at the 5th <h2> — everything from there is collapsed
  let h2Count = 0;
  let searchIdx = 0;
  while (h2Count < 4) {
    const idx = fullHtml.indexOf('<h2>', searchIdx);
    if (idx === -1) break;
    h2Count++;
    searchIdx = idx + 4;
  }

  const splitIdx = fullHtml.indexOf('<h2>', searchIdx);

  if (splitIdx === -1) {
    // Fewer than 5 sections — show everything
    els.dashContent.innerHTML = fullHtml;
    return;
  }

  const visible = fullHtml.slice(0, splitIdx);
  const collapsed = fullHtml.slice(splitIdx);

  els.dashContent.innerHTML =
    visible +
    `<div class="dash-toggle-row"><button class="dash-toggle-btn" id="dash-toggle-btn" onclick="toggleDashMore()">Show more</button></div>` +
    `<div id="dash-more" class="hidden">${collapsed}</div>`;
}

window.toggleDashMore = function () {
  const more = document.getElementById('dash-more');
  const btn = document.getElementById('dash-toggle-btn');
  if (!more || !btn) return;
  const isHidden = more.classList.contains('hidden');
  more.classList.toggle('hidden', !isHidden);
  btn.textContent = isHidden ? 'Show less' : 'Show more';
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

// ── View Switching ─────────────────────────────────────────────────────────

function switchView(view) {
  state.currentView = view;

  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === view);
  });

  document.querySelectorAll('.view').forEach((v) => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });

  const target = document.getElementById(`view-${view}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }

  if (view === 'evening' && !state.eveningStarted) {
    startEveningReview();
  }

  if (view === 'dashboard') {
    fetchAndRenderChart();
  }

  if (view === 'reflect') {
    loadOrientation();
  }
}

// ── Life Wheel Radar Chart ──────────────────────────────────────────────────

let lifeWheelChart = null;

const CHART_LABELS = [
  'Health', 'Career', 'Finances', 'Relations',
  'Growth', 'Fun/Rec', 'Environment', 'Spirit',
  'Contribution', 'Intimacy',
];

const CHART_FULL_CATEGORIES = [
  'Health and Well-being', 'Career or Work', 'Finances', 'Relationships',
  'Personal Growth', 'Fun and Recreation', 'Physical Environment',
  'Spirituality or Faith', 'Contribution and Service', 'Love and Intimacy',
];

const CHART_COLORS = [
  { line: '#8B7355', fill: 'rgba(139,115,85,0.15)' },
  { line: '#A89070', fill: 'rgba(168,144,112,0.10)' },
  { line: '#C4AE8A', fill: 'rgba(196,174,138,0.08)' },
];

async function fetchAndRenderChart() {
  const canvas = document.getElementById('life-wheel-canvas');
  const container = document.getElementById('chart-container');
  if (!canvas || !container) return;

  try {
    const { scores } = await get('/api/scores?days=14');
    if (!scores || scores.length === 0) {
      container.classList.add('hidden');
      return;
    }

    const dateMap = new Map();
    scores.forEach((entry) => {
      if (!dateMap.has(entry.date)) dateMap.set(entry.date, {});
      if (!dateMap.get(entry.date).morning || entry.phase === 'morning') {
        dateMap.get(entry.date)[entry.phase] = entry;
      }
    });

    const sortedDates = [...dateMap.keys()].sort().reverse().slice(0, 3);
    if (sortedDates.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    const today = new Date().toISOString().slice(0, 10);
    const datasets = sortedDates.map((date, idx) => {
      const dayData = dateMap.get(date);
      const entry = dayData.morning || dayData.evening || Object.values(dayData)[0];
      const data = CHART_FULL_CATEGORIES.map((cat) => entry.scores[cat] ?? 0);
      const label = date === today ? 'Today' : date === sortedDates[1] && idx === 1 ? 'Yesterday' : date;

      return {
        label,
        data,
        borderColor: CHART_COLORS[idx].line,
        backgroundColor: CHART_COLORS[idx].fill,
        pointBackgroundColor: CHART_COLORS[idx].line,
        pointRadius: 3,
        borderWidth: idx === 0 ? 2 : 1.5,
      };
    });

    if (lifeWheelChart) {
      lifeWheelChart.destroy();
      lifeWheelChart = null;
    }

    lifeWheelChart = new Chart(canvas, {
      type: 'radar',
      data: { labels: CHART_LABELS, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            min: 0,
            max: 10,
            ticks: {
              stepSize: 2,
              font: { size: 10, family: "'IBM Plex Mono', monospace" },
              backdropColor: 'transparent',
              color: '#AEA89E',
            },
            pointLabels: {
              font: { size: 11, family: "'IBM Plex Mono', monospace" },
              color: '#7A7167',
            },
            grid: { color: 'rgba(0,0,0,0.06)' },
            angleLines: { color: 'rgba(0,0,0,0.06)' },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { size: 11, family: "'IBM Plex Mono', monospace" },
              padding: 12,
              boxWidth: 10,
              color: '#7A7167',
            },
          },
        },
      },
    });
  } catch (err) {
    console.error('Chart render error:', err);
  }
}

// ── Settings Panel ─────────────────────────────────────────────────────────

async function openSettings() {
  els.settingsPanel.classList.remove('hidden');
  els.settingsOverlay.classList.remove('hidden');
  await Promise.all([loadAccounts(), loadAgentStatus(), loadTrackedItems(), loadCurrentAim()]);
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

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Status bar ─────────────────────────────────────────────────────────────

function showStatus(msg, isWarning = false) {
  els.checkinStatus.textContent = msg;
  els.checkinStatus.className = `status-bar${isWarning ? ' warning' : ''}`;
  els.checkinStatus.classList.remove('hidden');
}

// ── Textarea auto-resize ───────────────────────────────────────────────────

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

// ── Loading ────────────────────────────────────────────────────────────────

function showLoading(show) {
  els.loading.classList.toggle('hidden', !show);
}

// ── Life Wheel Scoring ─────────────────────────────────────────────────────

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

function openScoreModal(phase) {
  state.currentScorePhase = phase;
  els.scoreSliders.innerHTML = LIFE_WHEEL_CATEGORIES.map((cat) => `
    <div class="score-row">
      <label class="score-label">${escapeHtml(cat)}</label>
      <div class="score-input-group">
        <input type="range" min="1" max="10" value="5" class="score-range" data-category="${escapeHtml(cat)}" id="score-${cat.replace(/\s+/g, '-')}" />
        <span class="score-value" id="val-${cat.replace(/\s+/g, '-')}">5</span>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.score-range').forEach((input) => {
    const valId = 'val-' + input.dataset.category.replace(/\s+/g, '-');
    input.addEventListener('input', () => {
      document.getElementById(valId).textContent = input.value;
    });
  });

  els.scoreModal.classList.remove('hidden');
  els.scoreModalOverlay.classList.remove('hidden');
}

function closeScoreModal() {
  els.scoreModal.classList.add('hidden');
  els.scoreModalOverlay.classList.add('hidden');
}

async function submitScores() {
  const scores = {};
  document.querySelectorAll('.score-range').forEach((input) => {
    scores[input.dataset.category] = parseInt(input.value, 10);
  });

  try {
    await post('/api/scores', {
      sessionId: state.sessionId,
      phase: state.currentScorePhase,
      scores,
    });
    closeScoreModal();
    showStatus('Scores saved.', false);
    if (state.currentView === 'dashboard') {
      fetchAndRenderChart();
    }
  } catch (err) {
    alert('Error saving scores: ' + err.message);
  }
}

// ── Aims ───────────────────────────────────────────────────────────────────

let currentAimId = null;

async function loadCurrentAim() {
  try {
    const { aim } = await get('/api/aims/current');
    currentAimId = aim ? aim.id : null;

    if (aim) {
      const ageMs = Date.now() - new Date(aim.start_date).getTime();
      const days = Math.round(ageMs / 86400000);
      els.aimDisplay.innerHTML = `
        <div class="aim-card">
          ${aim.heart_wish ? `<p class="aim-heart-wish">"${escapeHtml(aim.heart_wish)}"</p>` : ''}
          <p class="aim-statement">${escapeHtml(aim.aim_statement)}</p>
          <p class="muted" style="font-size:13px">
            Started: ${aim.start_date}${aim.end_date ? ` · Ends: ${aim.end_date}` : ''} · Day ${days}
            ${aim.accountability_person ? `<br>Accountable to: ${escapeHtml(aim.accountability_person)}` : ''}
          </p>
          <div class="connect-row" style="margin-top:8px">
            <button class="btn-secondary" onclick="openReflectModal()">Reflect today</button>
            <button class="btn-danger" onclick="completeAim()">Mark complete</button>
          </div>
        </div>
      `;
    } else {
      els.aimDisplay.innerHTML = '<p class="muted" style="font-size:14px">No active aim. Use the morning or evening conversation to explore what your heart is wanting, then set it here.</p>';
    }
  } catch {
    els.aimDisplay.innerHTML = '<p class="muted">Could not load aim.</p>';
  }
}

function showAimForm() {
  const today = new Date().toISOString().slice(0, 10);
  els.aimStartDate.value = today;
  els.aimForm.classList.remove('hidden');
  $('aim-actions').classList.add('hidden');
}

function hideAimForm() {
  els.aimForm.classList.add('hidden');
  $('aim-actions').classList.remove('hidden');
}

async function saveAim() {
  const aimStatement = els.aimStatement.value.trim();
  if (!aimStatement) {
    alert('Please enter an aim statement.');
    return;
  }

  try {
    await post('/api/aims', {
      heart_wish: els.aimHeartWish.value.trim() || null,
      aim_statement: aimStatement,
      start_date: els.aimStartDate.value || new Date().toISOString().slice(0, 10),
      end_date: els.aimEndDate.value || null,
      accountability_person: els.aimAccountability.value.trim() || null,
    });
    hideAimForm();
    els.aimHeartWish.value = '';
    els.aimStatement.value = '';
    els.aimEndDate.value = '';
    els.aimAccountability.value = '';
    await loadCurrentAim();
  } catch (err) {
    alert('Error saving aim: ' + err.message);
  }
}

window.completeAim = async function () {
  if (!currentAimId) return;
  if (!confirm('Mark this aim as complete?')) return;
  await patch(`/api/aims/${currentAimId}`, { status: 'completed' });
  await loadCurrentAim();
};

window.openReflectModal = function () {
  if (!currentAimId) return;
  const practiceHappened = confirm('Did you engage with your aim practice today?\n\nOK = Yes, Cancel = No');
  const reflection = prompt('One-line reflection (optional):') || '';
  post(`/api/aims/${currentAimId}/reflect`, {
    reflection,
    practice_happened: practiceHappened,
  }).then(() => showStatus('Reflection saved.', false)).catch(() => {});
};

// ── Event Listeners ────────────────────────────────────────────────────────

// Tab switching
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

// Check-in
els.sendBtn.addEventListener('click', sendCheckinMessage);
els.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCheckinMessage();
  }
});
els.chatInput.addEventListener('input', () => autoResizeTextarea(els.chatInput));

// Quick actions
document.querySelectorAll('.quick-btn[data-msg]').forEach((btn) => {
  btn.addEventListener('click', () => {
    els.chatInput.value = btn.dataset.msg;
    sendCheckinMessage();
  });
});

els.genDashBtn.addEventListener('click', generateDashboard);
els.genDashBtn2.addEventListener('click', generateDashboard);

// Scoring
els.scoreMorningBtn.addEventListener('click', () => openScoreModal('morning'));
els.scoreModalClose.addEventListener('click', closeScoreModal);
els.scoreModalOverlay.addEventListener('click', closeScoreModal);
els.scoreSubmitBtn.addEventListener('click', submitScores);

// Midday
els.middaySendBtn.addEventListener('click', sendMiddayMessage);
els.middayInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMiddayMessage();
  }
});
els.middayInput.addEventListener('input', () => autoResizeTextarea(els.middayInput));

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

// Aims
els.aimNewBtn.addEventListener('click', showAimForm);
els.aimCancelBtn.addEventListener('click', hideAimForm);
els.aimSaveBtn.addEventListener('click', saveAim);

// ── Init ───────────────────────────────────────────────────────────────────

loadSession();
